let url = require('url');
let path = require('path')
let es = require('elasticsearch')
let grok = require('node-grok')
let _ = require('lodash');
let extend = require('extend');
let AWS = require('aws-sdk');
let s3 = new AWS.S3();
let kinesis = new AWS.Kinesis();
let firehose = new AWS.Firehose();
let OnigRegExp = require('oniguruma').OnigRegExp;
let md5 = require('md5');
let moment = require('moment');
var LineStream = require('byline').LineStream;
var stream = require('stream');
const zlib = require('zlib');
var Promise = require("bluebird");
var log = require(path.join(__dirname, '.', 'log.js'));

// var heapdump = require('heapdump');

var elastictractor = function (params) {
	var self = this
	self._logger = log(params);

	var template = function(tpl, args) {
		var value = {v: args, require: require}
		var keys = Object.keys(value),
				fn = new Function(...keys,
					'return `' + tpl.replace(/`/g, '\\`') + '`');
		try {
			return fn(...keys.map(x => value[x]));
		} catch (err) {
			return ""
		}
	};

	// Treat as standard server
	if (params.elkHost) {
		// TODO: Reviem this
		/*var urlEs = url.parse(params.elkHost)
		if (params.username) urlEs.username = params.username;
		if (params.password) urlEs.password = params.password;*/

		self.client = new es.Client({
			host: params.elkHost
		});
	} else if (params.cloudId) {
		self.client = new es.Client({
		  cloud: {
		    id: params.cloudId,
		    username: params.username,
		    password: params.password
		  }
		});
	}

	self.clientPool = {};

	self.matches = function (regex, value) {
		var onReg = new OnigRegExp(regex);
		var ret = onReg.testSync(value);
		onReg = null;
		return ret;
	};

	self._init = function() {
		return new Promise((resolve, reject) => {
			if (!self.config || process.hrtime(self.config.loadTime)[0] > 60) {
				self.client.search({
    			index: ".tractor-grok-patterns",
    			body: {
            "size": 1000
          }
    		}).then(function(bodyGrok) {
					self.client.search({
	    			index: ".tractor-patterns",
	    			body: {
	            "size": 1000
	          }
	    		}).then(function(body) {
	          var details = [];
						if (body && body.hits && body.hits.hits.length > 0) {
							var patterns = [];
							// Create an array of patterns to extract info
							_.each(body.hits.hits, item => {
								try {
									patterns.push(extend({
									}, JSON.parse(item["_source"].patternJSON)))
								} catch (err) {
									self._logger.error(`Error to parse a JSON pattern "${item["_source"].patternJSON}"`)
								}
							})

							self.config = {
								loadTime: process.hrtime(),
								patterns: patterns
							};

							grok.loadDefault(function (err, patterns) {
								if (err) reject(err);
								else {
									self.config.grokPatterns = patterns
									// Load custom Grok patterns
									_.each(bodyGrok.hits.hits, item => {
										if (!self.config.grokPatterns.getPattern(item["_id"])) {
											self.config.grokPatterns.createPattern(item["_source"].pattern, item["_id"])
										}
									})
									self._logger.debug("Loaded grok pattern... ", bodyGrok);
									resolve(self.config);
								}
							});
						} else {
							reject("Extractor patterns wasn't defined, please define it firstly.");
						}
	        }, function (error) {
						self._logger.error(error);
	          reject(error.message);
	        })
				}, function (error) {
					self._logger.debug(error);
          reject(error.message);
        })
			} else {
				resolve(self.config);
			}
		});
	}

	self._getDocumentToReindex = function (index, options) {
		return new Promise((resolve, reject) => {
			var currentMaxTimestamp = options.minTimestamp + (60000 * 60);
			self._logger.info(`Processing ${index} minTimestamp ${options.minTimestamp} maxTimestamp ${currentMaxTimestamp}`);
			self.client.search({
				index: index,
				body: {
					"query": {
						"bool": {
							"must": [{
								"range": {
									"timestamp": {
										"gte": options.minTimestamp,
										"lte": currentMaxTimestamp,
										"format": "epoch_millis"
									}
								}
							},{
								"query_string": {
									"query": "errorMessage: /error/"
								}
							}]
						}
					},
					"size": 50
				}
			}, function (error, response) {
				if (error) {
					reject(error)
				}

				if (response && response.hits && response.hits.hits.length > 0) {
					resolve(response.hits.hits)
					response = null;
				} else {
					options.minTimestamp = currentMaxTimestamp;
					self._logger.debug("Without items to be processed!");
					reject("Without items to be processed!");
					response = null;
				}
			})
		})
	};

	self._getDocumentById = function (index, documentId) {
		return new Promise((resolve, reject) => {
			self.client.search({
				index: index,
				body: {
					"query": {
						"bool": {
							"must": [{
								"query_string": {
									"query": `_id:"${documentId}"`
								}
							}]
						}
					}
				}
			}, function (error, response) {
				if (error) {
          reject(error)
        }

				if (response && response.hits && response.hits.hits.length > 0) {
        	resolve(response.hits.hits[0]);
					response = null;
				} else {
					reject("Document not found")
					response = null;
				}
			})
    })
	};

	self._parseRegex = function(regex, data, timestamp) {
		return new Promise((resolve, reject) => {
			var pattern = self.config.grokPatterns.getPattern(md5(regex));
			if (!pattern) pattern = self.config.grokPatterns.createPattern(regex, md5(regex));
			pattern.parse(data, function (err, obj) {
					if (err) {
						self._logger.debug(err);
					}
					// Replace timestamp if data has one
					if (obj && timestamp) {
						obj.timestamp = timestamp
					}
					resolve(obj);
			});
		}).timeout(params.parseTimeout);
	}

	/**
	 * Process the regular expression to extract details
	 *
	 * @param  {[type]} data    Document to extract details
	 * @param  {[type]} pattern Pattern to extract details
	 * @return {[type]}         Promisse
	 */
	self._parse = function(data, pattern) {
		return new Promise((resolve, reject) => {
			// Array of promisse in execution
			var regexInProcessing = [];
			Object.keys(pattern.regexp).forEach( key => {
				pattern.regexp[key].map(function(regex) {
					regexInProcessing.push(self._parseRegex(regex, data[key], data.timestamp ? moment(data.timestamp).format('x') : undefined));
				})
			});
			// Wait for all promisses be finished
			Promise.all(regexInProcessing).then(results => {
				// Got only valid results
				var filtered = _.filter(results, x => x);

				var additionalExtractor = [];
				// Keep only data that satisfied all regexp
				if (filtered.length <  Object.keys(pattern.regexp).length) {
					filtered = []
				} else {
					var newItem = {}
					filtered.forEach(item => {
						extend(newItem, item)
					});

					filtered = [newItem]
					// Do some extra actions if need
					if (filtered.length && pattern.config.actions) {
						// If any error occurs discard the data
						try {
							var onSuccess = pattern.config.actions.onSuccess;
							// Add info if necessary
							if (onSuccess) {
								if (onSuccess.parseJson) {
									onSuccess.parseJson.map(key => {
										try {
											extend(filtered[0], JSON.parse(filtered[0][key]))
										} catch(e) {
											// self._logger.debug(e)
										}

										delete filtered[0][key]
									})
								}
								if (onSuccess.gunzip) {
									onSuccess.gunzip.map(key => {
										try {
							        var additionalData = JSON.parse(zlib.unzipSync(new Buffer(filtered[0][key], "base64")))
											delete filtered[0][key]
							        var newRecord = extend(filtered[0], additionalData)
							      } catch (err) {
							        self._logger.info(err, "Error occurred during gunzip");
							      }
									})
								}
								if (onSuccess.add) {
									Object.keys(onSuccess.add).map(key => {
										filtered[0][key] = template(onSuccess.add[key], filtered[0])
										if (key === "timestamp") {
											data.timestamp = filtered[0][key]
										}
									})
								}
								if (onSuccess.delete) {
									onSuccess.delete.map(key => {
										delete filtered[0][key]
									})
								}
								if (onSuccess.parseInt) {
									onSuccess.parseInt.map(key => {
										filtered[0][key] = parseInt(filtered[0][key])
									})
								}
								if (onSuccess.extract) {
									// Keep only related patterns
									var relatedPatterns = _.filter(onSuccess.extract, x => x.pattern && self.matches(x.pattern.regex, template(x.pattern.value, filtered[0])));
									// Get only the first pattern to be applied
									var electedPattern = _.first(_.sortBy(relatedPatterns, ['pattern.order']));
									// Get unrestricted patterns
									var unrestrictedPatterns = _.filter(onSuccess.extract, x => !x.pattern);
									// Join all paterns
									_.concat(electedPattern, unrestrictedPatterns).map(item => {
										if (item) {
											Object.keys(item).map(key => {
	 											if (key !== "pattern") {
													item[key].map(regexItem => {
														try {
															var value = template(`\$\{v.${key}\}`, filtered[0]);
															if (value !== "undefined") {
																additionalExtractor.push({
																	"data": value,
																	"regex": regexItem
																});
															}
														} catch (e) {}
													})
												}
											})
										}
									})
								}
							}
						} catch (err) {
							self._logger.info(err, "An error occurred during onSuccess step");
							// Discard the Data
							filtered = []
						}
					}
				}

				var parsedObj = {results: filtered};
				var generateOutput = parsedObj => {
					parsedObj.output = [];
					pattern.config.output.forEach(item => {
						if (item.type === "aws:firehose" || item.type === "aws:kinesis") {
							parsedObj.output.push(item)
						} else if (item.type === "elasticsearch") {
							// Define index name
							var index = {index: "", type: item.type, url: item.url};
							if (item.id) {
								index.index = filtered[0][item.index];
								delete filtered[0][item.index];
								index.id = filtered[0][item.id];
								delete filtered[0][item.id];
							} else {
								var getPrefix = function(prefix, event) {
									if (prefix.indexOf("$") > -1) {
										return template(prefix, event)
									}
									if (event && event.errorMessage) {
										return `${prefix}error-`
									}
									return prefix
								};

								index.index = `${getPrefix(item.prefix, filtered[0])}${moment(data.timestamp, 'x').format('YYYY.MM.DD')}`
							}
							// Define document type if necessary
							if (item.mapping) {
								index.mapping = filtered[0][item.mapping];
								delete filtered[0][item.mapping];
							}
							parsedObj.output.push(index);
						}
					})
				}

				// Apply additional extractor if has one
				if (additionalExtractor.length) {
					var addRegexInProcessing = [];
					additionalExtractor.map(item => {
						addRegexInProcessing.push(self._parseRegex(item.regex, item.data));
					})
					// Wait for all promisses be finished
					Promise.all(addRegexInProcessing).then(results => {
						// Got only valid results
						var filtered = _.filter(results, x => x);

						filtered.forEach(item => {
							extend(parsedObj.results[0], item)
						});

						// Check output type
						if (pattern.config.output) {
							generateOutput(parsedObj);
						}
						resolve(parsedObj)
					}).catch(err => {
						reject(err)
					})
				} else {
					// Check output type
					if (pattern.config.output) {
						generateOutput(parsedObj);
					}
					resolve(parsedObj)
				}
			}).catch(err => {
				reject(err);
			});
		})
	};

	self._processESDocument = function(config, data) {
		return new Promise((resolve, reject) => {
			if (!self.config) self.config = config;
			var patterns = _.filter(config.patterns, x => x.config.field && self.matches(x.config.field.regex, data["_source"][config.field.name]));
			if (patterns.length > 0) {
				patterns = patterns[0].regex
			} else {
				patterns = _.filter(config.patterns, x => _.indexOf(x.config.source, "OTHERS") > -1)[0].regex;
			}

			var all = _.filter(config.patterns, x => _.indexOf(x.config.source, "ALL") > -1)[0].regex;
			Object.keys(all).forEach(key => {
				if (patterns[key]) {
					patterns[key] = all[key].concat(patterns[key])
				} else {
					patterns[key] = all[key]
				}
			})

			var parsing = [];
			Object.keys(patterns).forEach(item => {
				parsing.push(self._parse(data, { patterns: patterns[item], fieldName: item}));
			});

			Promise.all(parsing).then(results => {
				results = results.reduce(function(a, b) {
					return a.concat(b);
				}, []);
				if (results.length > 0) {
					results = results.reduceRight(function(a, b) {
						return extend({}, a, b);
					});
				}
				if (results.length == 0 || !results.errorMessage) {
					results = {
						errorMessage: "N/A"
					};
				}
				resolve({index: data["_index"], type: data["_type"], id: data["_id"], results: results});
				parsing = null;
				all = null;
				patterns = null;
			}).catch(err => {
				reject(err);
				parsing = null;
				all = null;
				patterns = null;
			});
		});
	};

	self._getTimestamp = function (index, order) {
		return new Promise((resolve, reject) => {
			self.client.search({
				index: index,
				body: {
					"size": 1,
					"query": {
						"bool": {
							"must": [{
								"query_string": {
									"query": "errorMessage: /error/"
								}
							}]
						}
					},
					"_source": [ "timestamp" ],
					"sort": [
						{
							"timestamp": {
								"order": order
							}
						}
					]
				}
			}).then(function(data) {
				resolve(data);
			}, function(err) {
				reject(err);
			});
		});
	};

	self._processESDocumentBacklog = function(index, options) {
		return new Promise((resolve, reject) => {
			self._getDocumentToReindex(index, options).then(docs => {
				self._init().then(config => {
					var docsReindexing = [];
					Object.keys(docs).forEach(i => {
						docsReindexing.push(self._processESDocument(config, docs[i]));
					});

					Promise.all(docsReindexing).then(results => {
						results = results.reduce(function(a, b) {
							return a.concat(b);
						}, []);

						var body = [];
						results.forEach(function(item) {
							body.push({ update:  { _index: item.index, _type: item.type, _id: item.id } });
							body.push({ doc: item.results });
						});

						if (body.length > 0) {
							self.client.bulk({
								body: body
							}, function (error, response) {
								if (error) {
									self._logger.error(error);
									reject(error);
								} else {
									resolve(response);
								}
							});
						}

					}).catch(err => {
						self._logger.error(err);
						reject(err);
					});
				}).catch(err => {
					self._logger.error(err);
					reject(err);
				});
			}).catch(err => {
				self._logger.error(err);
				reject(err);
			});
		});
	};

	self._hasConfig = function(config, event, type) {
		var self = this
		return new Promise((resolve, reject) => {
			// Keep only first pattern related the respective event _type
			var patterns = _.filter(config.patterns, x => {
				// Normalize data
				if (x.config.field.name.indexOf("$") < 0) {
					x.config.field.name = `\$\{v.${x.config.field.name}\}`;
				}
				return x.config && _.indexOf(x.config.source, type) > -1 && x.config.field && self.matches(x.config.field.regex, template(x.config.field.name, event))
			})
			if (patterns.length > 0) {
				config.patterns = patterns;
				resolve(config);
			} else {
				reject("It's not configured.");
			}
		})
	}

	self._processEvent = function(event, config) {
		var self = this
		return new Promise((resolve, reject) => {
			var patternsInProcessing = []
			config.patterns.map(pattern => {
				patternsInProcessing.push(new Promise((resolve, reject) => {
					// Keep only elegible index
					pattern.config.output = _.filter(pattern.config.field.output, x => self.matches(x.regex, template(pattern.config.field.name, event)))
					// Keep object as array
					var logs = _.concat(event[pattern.config.field.data], []);
					Promise.map(logs, function(data) {
						data.source = template(pattern.config.field.name, event);
						return self._parse(data, { config: pattern.config, regexp: pattern.regex });
					}, {concurrency: 100000}).then(results => {
						// Keep only valid data
						results = _.filter(results, x => x.results.length)
						resolve(results);
						parsing = null;
					}).catch(err => {
						reject(err);
						parsing = null;
					});
				}))
			})

			Promise.all(patternsInProcessing).then(results => {
				// Concat all results
				results = results.reduce(function(a, b) {
					return a.concat(b);
				}, []);

				var output = {};
				results.forEach(result => {
					result.output.forEach(out => {
						if (out.type === "aws:kinesis") {
							// if array wasn't initialized
							if (!output.kinesis || !output.kinesis[out.arn]) {
								if (!output.kinesis) output.kinesis = {};
								output.kinesis[out.arn] = {
								   "StreamName": out.arn,
								   "Records": []
								};
							}
							output.kinesis[out.arn]["Records"].push({ "PartitionKey": "results", "Data": JSON.stringify(_.head(result.results)) });
						} else if (out.type === "aws:firehose") {
							// if array wasn't initialized
							if (!output.firehose || !output.firehose[out.arn]) {
								if (!output.firehose) output.firehose = {};
								output.firehose[out.arn] = {
								   "DeliveryStreamName": out.arn,
								   "Records": []
								};
							}
							output.firehose[out.arn]["Records"].push({ "Data": JSON.stringify(_.head(result.results)) });
						} else if (out.type === "elasticsearch") {
							// if array wasn't initialized
							if (!output.elk) output.elk = {};
							// Contructs the body object to foward to elasticsearch
							var index = { _index: out.index, _type: "metric" };
							if (out.mapping) index["_type"] = out.mapping;
							var results = _.head(result.results);
							if (out.id) {
								index["_id"] = out.id;
								index = { update: index }
								results = {doc: results}
							} else {
								index = { index: index }
							}
							var hashElkOutput = md5(out.url)
							if (!self.clientPool[hashElkOutput]) {
								self.clientPool[hashElkOutput] = new es.Client({
									host: out.url,
									log: 'warning'
								});
							}
							// Recreate array if it not exists
							if (!output.elk[hashElkOutput]) output.elk[hashElkOutput] = [];
							output.elk[hashElkOutput].push(index);
							output.elk[hashElkOutput].push(results);
						}
					})
				});

				var processingOutput = []
				Object.keys(output).forEach(item => {
					if (item === "elk") {
						Object.keys(output.elk).forEach(elkHash => {
							//  Send documents to elasticsearch, if has one
							if (output.elk[elkHash].length > 0) {
								self._logger.info(`Writting ${output.elk[elkHash].length/2} records to ELK.`);
								// heapdump.writeSnapshot(function(err, filename) {
								// 	self._logger.info('dump written to', filename);
								// });
								// Split into chunk of 500 items
								var chunks = _.chunk(output.elk[elkHash], 1000)
								processingOutput.push(Promise.map(chunks, function(chunk) {
									return new Promise((resolve, reject) => {
										self.clientPool[elkHash].bulk({
											body: chunk
										}, function (error, response) {
											if (error) {
												self._logger.error(error);
												reject(error);
											} else if (response.errors) {
												var anError = _.head(_.filter(response.items, item => item.index.error));
												if (anError) {
													self._logger.error(anError);
													reject(anError);
												}
											} else {
												resolve(response);
											}
										})
									})
								}, {concurrency: 5}));
							}
						})
					} else if (item === "firehose" || item === "kinesis") {

						Object.keys(output[item]).forEach(stream => {
							processingOutput.push(new Promise((resolve, reject) => {
								var failureName = item === "firehose" ? "FailedPutCount" : "FailedRecordCount";

								var callback = function(err, data) {
									if (err) {
										self._logger.error(err);
										reject(err);
									} else {
										if (data[failureName] && data[failureName] > 0) {
											self._logger.error(`Some records wasn't delivered, a total of ${data[failureName]}. ${JSON.stringify(data)}`)
										}
										self._logger.info(`Was sent to ${item} ${output[item][stream]["Records"].length} records`)
										resolve(data);
									}
								};

								if (item === "firehose") {
									firehose.putRecordBatch(output[item][stream], callback);
								} else {
									kinesis.putRecords(output[item][stream], callback);
								}
							}))
						})
					}
				})

				Promise.all(processingOutput).then(results => {
					resolve(results);
				}).catch(err => {
					reject(err);
					parsing = null;
					all = null;
					patterns = null;
				})
			}).catch(err => {
				reject(err);
				parsing = null;
				all = null;
				patterns = null;
			});
		})
	};
}

