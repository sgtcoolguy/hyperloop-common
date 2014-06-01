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
		{name:'platform',required:true,description:'specify the platform to target such as ios'}
	],
	function(state, done) {
		try {
			var options = state.options;
			if (fs.existsSync(options.dest)) {
				try {
					wrench.rmdirSyncRecursive(options.dest);
					log.info('Cleaned',options.dest.yellow);
				} catch (e) {
					done('Failed to clean the destination.');
				}
			}
			done();
		} catch (E) {
			done(E);
		}
	}
);

module.exports = clean;
