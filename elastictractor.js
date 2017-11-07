let es = require('elasticsearch')
let grok = require('node-grok')
var _ = require('lodash');
let extend = require('extend');
let AWS = require('aws-sdk');
let s3 = new AWS.S3();
var OnigRegExp = require('oniguruma').OnigRegExp;
var md5 = require('md5');
// var heapdump = require('heapdump');

var elastictractor = function () {
	var self = this

	self.client = new es.Client({
		host: process.env.ELK_HOST,
		log: 'warning'
	});

	self._init = function() {
		return new Promise((resolve, reject) => {
			if (!self.config || process.hrtime(self.config.loadTime)[0] > 60) {
				s3.getObject({Bucket: 'smiles-devops-configs', Key: 'prd-elasticsearch/patterns.json'}, function(err, data) {
					if (err) {
						console.log(err, err.stack);
						reject(err);
					} else {
						console.log("Loaded");
						grok.loadDefault(function (err, patterns) {
							if (err) reject(err);
							else {
								patterns.load("patterns/custom", function (err, newPatterns) {
									if (err) reject(err);
									else {
										self.config = extend({
											loadTime: process.hrtime()
										}, JSON.parse(data["Body"].toString()));
										self.config.grokPatterns = newPatterns
										resolve(self.config);
									}
								});
							}
						});
					}
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

	self._parseRegex = function(regex, data) {
		return new Promise((resolve, reject) => {
			var pattern = self.config.grokPatterns.getPattern(md5(regex));
			if (!pattern) pattern = self.config.grokPatterns.createPattern(regex, md5(regex));
			pattern.parse(data, function (err, obj) {
					if (err) {
						console.log(err);
					}
					resolve(obj);
			});
		});
	}

	self._parse = function(data, config) {
		return new Promise((resolve, reject) => {
			var regexInProcessing = [];
			config.patterns.map(function(regex) {
				regexInProcessing.push(self._parseRegex(regex, data["_source"][config.fieldName]));
			})
			Promise.all(regexInProcessing).then(results => {
				var filtered = _.filter(results, x => x);
				resolve(filtered);
			}).catch(err => {
				reject(err);
			});
		})
	};

	self._process = function(config, data) {
		return new Promise((resolve, reject) => {
			let matches = function (regex, value) {
				var onReg = new OnigRegExp(regex);
				var ret = onReg.testSync(value);
				onReg = null;
				return ret;
			};

			if (!self.config) self.config = config;
			var patterns = _.filter(config.patterns, x => matches(x.component, data["_source"].component));
			if (patterns.length > 0) {
				patterns = patterns[0].regex
			} else {
				patterns = _.filter(config.patterns, x => x.component === "OTHERS")[0].regex;
			}

			var all = _.filter(config.patterns, x => x.component === "ALL")[0].regex;
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

	self._processBacklog = function(index, options) {
		return new Promise((resolve, reject) => {
			self._getDocumentToReindex(index, options).then(docs => {
				self._init().then(config => {
					var docsReindexing = [];
					Object.keys(docs).forEach(i => {
						docsReindexing.push(self._process(config, docs[i]));
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

elastictractor.prototype.reindex = function (index, documentId) {
	var self = this
	return new Promise((resolve, reject) => {
		self._getDocumentById(index, documentId).then(data => {
			self._init().then(config => {
				self._process(config, data).then(docReindexed => {
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

elastictractor.prototype.processBacklog = function (index) {
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
						self._processBacklog(index, options).then(results => {
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
