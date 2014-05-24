var hl = require('./lib/hyperloop'),
	_ = require('underscore');

module.exports = _.extend(hl,{
	compiler: require('./lib/compiler'),
	log: require('./lib/log'),
	config: require('./lib/config'),
	util: require('./lib/util'),
	hook: require('./lib/hook'),
	unit: require('./lib/unit'),
	spinner: require('./lib/spinner'),
	Command: require('./lib/command'),
	getCommands: hl.getCommands,
	getCommand: hl.getCommand
});
