# Elastic Tractor [![Build Status](https://travis-ci.org/addomafi/elastic-tractor.svg?branch=master)](https://travis-ci.org/addomafi/elastic-tractor)

This is a tool to extract, transform and load data based on Grok Patterns.

Firstly it was designed to run as a AWS Lambda, but with some efforts you could use with any serverless platform.

Currently we are supporting events from:

* Source: Kinesis, S3, Cloudwatch Logs and ECS Events.
* Destination: Kinesis, Kinesis Firehose and ElasticSearch.

## Current Status

Stable, but under constant development.

## Installation

```sh
npm install elastictractor
```

## Features

* Listen events from Kinesis, S3, CloudWatch Logs and ECS Events;
* Extract information based on Grok Patterns;
* Apply some pre-defined transformations like, parseInt, parseJson, add and delete fields;
* Load data into Kinesis, Kinesis Firehose or ElasticSearch.

## Introduction

It is an example to use with AWS Lambda:

```js
var elasticTractor = require('elastictractor')
var processor = new elasticTractor({
  elkHost: "http://localhost:9200"
});

exports.handler = function(event, context, callback) {
  processor.handler(event, context, callback);
};
```
