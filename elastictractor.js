let es = require('elasticsearch')
let grok = require('node-grok')
var _ = require('lodash');
let extend = require('extend');
let AWS = require('aws-sdk');
let s3 = new AWS.S3();
var OnigRegExp = require('oniguruma').OnigRegExp;
var md5 = require('md5');
var moment = require('moment');
// var heapdump = require('heapdump');

var elastictractor = function () {
	var self = this

	var template = function(tpl, args) {
		var value = {v: args}
		var keys = Object.keys(value),
				fn = new Function(...keys,
					'return `' + tpl.replace(/`/g, '\\`') + '`');
		return fn(...keys.map(x => value[x]));
	};

	self.client = new es.Client({
		host: process.env.ELK_HOST,
		log: 'warning'
	});

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
    			index: ".tractor",
    			body: {
            "size": 10000
          }
    		}).then(function(body) {
          var details = [];
					if (body && body.hits && body.hits.hits.length > 0) {
						var extractPatterns = _.filter(body.hits.hits, {"_type": "extractor_patterns_v2"})

						var patterns = [];
						// Create an array of patterns to extract info
						_.each(extractPatterns, item => {
							try {
								patterns.push(extend({
								}, JSON.parse(item["_source"].patternJSON)))
							} catch (err) {
								console.log(`Error to parse a JSON pattern "${item["_source"].patternJSON}"`)
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
								var customGrokPatterns = _.sortBy(_.filter(body.hits.hits, {"_type": "patterns"}), [function(o) { return o["_source"].priority; }])
								_.each(customGrokPatterns, item => {
									if (!self.config.grokPatterns.getPattern(item["_source"].id)) {
										self.config.grokPatterns.createPattern(item["_source"].pattern, item["_source"].id)
									}
								})
								console.log("Loaded");
								resolve(self.config);
							}
						});
					} else {
						reject("Extractor patterns wasn't defined, please define it firstly.");
					}
        }, function (error) {
					console.log(error);
          reject(error.message);
        });
			} else {
				resolve(self.config);
			}
		});
	}

	self._getDocumentToReindex = function (index, options) {
		return new Promise((resolve, reject) => {
			var currentMaxTimestamp = options.minTimestamp + (60000 * 60);
			console.log(`Processing ${index} minTimestamp ${options.minTimestamp} maxTimestamp ${currentMaxTimestamp}`);
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
					console.log("Without items to be processed!");
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
						console.log(err);
					}
					// Replace timestamp if data has one
					if (obj && timestamp) {
						obj.timestamp = timestamp
					}
					resolve(obj);
			});
		});
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
					regexInProcessing.push(self._parseRegex(regex, data[key], moment(data.timestamp).format('x')));
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
						var onSuccess = pattern.config.actions.onSuccess;
						// Add info if necessary
						if (onSuccess) {
							if (onSuccess.parseJson) {
								onSuccess.parseJson.map(key => {
									try {
										extend(filtered[0], JSON.parse(filtered[0][key]))
									} catch(e) {
										// console.log(e)
									}

									delete filtered[0][key]
								})
							}
							if (onSuccess.add) {
								Object.keys(onSuccess.add).map(key => {
									filtered[0][key] = template(onSuccess.add[key], filtered[0])
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
								onSuccess.extract.map(item => {
									Object.keys(item).map(key => {
										item[key].map(regexItem => {
											try {
												var value = template(`\$\{v.${key}\}`, filtered[0]);
												additionalExtractor.push({
													"data": value,
													"regex": regexItem
												});
											} catch (e) {}
										})
									})
								})
							}
						}
					}
				}

				// Define index name
				var index;
				if (filtered.length && filtered[0].hasError) {
					index = `${pattern.config.index.prefix}error-${moment(data.timestamp, 'x').format('YYYY.MM.DD')}`
				} else {
					index = `${pattern.config.index.prefix}${moment(data.timestamp, 'x').format('YYYY.MM.DD')}`
				}

				// Apply additional extractor if has one
				if (additionalExtractor.length) {
					regexInProcessing = [];
					additionalExtractor.map(item => {
						regexInProcessing.push(self._parseRegex(item.regex, item.data));
					})
					// Wait for all promisses be finished
					Promise.all(regexInProcessing).then(results => {
						results.forEach(item => {
							extend(filtered[0], item)
						});

						resolve({index: index, type: pattern.config.index.type, id: data["_id"], results: filtered});
					})
				} else {
					resolve({index: index, type: pattern.config.index.type, id: data["_id"], results: filtered});
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
									console.log(error);
									reject(error);
								} else {
									resolve(response);
								}
							});
						}

					}).catch(err => {
						console.log(err);
						reject(err);
					});
				}).catch(err => {
					console.log(err);
					reject(err);
				});
			}).catch(err => {
				console.log(err);
				reject(err);
			});
		});
	};
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
elastictractor.prototype.processAwsLog = function(awsLogEvent) {
	var self = this
	return new Promise((resolve, reject) => {
		// Load configuration
		self._init().then(config => {
			// Keep only first pattern related to this CloudWatch logs
			var pattern = _.head(_.filter(config.patterns, x => x.config && _.indexOf(x.config.source, "aws:awsLogs") > -1 && x.config.field && self.matches(x.config.field.regex, awsLogEvent[x.config.field.name])));
			// Keep only elegible index
			pattern.config.index = _.head(_.filter(pattern.config.field.index, x => self.matches(x.regex, awsLogEvent[x.name])))

			var logs = awsLogEvent.logEvents
			var parsing = [];
			logs.forEach(data => {
				data.source = awsLogEvent.logGroup
				parsing.push(self._parse(data, { config: pattern.config, regexp: pattern.regex}));
			})
			// Get results after pattern was applied
			Promise.all(parsing).then(results => {
				// Keep only valid data
				results = _.filter(results, x => x.results.length)

				var body = [];
				// Contructs the body object to foward to elasticsearch
				results.forEach(function(item) {
					body.push({ index:  { _index: item.index, _type: "metric" } });
					body.push(item);
				});

				//  Send documents to elasticsearch, if has one
				if (body.length > 0) {
					self.client.bulk({
						body: body
					}, function (error, response) {
						if (error) {
							console.log(error);
							reject(error);
						} else {
							resolve(response);
						}
					});
				}

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
	})
};


elastictractor.prototype.processS3 = function(s3Event) {
	var self = this
	return new Promise((resolve, reject) => {

	});
};

elastictractor.prototype.processSNS = function(snsEvent) {
	var self = this
	return new Promise((resolve, reject) => {
		tractor.reindexESDocument(component.Sns.Subject, component.Sns.Message).then(response => {
			resolve(response);
		}).catch(err => {
			reject(err);
		});
	});
};

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
								console.log('Finish');
								resolve(results);
							} else {
								// heapdump.writeSnapshot(function(err, filename) {
								// 	console.log('dump written to', filename);
								// });
								overloadCall(index, options);
							}
						}).catch(err => {
							if (options.minTimestamp < options.maxTimestamp) {
								overloadCall(index, options);
							} else {
								console.log('Finish');
								resolve('Finish');
							}
						});
					};
					if (options.minTimestamp <= options.maxTimestamp) {
						overloadCall(index, options);
					}
				}).catch(err => {
					console.log(err);
					reject(err);
				});
			} else {
				reject("Document not found");
			}
		}).catch(err => {
			console.log(err);
			reject(err);
		});
	});
};

module.exports = elastictractor
