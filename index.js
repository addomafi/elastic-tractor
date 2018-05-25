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

exports.handler({
    "Records": [
        {
            "eventVersion": "2.0",
            "eventSource": "aws:s3",
            "awsRegion": "us-east-1",
            "eventTime": "2018-05-25T12:01:10.030Z",
            "eventName": "ObjectCreated:CompleteMultipartUpload",
            "userIdentity": {
                "principalId": "AWS:AIDAITAATZTOMD5FZTPKC"
            },
            "requestParameters": {
                "sourceIPAddress": "34.203.19.169"
            },
            "responseElements": {
                "x-amz-request-id": "80EA2C62305A1484",
                "x-amz-id-2": "zOHbwswZkfar23poIfGOw58+wFjmjb1HtMbI/oBDCdqiaWf7dKytBocfi33Pf3JGEmRMEiaeZLA="
            },
            "s3": {
                "s3SchemaVersion": "1.0",
                "configurationId": "52ce7f63-c682-4eca-9207-788bada65e48",
                "bucket": {
                    "name": "smiles-elb-logs",
                    "ownerIdentity": {
                        "principalId": "A1VM0T8EO8QG7F"
                    },
                    "arn": "arn:aws:s3:::smiles-elb-logs"
                },
                "object": {
                    "key": "osb/green/AWSLogs/774515094505/elasticloadbalancing/us-east-1/2018/05/25/774515094505_elasticloadbalancing_us-east-1_app.alb-prd-prv-OSB-green.20b5921a359ce58c_20180525T1340Z_10.2.51.111_25cjzzpe.log.gz",
                    "size": 494426,
                    "eTag": "8e20fe8b4a96735c85cdd8dcd97c4f64-1",
                    "sequencer": "005B07FB05A1C45EF3"
                }
            }
        }
    ]
})
