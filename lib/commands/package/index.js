var Command = require('../../command'),
	parentCommand = require('../compile/index'),
	log = require('../../log'),
	fs = require('fs');
	path = require('path');

/**
 * Compile then package the app.
 */
var package = new Command(
	'package', 
	'package source files', 
	parentCommand.getOptions().concat([
		//FIXME: refactor into platform specific
		{name: 'configuration', required:false, description: "set Configuration for msbuild (default 'Debug')", platform:/^win/ },
		{name: 'identity-name', required:false, description: "Package.appxmanifest Identity Name (default 'hyperlooptest.NAME')", platform:/^win/ },
	]),
	function(state, done) {
		try {
			var options = state.options,
				args    = state.args,
				platform_packager = path.join(options.platform_dir,'commands','package','index.js');

			if (!fs.existsSync(platform_packager)) {
				return done("Couldn't find platform packager files at "+platform_packager);
			}
			// validate args before we compile
			platform_packager = require(platform_packager);

			// validate args before we compile
			platform_packager.validate(state, function(err,result){
				if (err) {
					return done(err);
				}
				if (result) {
					if (platform_packager.prepare) {
						platform_packager.prepare(state, proceed);
					} else {
						proceed();
					}
				} else {
					done('validation failed');
				}
			});

			function proceed() {
				parentCommand.execute(state, function compileFinished() {
					platform_packager.execute(state, function(err) {
						if (err) {
							return done(err);
						}
						done();
					});
				});
			}
		} catch (E) {
			done(E);
		}
});

module.exports = package;
