#!/usr/bin/env node

/**
 * Created by adautomartins on 10/05/17.
 */

var path = require('path')
var argv = require('optimist').argv
var Elastictractor = require(path.join(__dirname, '..', 'elastictractor.js'))
var tractor = new Elastictractor()

if (argv["id"]) {
  tractor.reindex(argv["index"], argv["id"]).then(results => {
    console.log(JSON.stringify(results));
  }).catch(err => {
    console.log(err)
  });
} else {
  tractor.processESBacklog(argv["index"]).then(results => {
    console.log(JSON.stringify(results));
  }).catch(err => {
    console.log(err)
  });
}
