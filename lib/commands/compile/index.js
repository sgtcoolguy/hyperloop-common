var Command = require('../../command'),
	hyperloop = require('../../hyperloop'),
	util = require('../../util'),
	log = require('../../log'),
	appc = require('node-appc'),
	path = require('path'),
	fs = require('fs'),
	wrench = require('wrench'),
	async = require('async'),
	_ = require('underscore'),
	typelib = require('../../compiler/type'),
	compiler = require('../../compiler/ast'),
	library = require('../../compiler/library'),
	codegen = require('../../compiler/codegen'),
	IR = require('../../compiler/IR');

/**
 * Compile the app.
 */
var compile = new Command(
	'compile', 
	'compile source files', 
	[
		{name:'src',required:true,description:'specify the directory of files to be compiled'},
		{name:'dest',required:true,description:'specify the directory where files will be generated'},
		{name:'platform',required:true,description:'specify the platform to target such as ios'},
		{name:'cflags',required:false,description:'compiler flag to pass to native compiler'},
		{name:'includes',required:false,description:'directory where headers can be found'},
		{name:'environment',required:false,description:'build environment such as development, test, production'},
		{name:'debugsource',required:false,description:'log with debug level the generated source for each file'},
		{name:'dump-ast',required:false,description:'log each JS AST node'},
		{name:'dump-ir',required:false,description:'log IR for each JS file (hyperloop only)'}
	],
	function(state, done) {
		try {
			var options = state.options,
				platform = options.platform,
				src = appc.fs.resolvePath(options.src),
				isDir = util.isDirectory(src),
				hook = state.hook;

			if (!isDir) {
				if (!fs.existsSync(src)) {
					return done("--src must be a directory");
				}
			}

			// load up our platform compile library
			var platform_compiler = path.join(options.platform_dir,'lib','compiler.js');
			if (!fs.existsSync(platform_compiler)) {
				return done("No platform compiler library for "+platform+" at "+platform_compiler);
			}
			platform_compiler = require(platform_compiler);

			// load up our platform compile library
			var platform_library = path.join(options.platform_dir,'lib','library.js');
			if (!fs.existsSync(platform_library)) {
				return done("No platform library for "+platform+" at "+platform_library);
			}
			platform_library = require(platform_library);

			var subtasks = [];
			if (!fs.existsSync(path.join(options.dest,platform_library.getLibraryFileName('hyperloop')))) {
				var subcommand = hyperloop.getCommand('library');
				subtasks.push(function(next){
					subcommand.execute(state,next);
				});
			}

			state.compile = state.compile || {};
			state.compile.params = {platform_library:platform_library,
									platform_compiler: platform_compiler,
									isDir: isDir, src:src};

			async.waterfall([
				function(callback) {
					async.series(subtasks, callback);
				},
				function(unused, callback) {
					excludeFiles(options, src, isDir, callback);
				},
				function(files, callback) {
					emit('collect.files', files, collectOptions, callback);
				},
				function(build_opts, callback) {
					emit('collect.build_opts', build_opts, collectArchitectures, callback);
				},
				function(archs, callback) {
					emit('collect.architectures', archs, compileApp, callback);
				},
				function(results, callback) {
					emit('pre.generate.app', results, generateApp, callback);
				},
				function(state, callback) {
					delete state.compile.params;
					callback(null);
				}
			], done);

		} catch (E) {
			done(E);
		}

		function emit(name, data, callback, next) {
			hook.emit(name, {state:state}, function(err) {
				callback(err, state, data, next);
			});
		}
	}
);

function generateApp(err, state, results, done) {
	var event = {
			options: state.options,
			state: state,
			results: results,
			settings: state.compile.params.settings,
			build_opts: state.compile.params.build_opts
		},
		hook = state.hook,
		platform_library = state.compile.params.platform_library;

	async.series([
		function(next) {
			platform_library.generateApp(event.options, event.results, event.settings, next);
		},
		function(next) {
			hook.emit('post.generate.app',event,next);
		}
	], function(err) { done(err, state); } );
}

