var Command = require('../../command'),
	log = require('../../log'),
	parentCommand = require('../package/index'),
	fs = require('fs'),
	path = require('path');

/**
 * Package then launch the app.
 */
var launch = new Command(
	'launch', 
	'package then launch the app', 
	[
		{name:'hidden',required:false,description:"don't show the iOS Simulator window", platform:/darwin/},
		{name:'unit-test',required:false,description:'pass when executing unit tests to suppress logging and dump JSON results to console'},
		{name:'device-id',required:false,description:'the device UUID to install and launch the application',platform:/darwin/},
		{name:'quiet',required:false,description:'assume any prompts are affirmative'}
	],
	function(state, done) {
		try {
			var options = state.options,
				args    = state.args,
				platform_launcher = path.join(options.platform_dir,'commands','launch','index.js');

			if (!fs.existsSync(platform_launcher)) {
				return done("Couldn't find platform launcher files at "+platform_launcher);
			}

			// if running unit test, turn off logging and hide simulator window
			if (options.unit_test) {
				log.level = 'quiet';
				options.hidden = true;
			}

			platform_launcher = require(platform_launcher);
			parentCommand.execute(state, function packageFinished(err) {
				platform_launcher.execute(state, function(err, results) {
					if (err) {
						return done(err);
					}

					// if running unit tests, dump out JSON to console (skip log)
					if (options.unit_test && !options.unit_test_process) {
						console.log(JSON.stringify(results,null,3));
					}

					done(null,results);
				});
			});
		} catch (E) {
			done(E);
		}
	});

module.exports = launch;