elastictractor.prototype.init = function() {
	var self = this
	return self._init();
}

elastictractor.prototype.reindexESDocument = function (index, documentId) {
	var self = this
	return new Promise((resolve, reject) => {
		self._getDocumentById(index, documentId).then(data => {
			self._init().then(config => {
				self._processESDocument(config, data).then(docReindexed => {
					// Update document
					self.client.update({
					  index: docReindexed.index,
					  type: docReindexed.type,
					  id: docReindexed.id,
						body: {
					    doc: docReindexed.results
					  }
					}, function (error, response) {
					  if (error)
							reject(error);
						else
							resolve(response);
					});
				}).catch(err => {
					reject(err);
				});
			}).catch(err => {
				reject(err);
			});
		}).catch(err => {
			reject(err);
		});
	})
};

/**
 * Process an event from CloudWatch logs, basically is extract metrics and error from these events
 *
 * @param  {[type]} awsLogEvent Event from CloudWatch logs
 * @return {[type]}             Promise
 */
elastictractor.prototype.processAwsLog = function (config, awsLogEvent, type) {
	var self = this
	return new Promise((resolve, reject) => {
		self._hasConfig(config, awsLogEvent, type).then(config => {
			self._processEvent(awsLogEvent, config).then(response => {
				resolve(response);
			}).catch(err => {
				reject(err);
			})
		}).catch(err => {
			reject(err)
		});
	});
}