function compileApp(err, state, archs, done) {
	if (err) return done(err);

	var options = state.options,
		platform_compiler = state.compile.params.platform_compiler,
		platform_library = state.compile.params.platform_library,
		build_opts = state.compile.params.build_opts,
		details = state.compile.params.details,
		settings = state.compile.params.settings,
		compiledSources = state.compile.params.compiledSources;

	async.each(archs, function(arch, next) {
		// initialize the library
		platform_compiler.initialize(options, build_opts, arch, details, settings, function(err, newstate) {
			if (err) return done(err);

			state = _.extend(state, newstate);

			// force an option for the src directory
			options.srcdir = path.join(options.dest, 'src', arch);
			options.jsSrcDir = path.join(options.dest, 'js', arch);
			if (!fs.existsSync(options.jsSrcDir)) {
				wrench.mkdirSyncRecursive(options.jsSrcDir);
			}

			if (!fs.existsSync(options.srcdir)) {
				wrench.mkdirSyncRecursive(options.srcdir);
			}

			// set the global platform in the typelib
			typelib.platform = options.platform_dir;

			// set the metabase
			typelib.metabase = state.metabase;
			
			// reset to remove any cached types since we're changing metabase
			typelib.reset();

			// set the build architecture as a compiler directive in hyperloop
			build_opts.OS_ARCHITECTURE = arch;
			options.arch = arch;
			options.srcfiles = [];

			compileSources(state, arch, next);	
		});
	}, function(err) { done(err, state.compile.params.results); });
}

function compileSources(state, arch, done) {
	var options = state.options,
		hook = state.hook,
		build_opts = state.compile.params.build_opts,
		compiledSources = state.compile.params.compiledSources,
		uncompiledSources = state.compile.params.uncompiledSources,
		platform_compiler = state.compile.params.platform_compiler,
		platform_library = state.compile.params.platform_library,
		symboltable = state.compile.params.symboltable,
		compiledFiles = {},
		compileTasks = [];

	state.compile.params.compiledFiles = compiledFiles;

	Object.keys(compiledSources).forEach(function(filename){
		var entry = compiledSources[filename],
			jsfilename = entry.jsfilename,
			relativeFilename = entry.relativeFilename,
			source = entry.source,
			target = entry.fn,
			fn = entry.fn;

		compileTasks.push(function(next){
			var event = {
				entry: entry,
				jsfilename: jsfilename,
				arch: arch,
				source: source,
				target: target,
				relativeFilename: relativeFilename,
				fn: fn,
				filename: filename,
				state: state,
				build_opts: build_opts,
				options: options,
				uncompiledSources: uncompiledSources
			};

			var tasks = [],
				ast,
				sourceobj,
				ir,
				srcFile;

			tasks.push(function(_next) {
				hook.emit('pre.compile.source',event,_next);
			});

			// before compile build hook if found
			platform_compiler.beforeCompile &&  tasks.push(function(_next){
				platform_compiler.beforeCompile(state,arch,filename,jsfilename,relativeFilename,event.source);
				_next();
			});

			tasks.push(function(_next){
				hook.emit('pre.compile.source.pre.ast',event,_next);
			});

			// compile into the ast
			tasks.push(function(_next){
				ast = compiler.compile(options, state, platform_compiler, arch, event.source, fn, jsfilename, event.build_opts);
				event.ast = ast;
				hook.emit('pre.compile.source.post.ast',event,_next);
			});

			// after compile build hook if found
			platform_compiler.afterCompile && tasks.push(function(_next){
				platform_compiler.afterCompile(state,arch,filename,jsfilename,relativeFilename,event.source,event.ast);
				_next();
			});

			tasks.push(function(_next){
				hook.emit('pre.compile.source.pre.compress',event,_next);
			});

			// compress the code
			tasks.push(function(_next){
				sourceobj = compiler.compress(event.ast, event.build_opts, fn, target, options, state);
				event.sourceobj = sourceobj;
				hook.emit('pre.compile.source.post.compress',event,_next);
			});

			tasks.push(function(_next){
				event.symbols = state.symbols;
				hook.emit('pre.compile.source.pre.validateSymbols',event,_next);
			});

			// validate all the found symbols
			platform_compiler.validateSymbols && tasks.push(function(_next){
				platform_compiler.validateSymbols(state,arch,event.symbols,nodefail);
				hook.emit('pre.compile.source.post.validateSymbols',event,_next);
			});

			tasks.push(function(_next){
				hook.emit('pre.compile.source.pre.ir',event,_next);
			});

			// turn it into IR
			tasks.push(function(_next){
				ir = entry.ir = new IR();
				ir.parse(state,arch,filename,jsfilename,relativeFilename,event.source,event.sourceobj.ast);
				event.ir = ir;
				hook.emit('pre.compile.source.post.ir',event,_next);
			});

			// if we have --dump-ir, generate the IR into build source directory
			if (options.dump_ir) {
				tasks.push(function(_next){
					var fn = path.join(options.jsSrcDir,relativeFilename+'.ir');
					fs.writeFile(fn, JSON.stringify(entry.ir,null,3), 'utf8', _next);
				});
			}

			tasks.push(function(_next){
				hook.emit('pre.compile.source.pre.generateCodeDependencies',event,_next);
			});

			// generate code
			tasks.push(function(_next){
				library.generateCodeDependencies(options,state,symboltable,relativeFilename,arch,event.symbols,nodefail);
				if (platform_library.generateCodeDependencies) {
					platform_library.generateCodeDependencies(options,state,symboltable,relativeFilename,arch,event.symbols,nodefail);
				}
				hook.emit('pre.compile.source.post.generateCodeDependencies',event,_next);
			});
			// write out our JS source to aid in debugging transformed code
			tasks.push(function(_next){
				srcFile = path.join(options.jsSrcDir, relativeFilename);
				var folder = srcFile.split('/');
				folder.pop();
				folder = folder.join('/');
				if(!fs.existsSync(folder)) {
					wrench.mkdirSyncRecursive(folder);
				}
				fs.writeFileSync(srcFile, event.sourceobj.ast.print_to_string({beautify:true}),'utf8');
				_next();
			});

			async.series(tasks, function(){													
				compiledFiles[filename] = {
					ast: event.sourceobj.ast,
					relativeFilename: relativeFilename,
					jsfilename: jsfilename,
					source: event.sourceobj,
					ir: event.ir
				};

				hook.emit('post.compile.source', event, next);
			});

		});
	});

	async.series(compileTasks, function(err) { finishCompileSources(err, state, arch, done); });
}

