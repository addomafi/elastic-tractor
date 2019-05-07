'use strict';

let bunyan = require('bunyan');
let extend = require('extend');

var logger = function(parameters) {
  var params = extend({
    logName: "elastic-tractor",
    logLevel: "info"
  }, parameters);
  return bunyan.createLogger({name: params.logName, level: params.logLevel});
}

module.export = logger
