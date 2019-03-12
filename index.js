'use strict';

let path = require('path')
let extend = require('extend')
const zlib = require('zlib')
const _ = require('lodash')
var aws = require('aws-sdk')
var lambda = new aws.Lambda({
  region: 'us-east-1'
})
var kplAgg = require('aws-kinesis-agg');
var Promise = require("bluebird")
let ElasticTractor = require(path.join(__dirname, '.', 'elastictractor.js'))

console.log('Loading function');

aws.config.setPromisesDependency(require('bluebird'));

let elasticTractor = function(event, context, callback) {
  var self = this

  self._deaggregatedKpl = function(kinesisEvent) {
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
              newRecords.add({ "data": Buffer.from(record.data, 'base64').toString() });
            })
            resolve(newRecords);
          }
        });
      } else {
        resolve([{ "data": buffer.toString() }]);
      }
    })
  }

  self._prepareKinesisChunk = function(kinesisEvents, maxEvents) {
    return new Promise((resolve, reject) => {
      var joined = _.cloneDeep(_.head(kinesisEvents))
      delete joined.kinesis.data
      var deAggPromises = []
      kinesisEvents.forEach(kinesisEvent => {
        deAggPromises.add(self._deaggregatedKpl(kinesisEvent.kinesis))
      })
      Promise.map(deAggPromises, function(deAggEvent) {
        return deAggEvent;
      }).then(results => {
        var chunks = []
        _.chunk(results, maxEvents).forEach(chunk => {
          joined.data = chunk;
          chunks.add(_.cloneDeep(joined))
        });
        resolve(chunks);
      }).catch(err => {
        reject(err);
      });
    });
  }

  let tractor = new ElasticTractor();
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
            console.log(`Processing an S3 event... ${evtRecord.s3.object.key}`);
            if (evtRecord.s3.object.size > 0) {
              tractor.processS3(config, evtRecord, evtSrc).then(results => {
                callback(null, "Success");
              }).catch(err => {
                delete evtRecord.logs;
                console.log(`Occurred an error "${JSON.stringify(err)}" on event ${JSON.stringify(evtRecord)}`)
                callback(null, "Success");
              });
            } else {
              console.log("Log size is zero");
              callback(null, "Success");
            }
            break;
          case "aws:kinesis":
            console.log("Processing an Kinesis event...");
            evtRecord.source = evtSrc;
            kinesisEvents.add(evtRecord);
            break;
          default:
            console.log(`Event source "${evtRecord.eventSource}" is not supported. Event: ${JSON.stringify(evtRecord)}`)
            callback(null, "Success");
        }
      })

      // Check if it is an event from Kinesis
      if (kinesisEvents.length > 0) {
        var groupByKinesisEvents = _.flatMap(_.groupBy(kinesisEvents, function(value) {
          return value.kinesis.partitionKey
        }), function(o) {return [o]})

        Promise.map(groupByKinesisEvents, function(evtGrouped) {
          return self._prepareKinesisChunk(evtGrouped, 3)
        }).map(function(kinesisEvent) {
          return lambda.invoke({
              FunctionName: context.invokedFunctionArn,
              Payload: new Buffer(JSON.stringify(kinesisEvent))
            }).promise();
        }, {concurrency: 500}).then(results => {
          callback(null, "Success");
        }).catch(err => {
          console.log(`Occurred an error "${JSON.stringify(err)}"`)
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
              console.log(`Occurred an error "${JSON.stringify(err)}" on event ${JSON.stringify(event)}`)
              callback(err, "Error");
            });
            break;
            case "aws:kinesis":
              console.log("Processing an Kinesis event...");
              tractor.processKinesis(config, event, event.source).then(results => {
                callback(null, "Success");
              }).catch(err => {
                console.log(`Occurred an error "${JSON.stringify(err)}" on event ${JSON.stringify(event)}`)
                callback(err, "Error");
              });
              break;
          default:
            console.log(`Event source "${event.source}" is not supported. Event: ${JSON.stringify(event)}`)
            callback(null, "Success");
        }
      } else {
        var buffer = Buffer.from(event.awslogs.data, 'base64')
        console.log("Processing an Cloudwatch Log event...");
        zlib.unzip(buffer, (err, buffer) => {
          if (!err) {
            tractor.processAwsLog(config, JSON.parse(buffer.toString()), "aws:awsLogs").then(results => {
              context.callbackWaitsForEmptyEventLoop = false;
              callback(null, "Success");
            }).catch(err => {
              console.log(`Occurred an error "${JSON.stringify(err)}" on aws-logs ${buffer.toString()}`)
              context.callbackWaitsForEmptyEventLoop = false;
              callback(null, "Success");
            });
          } else {
            console.log(`Occurred an error "${JSON.stringify(err)}" on aws-logs ${buffer.toString()}`)
            context.callbackWaitsForEmptyEventLoop = false;
            callback(null, "Success");
          }
        });
      }
    }
  });
};

module.exports = elasticTractor