function finishCompileSources(err, state, arch, done) {
	if (err) { return done(err); }
	var options = state.options,
		hook = state.hook,
		build_opts = state.compile.params.build_opts,
		platform_compiler = state.compile.params.platform_compiler,
		compiledSources = state.compile.params.compiledSources,
		compiledFiles = state.compile.params.compiledFiles,
		uncompiledSources = state.compile.params.uncompiledSources,
		results = state.compile.params.results,
		symboltable = state.compile.params.symboltable,
		finishTasks = [],
		event = {
			state: state,
			symboltable: symboltable,
			arch: arch,
			uncompiledSources: uncompiledSources,
			compiledFiles: compiledFiles,
			compiler: platform_compiler,
			options: options,
			build_opts: build_opts
		};

	// log.fatal('compiledFiles=',Object.keys(compiledFiles),'uncompiledSources=',Object.keys(uncompiledSources));

	finishTasks.push(function(next){
		hook.emit('pre.generate.code', event, next);
	});

	finishTasks.push(function(next){
		// now that we've processed all JS code, we need to generate it
		library.generateCode(options,state,event.symboltable,arch,nodefail);
		hook.emit('post.generate.code', event, next);
	});

	finishTasks.push(function(next){
		// call finish which should now do the actual compiling, etc.
		platform_compiler.finish(options, event.build_opts, arch, state, event.uncompiledSources, event.compiledFiles, next);
	});

	finishTasks.push(function(next){
		hook.emit('pre.generate.library', event, next);
	});

	finishTasks.push(function(next){
		// after JS compile, finish
		codegen.generateLibrary(options, event.build_opts, arch, state, platform_compiler, event.uncompiledSources, event.compiledFiles, next);
	});

	async.series(finishTasks, function(err, r) {
		if (err) { return done(err); }
		// filter our tasks above that don't return values
		r = r.filter(function(v) { return v; });
		event.results = results[arch] = Array.isArray(r) ? r[0] : r;
		hook.emit('post.generate.library', event, done);
	});
}

