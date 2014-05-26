/**
 * Hyperloop
 * Copyright (c) 2014 by Appcelerator, Inc. All Rights Reserved.
 * See LICENSE for more information on licensing.
 */
var _ = require('underscore'),
	path = require('path'),
	fs = require('fs'),
	log = require('./log'),
	pkg = JSON.parse(fs.readFileSync(__dirname + '/../package.json', 'utf8')),
	config = require('./config'),
	Hook = require('./hook'),
	Command = require('./command'),
	commands;

exports.run = run;
exports.getCommands = getCommands;
exports.getCommand = getCommand;
exports.execCommand = execCommand;

/**
 * Default options
 */
var defaultOptions = {
	name: 'App',
	src: process.cwd(),
	dest: 'build',
	debug: false,
	'log-level': 'info',
	excludes: /^\.hyperloop$/,
	obfuscate: true
};
switch (process.platform) {
	case 'win32':
		defaultOptions.platform = 'windows';
		break;
	case 'darwin':
		defaultOptions.platform = 'ios';
		break;
	default:
		defaultOptions.platform = 'android';
		break;
}

function makeSafeName (name) {
	return name.replace(/[\s\+\-\$\@\!\?\*\%\#\:\;\/]/g,'_');
}

/**
 * execute a specific command
 */
function run(state, command, options, platform, args, done) {
	var found = getCommand(platform,command),
		workDir = options.src || process.cwd(),
		orig_options = options;

	if (!found) {
		return done("Command not found: "+command);
	}
	delete options.colors; // we don't need our color config

	options = _.defaults(options,defaultOptions);

	// make sure we set reasonable defaults.
	platform.defaultOptions && (options=_.defaults(options,platform.defaultOptions));

	// load our configuration
	options = config.load(workDir,options);

	// change log level if debug flag passed (and no log-level set)
	if (options.debug && (!orig_options['log-level'] || orig_options['log-level']!='trace')) {
		options['log-level'] = 'debug';
	}

	// make sure we set our log-level in case it changed in config loading
	log.level = options['log-level'];

	// make a safe name
	options.name && (options.safeName = makeSafeName(options.name));

	var cmd = getCommand(platform,command);

	// validate the options
	cmd.getOptions().forEach(function(option){
		if (!(option.name in options) && option.required) {
			throw new Error("Missing required option "+("--"+option.name).magenta.bold+" "+command+" which should "+option.description);
		}
	});

	// common constants
	options.platform_dir = platform.directory;

	// set our options, args into our state
	state.options = options;
	state.args = args;

	// Hooks
	state.hook = new Hook(command+'.');
	state.hook.version = pkg.version;

	//
	// search order for hooks:
	//
	// 1. [project source directory]/hooks
	// 2. [project source parent directory]/hooks   (such as <titanium dir>/Resources/../hooks if Resources was the source directory)
	// 3. [platform directory]/hooks
	// 4. [current working directory]/hooks
	//
	[options.src, path.join(options.src,'..'), options.platform_dir, process.cwd()].forEach(function(d){
		var dir = path.resolve(path.join(d, 'hooks'));
		log.debug('scanning for hooks in',dir.cyan.bold);
		state.hook.scanHooks(dir);
	});

	var event = { state: state };
	state.hook.emit('pre.execute', event, function(){
		cmd.executionStartedAt = Date.now();
		cmd.execute(state, function(err, results) {
			if (err) {
				event.error = err;
				state.hook.emit(command+'.failed', event, function(){
					log.error(createErrorOutput(err));
					log.error('Hint: If you think you have found a bug, run again with '.grey + '--report'.bold + ' to report it.'.grey);
					log.error('Running with '.grey + '--debug'.bold + ' can also give you more information on what is going wrong.'.grey);
					done(err);
				});
			}
			else {
				finishedCommand(cmd);
				event.results = results;
				state.hook.emit('post.execute', event, done);
			}
		});
	});

}

function finishedCommand(command) {
	log.trace(command.name.yellow + ' finished in ' + String((Date.now() - command.executionStartedAt) / 1000).yellow + ' seconds.\n\n');
}

function createErrorOutput(e) {
	var errs = [];

	if (typeof e == 'object') {
		var line = e.line || e.lineNumber;
		if (line)  { errs.push('line ' + line); }
		if (e.col) { errs.push('column ' + e.col); }
		if (e.pos) { errs.push('position ' + e.pos); }
		if (e.stack) {errs.unshift(e.stack);}
	} else {
		errs.push(e);
	}

	return errs.join('\n');
}

function getCommands(platform) {
	if (!platform) throw new Error("missing platform argument");
	if (commands) { return commands; }
	try {
		// platform takes precendence over common
		var commandDirs = [path.join(platform.directory,'commands'), path.join(__dirname,'commands')],
			found = {},
			x = commandDirs.forEach(function(dir) {
				fs.readdirSync(dir).forEach(function(d){
					var name = path.basename(d),
						dn = path.join(dir, d, 'index.js');
					if (!(name in found) && fs.existsSync(dn)) {
						log.debug('Adding command',dn.cyan.bold);
						found[name] = require(dn);
					}
				});
			});
		return (commands = found);
	} catch (e) {
		log.debug(e.stack)
		throw new Error('Error getting command list: '+e);
	}
}

function getCommand(platform,name) {
	if (!commands && arguments.length<2) throw new Error("call getCommands first or pass in platform as first argument");
	if (arguments.length===2 && !commands) {
		getCommands(platform);
	}
	else if (arguments.length===1) {
		name = platform;
		platform = null;
	}
	return commands[name];
}

/**
 * execute a specific command by name
 */
function execCommand(name,state,next) {
	var cmd = getCommand(name),
		old_name = state.hook.prefix;
	// set the new prefix in the hook so that the events are correct
	state.hook.prefix = name+'.';
	cmd.execute(state,function(){
		// restore the old prefix to the previous command
		state.hook.prefix = old_name;
		next.apply(next,arguments);
	});
}
