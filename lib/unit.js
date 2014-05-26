/**
 * wrapper around ti-mocha to run unit tests
 */
var fs = require('fs'),
	path = require('path'),
	wrench = require('wrench'),
	assert = require('assert'),
	log = require('./log'),
	hyperloop = require('../index');

exports.run = run;

function run(options, title, dir, callback) {
	var compiler = require(path.join(__dirname, '..', '..', 'platforms', options.platform, 'lib', 'compiler.js'));

	options.dest = 'build/test-'+(new Date().getTime());
	options.name = 'HyperloopTest';
	options.appid = 'com.hyperloop.test';
	options.src = dir;
	options.launch_timeout = 10000;
	options.unit = true;

	var state = {};
	
	wrench.mkdirSyncRecursive(options.dest);
	hyperloop.run(state,'library',options,[],launch);

	function launch() {
		hyperloop.run(state,'launch',options,[],check);
	}

	function check(err,results) {
		if (results) {
			describe(title, function(){
				results.passes.forEach(function(entry){
					it(entry.title,function(){
					});
				});
				results.failures.forEach(function(entry){
					it(entry.title,function(){
						assert.fail(false,true,entry.title);
					});
				});
			});
		}
		else {
			return callback && callback(new Error("tests timed out"));
		}
		callback && callback(err);
	}
}