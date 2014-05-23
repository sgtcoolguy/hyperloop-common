/**
 * configuration
 */
var fs = require('fs'),
	path = require('path'),
	util = require('./util'),
	appc = require('node-appc'),
	_ = require('underscore'),
	//platforms = require('../../platforms/index'),
	cached;

exports.load = load;
exports.get = get;

// generate constants based on supported platforms
/*exports.CONST = {
	PLATFORMS:generatePlatformArray('platform')
};*/

/**
 * load our config
 */
function load (workDir, options) {
	if (typeof(workDir)=='object') {
		options = workDir;
		workDir = null;
	}
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
			if (key in cached) {
				cached[key] = pkg[key];
			}
		});
	 }
	 // we use our command line arguments to always overwrite
	 return (cached = _.extend(cached, options));
}

/**
 * return our config
 */
function get() {
	return cached;
}

// iterate through supported platforms to create specific constants
function generatePlatformArray(key) {
	var ret = [];
	// _.each(_.keys(platforms), function(p) {
	// 	ret.push(platforms[p][key]);
	// });
	return ret;
};
