'use strict';

let path = require('path')
let extend = require('extend')
const zlib = require('zlib')
const _ = require('lodash')
var aws = require('aws-sdk')
var lambda = new aws.Lambda()
var kplAgg = require('aws-kinesis-agg');
var log = require(path.join(__dirname, '.', 'log.js'));
var Promise = require("bluebird")
let ElasticTractor = require(path.join(__dirname, '.', 'elastictractor.js'))

aws.config.setPromisesDependency(require('bluebird'));

let elasticTractor = function (parameters) {
  this.params = extend({
      maxKinesisEvents: 50,
      concurrencyLambdaCall: 100,
      elkHost: undefined,
      elkVersion: 0,
      cloudId: undefined,
      username: undefined,
      password: undefined,
      logName: "elastic-tractor",
      logLevel: "info",
      parseTimeout: 30000
    }, parameters);
  this._logger = log(this.params);
}

elasticTractor.prototype.handler = function(event, context, callback) {
  var self = this

  self._deaggregatedKpl = function(clonedEvent, kinesisEvent) {
    return new Promise((resolve, reject) => {
      var buffer = Buffer.from(kinesisEvent.data, 'base64')
      // If it's an aggregated record
      if (buffer.slice(0, 4).toString('hex') === "f3899ac2") {
        kplAgg.deaggregateSync(kinesisEvent, true, function(err, records) {
          if (err) {
            reject(err);
          } else {
            var newRecords = [];
            records.forEach(record => {
              // Append data
              _.extend(clonedEvent.kinesis, {
                "data": Buffer.from(record.data, 'base64').toString(),
                "partitionKey": `${kinesisEvent.partitionKey}-${record.partitionKey}`
              })
              newRecords.add(_.cloneDeep(clonedEvent));
            })
            resolve(newRecords);
          }
        });
      } else {
        // Append data
        _.extend(clonedEvent.kinesis, {
          "data": buffer.toString(),
          "partitionKey": kinesisEvent.partitionKey
        })
        resolve([_.cloneDeep(clonedEvent)]);
      }
    })
  }

  self._prepareKinesisChunk = function(kinesisEvents, maxEvents) {
    return new Promise((resolve, reject) => {
      var groupByKinesisEvents = _.flatMap(_.groupBy(kinesisEvents, function(value) {
        return `${value.eventSourceARN}-${value.kinesis.partitionKey}`
      }), function(o) {return [o]})

      Promise.map(groupByKinesisEvents, function(groupedEvents) {
        var joined = _.cloneDeep(_.head(groupedEvents))
        delete joined.kinesis.data
        var deAggPromises = []
        groupedEvents.forEach(kinesisEvent => {
          deAggPromises.add(self._deaggregatedKpl(joined, kinesisEvent.kinesis))
        })
        return Promise.map(deAggPromises, function(aggResult) {
          return aggResult
        });
      }).then(results => {
        return _.flatten(results)
      }).then(results => {
        var groupByFinal = _.flatMap(_.groupBy(_.flatten(results), function(value) {
          return `${value.eventSourceARN}-${value.kinesis.partitionKey}`
        }), function(o) {return [o]})

        var chunks = []
        _.each(groupByFinal, function(group){
          var joined = _.cloneDeep(_.head(group))
          delete joined.kinesis.data
          _.chunk(group, maxEvents).forEach(chunk => {
            var data = []
            _.each(chunk, item => {
              data.add({"data": item.kinesis.data})
            })
            joined.data = data;
            chunks.add(_.cloneDeep(joined))
          });
        })
        self._logger.info(`Processing an Kinesis event, with ${chunks.length} chunks...`);
        resolve(chunks);
      }).catch(err => {
        reject(err);
      });

    });
  }

  let tractor = new ElasticTractor(this.params);
  tractor.init().then(config => {
    // If it has records
    if (event.Records) {
      var kinesisEvents = [];
      _.forEach(event.Records, function(evtRecord) {
        var evtSrc = evtRecord.eventSource;
        if (evtRecord.EventSource) {
          evtSrc = evtRecord.EventSource;
        }
        switch(evtSrc) {
          case "aws:s3":
            self._logger.info(`Processing an S3 event... ${evtRecord.s3.object.key}`);
            if (evtRecord.s3.object.size > 0) {
              tractor.processS3(config, evtRecord, evtSrc).then(results => {
                callback(null, "Success");
              }).catch(err => {
                delete evtRecord.logs;
                self._logger.error(err, `Occurred an error on event ${JSON.stringify(evtRecord)}`)
                callback(null, "Success");
              });
            } else {
              self._logger.error("Log size is zero");
              callback(null, "Success");
            }
            break;
          case "aws:kinesis":
            evtRecord.source = evtSrc;
            kinesisEvents.add(evtRecord);
            break;
          default:
            self._logger.info(`Event source "${evtRecord.eventSource}" is not supported. Event: ${JSON.stringify(evtRecord)}`)
            callback(null, "Success");
        }
      })

      // Check if it is an event from Kinesis
      if (kinesisEvents.length > 0) {
        self._logger.info(`Processing an Kinesis event, with ${kinesisEvents.length} events...`);
        self._prepareKinesisChunk(kinesisEvents, self.params.maxKinesisEvents).map(function(kinesisEvent) {
          return lambda.invoke({
            FunctionName: context.invokedFunctionArn,
            Payload: new Buffer(JSON.stringify(kinesisEvent))
          }).promise();
        }, {concurrency: self.params.concurrencyLambdaCall}).then(results => {
          callback(null, "Success");
        }).catch(err => {
          self._logger.error(err, `Occurred an error on kinesis event ${JSON.stringify(kinesisEvent)}`)
          // Discard errors
          callback(null, "Error");
        });
      }
    } else {
      // Treat as a stream of CloudWatch Logs
      if (!event.awslogs) {
        switch(event.source) {
          case "aws.ecs":
            tractor.processEcs(config, event, event.source).then(results => {
              callback(null, "Success");
            }).catch(err => {
              self._logger.error(err, `Occurred an error on event ${JSON.stringify(event)}`)
              callback(err, "Error");
            });
            break;
            case "aws:kinesis":
              self._logger.info("Processing an Kinesis event...");
              tractor.processKinesis(config, event, event.source).then(results => {
                callback(null, "Success");
              }).catch(err => {
                self._logger.error(err, `Occurred an error on event ${JSON.stringify(event)}`)
                callback(null, "Error");
              });
              break;
          default:
            self._logger.info(`Event source "${event.source}" is not supported. Event: ${JSON.stringify(event)}`)
            callback(null, "Success");
        }
      } else {
        var buffer = Buffer.from(event.awslogs.data, 'base64')
        self._logger.info("Processing an Cloudwatch Log event...");
        zlib.unzip(buffer, (err, buffer) => {
          if (!err) {
            tractor.processAwsLog(config, JSON.parse(buffer.toString()), "aws:awsLogs").then(results => {
              context.callbackWaitsForEmptyEventLoop = false;
              callback(null, "Success");
            }).catch(err => {
              self._logger.error(err, `Occurred an error on aws-logs ${buffer.toString()}`)
              context.callbackWaitsForEmptyEventLoop = false;
              callback(null, "Success");
            });
          } else {
            self._logger.error(err, `Occurred an error on aws-logs ${buffer.toString()}`)
            context.callbackWaitsForEmptyEventLoop = false;
            callback(null, "Success");
          }
        });
      }
    }
  });
};

module.exports = elasticTractor
