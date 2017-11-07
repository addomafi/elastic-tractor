'use strict';

let path = require('path')
let ElasticTractor = require(path.join(__dirname, '.', 'elastictractor.js'))

console.log('Loading function');

exports.handler = function(event, context, callback) {
    let tractor = new ElasticTractor();
    console.log(JSON.stringify(event));
    if (event.Records) {
      _.forEach(event.Records, function(component) {
        var evtSrc = component.eventSource;
        if (component.EventSource) {
          evtSrc = component.EventSource;
        }
        switch(evtSrc) {
          case "aws:s3":
            tractor.processS3(component.s3).then(results => {
              console.log(JSON.stringify(results));
              callback(null, "Success");
            }).catch(err => {
              callback(err, "Error");
            });
            break;
          case "aws:sns":
            tractor.reindex(component.Sns.Subject, component.Sns.Message).then(results => {
              console.log(JSON.stringify(results));
              callback(null, "Success");
            }).catch(err => {
              callback(err, "Error");
            });
            break;
          default:
            console.log(`Event source "${component.eventSource}" is not supported.`)
        }
      })
    }
};
