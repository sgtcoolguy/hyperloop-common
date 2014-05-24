var Command = require('../../command'),
	log = require('../../log'),
	path = require('path'),
	fs = require('fs');

/**
 * generate a library from a metabase
 */
var library = new Command(
	'library', 
	'generate the shared Hyperloop library', 
	[
		{name:'dest',required:true,description:'specify the directory where files will be generated'},
		{name:'platform',required:true,description:'specify the platform such as ios'},
	],
	function(state, done) {
		try {
			var self = this,
				options = state.options,
				args    = state.args,
				filter = args[0],
				platform = options.platform,
				dest = options.dest;

			// place to put hyperloop header
			options.headerdir = options.dest;

			// call our library generation
			require('../../compiler/library').generateLibrary(options, function(err, libfile) {
				if (err) {
					return done(err);
				}
				done(null, libfile);
			});
		} catch (E) {
			done(E);
		}
	});

module.exports = library;