elastictractor.prototype.processS3 = function (config, s3Event, type) {
	var self = this
	return new Promise((resolve, reject) => {
		self._hasConfig(config, s3Event, type).then(config => {
			var s3Stream = s3.getObject({Bucket: s3Event.s3.bucket.name, Key: decodeURIComponent(s3Event.s3.object.key.replace(/\+/g, ' '))}).createReadStream();
			var lineStream = new LineStream();
			var logs = []
			// Add decompressor if necessary
			if (s3Event.s3.object.key.endsWith(".gz")) {
				s3Stream = s3Stream.pipe(zlib.createGunzip());
			}
	    s3Stream
	      .pipe(lineStream)
				// .pipe(recordStream)
	      .on('data', function(data) {
					logs.push({
						message: data.toString(),
						source: `${s3Event.s3.bucket.name}-${s3Event.s3.object.key}`
					})
	      }).on('end', function() {
					if (logs.length > 0) {
						var events = [];
						var chunks = _.chunk(logs,10000)
						chunks.map(chunk => {
							events.push(extend({logs: chunk}, s3Event));
						});
						logs = [];
						Promise.map(events, function(event) {
							return self._processEvent(event, config)
						}, {concurrency: 1}).then(response => {
							resolve(response);
						}).catch(err => {
							reject(err);
						});
					} else {
						reject("No log to be processed!");
					}
	      });
		}).catch(err => {
			reject(err)
		})
	});
};

