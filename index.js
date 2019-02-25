'use strict';

let path = require('path')
let extend = require('extend')
const zlib = require('zlib')
const _ = require('lodash')
var aws = require('aws-sdk')
var lambda = new aws.Lambda()
var Promise = require("bluebird")
let ElasticTractor = require(path.join(__dirname, '.', 'elastictractor.js'))

console.log('Loading function');

aws.config.setPromisesDependency(require('bluebird'));

let elasticTractor = function (parameters) {
  this.params = parameters;
}

elasticTractor.prototype.handler = function(event, context, callback) {
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
          // Get chunk of 50
          var chunks = []
          _.chunk(kinesisEvents, 50).forEach(chunk => {
            var joined = JSON.parse(JSON.stringify(chunk[0]))
            delete joined.kinesis.data
            joined.data = []
            chunk.forEach(unique => {
              var buffer = Buffer.from(unique.kinesis.data, 'base64')
        			joined.data.add({ "data": buffer.toString() });
            })
            chunks.add(joined);
          })
          Promise.map(chunks, function(kinesisEvent) {
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