function collectArchitectures(err, state, build_opts, done) {
	if (err) return done(err);

	var options = state.options,
		platform_library = state.compile.params.platform_library,
		files = state.compile.params.files,
		isDir = state.compile.params.isDir,
		src = state.compile.params.src;

	state.compile.params.build_opts = build_opts;

	// the header in case libraries want to use it
	options.header = util.HEADER;

	// place to put hyperloop header
	options.headerdir = options.dest;	

	platform_library.getArchitectures(options, function(err, archs, details, settings) {
		if (err) { return done(err); }

		var compiledSources = {},
			uncompiledSources = {},
			results = {},
			symboltable = {};

		files.forEach(function(filename) {
			if (!fs.existsSync(filename)) {
				throw new Error("Couldn't find source file", filename.magenta);
			}
			var source = fs.readFileSync(filename,'utf8').toString(),
				ext = path.extname(filename),
				looksLikeHL = ext==='.js' && source.indexOf('use hyperloop')>0,
							isJSON = ext==='.json';
			// quick check before we actually parse it
			if (!looksLikeHL) { 
				if (isJSON) {
					try {
						JSON.parse(source);
					}
					catch (JE) {
						throw new Error("File '"+filename+"' is not valid JSON");
					}
				}
				uncompiledSources[filename] = {source:source, json: isJSON};
			}
			else {
				var relativeFilename = isDir ? filename.replace(path.resolve(src), '') : src,
					relativeFilename = relativeFilename.charAt(0) === path.sep ? relativeFilename.substring(1) : relativeFilename,
					jsfilename = relativeFilename.replace(/[\s-\/]/g, '_').replace(/\.js(on)?$/, ''), // replace invalid chars
					fn = './' + jsfilename + path.extname(relativeFilename);

				compiledSources[filename] = {
					source: source,
					relativeFilename: relativeFilename,
					jsfilename: jsfilename,
					fn: fn
				};
			}
		});

		state.compile.params.compiledSources = compiledSources;
		state.compile.params.uncompiledSources = uncompiledSources;
		state.compile.params.archs = archs;
		state.compile.params.details = details;
		state.compile.params.settings = settings;
		state.compile.params.results = results;
		state.compile.params.symboltable = symboltable;

		done(null, archs);
	});
}

function collectOptions(err, state, files, done) {
	if (err) return done(err);

	var options = state.options,
		platform = options.platform;

	state.compile.params.files = files;

	if (files.length === 0) {
		return done('No source files found at'+src.magenta);
	}
	if (!fs.existsSync(options.dest)) {
		wrench.mkdirSyncRecursive(options.dest);
	}	
	var env = options.environment,
		env_dev = /^dev/i.test(env) || !env,
		env_prod = /^prod/i.test(env),
		env_test = /^test/i.test(env),
		build_opts = {
			"DEBUG": options.debug || false,
			"TITANIUM_VERSION": "0.0.0",
			"TITANIUM_BUILD_HASH": "",
			"TITANIUM_BUILD_DATE": new Date().toString(),
			"OS_IOS": /(ios|iphone|ipad)/i.test(platform),
			"OS_IPHONE": /(ios|iphone)/i.test(platform),
			"OS_IPAD": /(ios|ipad)/i.test(platform),
			"OS_ANDROID": /(android)/i.test(platform),
			"OS_BLACKBERRY": /(blackberry)/i.test(platform),
			"OS_WINDOWS": /(windows)/i.test(platform),
			"OS_WEB": /(web|html)/i.test(platform),
			"OS_MOBILEWEB": /(web|html)/i.test(platform),
			"OS_TIZEN": /(tizen)/i.test(platform),
			"ENV_DEV": env_dev,
			"ENV_DEVELOPMENT": env_dev,
			"ENV_TEST": env_test,
			"ENV_PRODUCTION": env_prod,
			"DUMP_AST": true
		},
		ti_key = /^ti-/i,
		hl_key = /^hl-/i;

	// attempt to pass in any additional keys from command line which will
	// customize our compression
	Object.keys(options).forEach(function(k) {
		var value = options[k];
		if (ti_key.test(k)) {
			k = k.replace(ti_key, 'TITANIUM_').replace(/-/g, '_').toUpperCase();
			build_opts[k] = value;
		} else if (hl_key.test(k)) {
			k = k.replace(hl_key, 'HYPERLOOP_').replace(/-/g, '_').toUpperCase();
			build_opts[k] = value;
		} else {
			build_opts[k.toUpperCase()] = value;
		}
	});

	done(null, build_opts);
}

function excludeFiles(options, src, isDir, done) {
	// include both .js and .json
	var excludeFilter = options.excludes ?
		typeof(options.excludes)==='string' ? function(fn,dir){return new RegExp(options.excludes).test(fn,dir);} :
		typeof(options.excludes)==='object' ? function(fn,dir){return options.excludes.test(fn,dir);} : 
		typeof(options.excludes)==='function' ? options.excludes : null : null,
	fileFilter = function(fn,fndir) {
		// allow a filter to be defined as regular expression
		var ff = excludeFilter ? !excludeFilter(path.basename(fn),fndir) : true;
		return /\.js(on)?$/.test(fn) && ff;
	};
	done(null, isDir ? util.filelisting(src, fileFilter, undefined, options.dest) : [src]);
}


function nodefail(node, msg) {
	var location = node.location || node;
	throw new Error(msg+" at "+(location.file+":"+location.line).green);
}

module.exports = compile;