elastictractor.prototype.processKinesis = function (config, kinesisEvent, type) {
	var self = this
	return new Promise((resolve, reject) => {
		self._hasConfig(config, kinesisEvent, type).then(config => {
			self._processEvent(kinesisEvent, config).then(response => {
				resolve(response);
			}).catch(err => {
				reject(err);
			})
		}).catch(err => {
			reject(err)
		});
	});
}

elastictractor.prototype.processEcs = function (config, ecsEvent, type) {
	var self = this
	return new Promise((resolve, reject) => {
		self._hasConfig(config, ecsEvent, type).then(config => {
			self._processEvent(extend(ecsEvent, {data: {message: JSON.stringify(ecsEvent)}}), config).then(response => {
				resolve(response);
			}).catch(err => {
				reject(err);
			})
		}).catch(err => {
			reject(err)
		});
	});
}

/*
* Process any elasticsearch document that contains a text "error" on the field errorMessage.
*/
elastictractor.prototype.processESBacklog = function (index) {
	var self = this
	return new Promise((resolve, reject) => {
		var minTimestamp = 0;
		var maxTimestamp = 0;

		self._getTimestamp(index, 'asc').then(min => {
			if (min.hits.hits[0]) {
				minTimestamp = min.hits.hits[0].sort[0];
				self._getTimestamp(index, 'desc').then(max => {
					maxTimestamp = max.hits.hits[0].sort[0];
					var options = {
						minTimestamp: minTimestamp,
						maxTimestamp: maxTimestamp
					};
					var overloadCall = function(index, options) {
						self._processESDocumentBacklog(index, options).then(results => {
							if (!(options.minTimestamp < options.maxTimestamp)) {
								self._logger.info('Finish');
								resolve(results);
							} else {
								// heapdump.writeSnapshot(function(err, filename) {
								// 	self._logger.info('dump written to', filename);
								// });
								overloadCall(index, options);
							}
						}).catch(err => {
							if (options.minTimestamp < options.maxTimestamp) {
								overloadCall(index, options);
							} else {
								self._logger.info('Finish');
								resolve('Finish');
							}
						});
					};
					if (options.minTimestamp <= options.maxTimestamp) {
						overloadCall(index, options);
					}
				}).catch(err => {
					self._logger.error(err);
					reject(err);
				});
			} else {
				reject("Document not found");
			}
		}).catch(err => {
			self._logger.error(err);
			reject(err);
		});
	});
};

module.exports = elastictractor
