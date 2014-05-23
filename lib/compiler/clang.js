/**
 * generic clang utils
 */
var exec = require('child_process').exec,
	spawn = require('child_process').spawn,
	path = require('path'),
	wrench = require('wrench'),
	fs = require('fs'),
	async = require('async'),
	log = require('../log');

exports.compile = compile;
exports.library = library;

/**
 * add a flag if it doesn't already exist
 */
function addFlag (array, value) {
	array.indexOf(value)===-1 && array.unshift(value);
}

/**
 * process compiler flags
 */
function processCFlags(cflags, file) {
	switch (path.extname(file)) {
		case '.mm': {
			addFlag(cflags,'-x objective-c++');
			addFlag(cflags,'-std=c++11');
			break;
		}
		case '.m': {
			addFlag(cflags,'-x objective-c');
			break;
		}
		case '.cpp': {
			addFlag(cflags,'-std=c++11');
			break;
		}
	}
	switch (process.platform) {
		case 'darwin': {
			addFlag(cflags,'-DHL_DARWIN=1');
			break;
		}
		case 'linux': {
			addFlag(cflags,'-DHL_LINUX=1');
			break;
		}
		case 'windows': {
			addFlag(cflags,'-DHL_WINDOWS=1');
			break;
		}
	}
}

/**
 * process linker flags
 */
function processLinkFlags (file, linkflags) {
	var linker = 'libtool';
	switch(path.extname(file)) {
		case '.dylib': {
			linker = 'clang';
			addFlag(linkflags,'-shared');
			break;
		}
		case '.a': {
			linker = 'libtool';
			addFlag(linkflags,'-static');
			break;
		}
	}
	return linker;
}

/**
 * create a command function wrapper
 */
function createCompileTask (cmd, index, total) {
	return function(callback) {
		var str = '('+index+'/'+total+')';
		log.debug(cmd+' '+str.green);
		exec(cmd,{maxBuffer:1000*1024},callback);
	};
}

/**
 * utility to check the results of a async task and
 * throw Error or print to console on output / debug
 */
function checkResults(err,results,callback) {
	if (err) {
		callback(new Error(err));
		return false;
	}
	var stderr = [];
	results.forEach(function(result){
		result[1] && log.trace(String(result[1]));
	});
	if (stderr.length) {
		callback(new Error(stderr.join('\n')));
		return false;
	}
	return true;
}

/**
 * run a generic clang compile for one or more source files and turn them into object
 * files.  the build with run in parallel.
 */
function compile(config, callback) {

	var clang = config.clang || 'clang',
		srcfiles = config.srcfiles,
		dir = config.outdir,
		cflags = (config.cflags || []).concat(['-fPIC']),
		objfiles = [];

	if (!srcfiles || srcfiles.length === 0) {
		return callback('no source(s) specified for clang compile');
	}
	
	// setup any optimization flags
	cflags = cflags.concat(!config.debug ? ['-Os'] : ['-fno-inline', '-O0', '-g']);

	var compileTasks = [],
		index = 0,
		total = srcfiles.filter(function(e){return e.compile;}).length;
	
	if (!fs.existsSync(dir)) {
		wrench.mkdirSyncRecursive(dir);
	}

	// collect all the source compile commands
	srcfiles.forEach(function(entry){
		objfiles.push(entry.objfile);
		if (entry.compile) {
			index++;
			processCFlags(cflags,entry.srcfile);
			var cmd = cflags.concat(['-c','-o']).concat([entry.objfile, entry.srcfile]).join(' '),
				compileCmd = clang +' ' + cmd;
			config.debug && log.debug('compiling',entry.srcfile.cyan,'to',entry.objfile.cyan);
			compileTasks.push(createCompileTask(compileCmd,index,total));
			config.debug && log.debug('compile command:',compileCmd.cyan);
		}
	});

	if (compileTasks.length) {
		// since parallel can cause a TOO MANY OPEN FILES error
		// when compiling a ton of files in parallel, we need to
		// queue them
		var maxCompileJobs = config.jobs || require('os').cpus().length, // default to number of CPUs/cores
			results = [],
			q = async.queue(function(task,next){
				task(function(err,stdout,stderr){
					err && log.fatal(String(err));
					results.push([stdout,stderr]);
					next();
				});
			},Math.min(compileTasks.length,maxCompileJobs));
		log.debug('running up to',maxCompileJobs,'parallel compile tasks. specify --jobs=N to change the number of parallel compile tasks');
		log.info('Compiling',String(compileTasks.length).magenta.bold,'source file'+(compileTasks.length>1?'s':''));
		q.drain = function() {
			checkResults(null,results,callback) && callback(null,objfiles);
		};
		q.push(compileTasks);
	}
	else {
		callback(null,objfiles);
	}
}

/**
 * compile a static or dynamic library
 */
function library(config, callback) {
	var linklist = path.join(config.outdir,'objects.list'),
		args = (config.linkflags||[]).concat(['-filelist',linklist,'-o',config.libname]),
		linker = processLinkFlags(config.libname, args),
		splits = [],
		frameworkRegex = /^-framework (\w+)$/;

	if (!fs.existsSync(config.outdir)) {
		wrench.mkdirSyncRecursive(config.outdir);
	}

	var adds = [];
	// we need to correct some of the input to separate on different arg lines
	args = args.map(function(arg, index){
		if (frameworkRegex.test(arg)) {
			var m = frameworkRegex.exec(arg);
			adds.push('-framework');
			adds.push(m[1]);
			return;
		}
		return arg;
	});

	// remove any bad items from the linker line since they aren't allowed
	args = args.concat(adds).filter(function(f) {
		return f && (!/^-(syslibroot|arch_only|std=)/.test(f));
	});

	log.debug('linker objects are',config.objfiles.join(','));
	
	fs.writeFileSync(linklist,config.objfiles.join('\n'));

	log.debug(config.linker || linker,args.join(' '));

	var child = spawn(config.linker || linker,args);
	child.stdout.on('data',function(buf) {
		log.debug(buf.toString());
	});
	child.stderr.on('data',function(buf) {
		log.error(buf.toString());
	});
	child.on('close',function(exitCode) {
		if (exitCode!=0) log.fatal();
		callback(null, config.libname);
	});
}