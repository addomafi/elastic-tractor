'use strict';

let path = require('path')
let ElasticTractor = require(path.join(__dirname, '.', 'elastictractor.js'))

console.log('Loading function');

exports.handler = function(event, context, callback) {
    let tractor = new ElasticTractor();
    console.log(JSON.stringify(event));
    tractor.process(event.Records[0].Sns.Subject, event.Records[0].Sns.Message).then(results => {
      console.log(JSON.stringify(results));
      callback(null, "Success");
    }).catch(err => {
      callback(err, "Error");
    });
};
