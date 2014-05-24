var Command = require('../../command'),
	log = require('../../log'),
	fs = require('fs'),
	wrench = require('wrench'),
	path = require('path');

/**
 * Clean the destination directory.
 */
var clean = new Command(
	'clean', 
	'removes the build folder', 
	[
		{name:'dest',required:true,description:'specify the directory where files that have been generated will be cleaned'},
		{name:'uninstall', required:false, description:'uninstall the application', platform:/^win/ },
		{name:'platform',required:true,description:'specify the platform to target such as ios'}
	],
	function(state, done) {
		try {
			var options = state.options;
			// load up our platform clean library
			var platform_clean = path.join(__dirname,'..','..', '..','platforms',options.platform,'commands','clean','index.js');
			if (!fs.existsSync(platform_clean)) {
				// default clean implementation which does nothing
				platform_clean = function(state, done) {
					done();
				};
			} else {
				platform_clean = require(platform_clean).execute;
			}

			if (fs.existsSync(options.dest)) {
				try {
					wrench.rmdirSyncRecursive(options.dest);
					log.info('Cleaned',options.dest.yellow);
				} catch (e) {
					if (/EBUSY/.test(e.message) && /^win/.test(process.platform)) {
						log.error(e.message);
						log.error('Try "File -> Close Solution" in Visual Studio, then run clean again.');
					}
					done('Failed to clean the destination.');
				}
				platform_clean(state, done);
			} else {
				platform_clean(state, done);
			}
		} catch (E) {
			done(E);
		}
	}
);

module.exports = clean;
