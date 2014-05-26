/**
 * configuration
 */
var fs = require('fs'),
	path = require('path'),
	util = require('./util'),
	appc = require('node-appc'),
	_ = require('underscore'),
	cached;

exports.load = load;
exports.get = get;

/**
 * load our config
 */
function load (workDir, options) {
	if (typeof(workDir)=='object') {
		options = workDir;
		workDir = null;
	}
	options = options || {};
	// set some basic defaults that we want to get potentially lifted from our package.json
	cached = {'name':undefined,'version':undefined}; 
	[path.join(appc.fs.home(), '.hyperloop'),
	 path.join(process.cwd(), '.hyperloop'),
	 workDir && path.join(workDir, '.hyperloop')].forEach(function(fn){
		if (fn && fs.existsSync(fn)) {
			cached = _.extend(cached,JSON.parse(fs.readFileSync(fn,'utf8').toString()));
		}
	 });
	 // special case, if the work directory has a package.json, use it too
	 var pkgJSON = workDir && path.join(workDir,'package.json');
	 if (pkgJSON && fs.existsSync(pkgJSON)) {
		var pkg = JSON.parse(fs.readFileSync(pkgJSON,'utf8').toString());
		// however, we're only going to add to our config if we find them in our existing config
		Object.keys(pkg).forEach(function(key) {
			if (key in cached && pkg[key]) {
				cached[key] = pkg[key];
			}
		});
	 }
	 // copied cached into options... we always want to return options if provided 
	 Object.keys(cached).forEach(function(k){
	 	if (!(k in options) && (k in cached)) {
	 		options[k] = cached[k];
	 	}
	 });
	 return options;
}

/**
 * return our config
 */
function get() {
	return cached;
}
