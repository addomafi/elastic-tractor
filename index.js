'use strict';

let path = require('path')
const zlib = require('zlib')
const _ = require('lodash')
let ElasticTractor = require(path.join(__dirname, '.', 'elastictractor.js'))

console.log('Loading function');

exports.handler = function(event, context, callback) {
    let tractor = new ElasticTractor();
    // If it has records
    if (event.Records) {
      _.forEach(event.Records, function(evtRecord) {
        var evtSrc = evtRecord.eventSource;
        if (evtRecord.EventSource) {
          evtSrc = evtRecord.EventSource;
        }
        switch(evtSrc) {
          case "aws:s3":
            tractor.processS3(evtRecord).then(results => {
              callback(null, "Success");
            }).catch(err => {
              console.log(`Occurred an error "${JSON.stringify(err)}" on event ${JSON.stringify(evtRecord)}`)
              callback(null, "Success");
            });
            break;
          case "aws:sns":
            tractor.processSNS(evtRecord).then(results => {
              callback(null, "Success");
            }).catch(err => {
              console.log(`Occurred an error "${JSON.stringify(err)}" on event ${JSON.stringify(evtRecord)}`)
              callback(err, "Error");
            });
            break;
          case "aws:kinesis":
            tractor.processKinesis(evtRecord).then(results => {
              callback(null, "Success");
            }).catch(err => {
              console.log(`Occurred an error "${JSON.stringify(err)}" on event ${JSON.stringify(evtRecord)}`)
              callback(err, "Error");
            });
            break;
          default:
            console.log(`Event source "${evtRecord.eventSource}" is not supported. Event: ${JSON.stringify(evtRecord)}`)
            callback(null, "Success");
        }
      })
    } else {
      // Treat as a stream of CloudWatch Logs
      var buffer = Buffer.from(event.awslogs.data, 'base64')
      zlib.unzip(buffer, (err, buffer) => {
        if (!err) {
          tractor.processAwsLog(JSON.parse(buffer.toString())).then(results => {
            callback(null, "Success");
          }).catch(err => {
            console.log(`Occurred an error "${JSON.stringify(err)}" on aws-logs ${buffer.toString()}`)
            callback(null, "Success");
          });
        } else {
          console.log(`Occurred an error "${JSON.stringify(err)}" on aws-logs ${buffer.toString()}`)
          callback(null, "Success");
        }
      });
    }
};
