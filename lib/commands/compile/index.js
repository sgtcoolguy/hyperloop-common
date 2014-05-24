var Command = require('../../command'),
	util = require('../../util'),
	typelib = require('../../compiler/type'),
	compiler = require('../../compiler/ast'),
	library = require('../../compiler/library'),
	codegen = require('../../compiler/codegen'),
	IR = require('../../compiler/IR'),
	log = require('../../log'),
	appc = require('node-appc'),
	path = require('path'),
	wrench = require('wrench'),
	fs = require('fs');

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
				isDir = util.isDirectory(src);

			if (isDir && !fs.existsSync(path.join(src, 'app.js'))) {
				return done('No app.js file found in'+src.yellow);
			}

			// include both .js and .json
			var excludeFilter = options.excludes ?
				typeof(options.excludes)==='string' ? function(fn,dir){return new RegExp(options.excludes).test(fn,dir);} :
				typeof(options.excludes)==='object' ? function(fn,dir){return options.excludes.test(fn,dir);} : 
				typeof(options.excludes)==='function' ? options.excludes : null : null,
				fileFilter = function(fn,fndir) {
					// allow a filter to be defined as regular expression
					var ff = excludeFilter ? !excludeFilter(path.basename(fn),fndir) : true;
					return /\.js(on)?$/.test(fn) && ff;
				},
				files = isDir ? util.filelisting(src, fileFilter, undefined, options.dest) : [src];
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
					"ENV_PRODUCTION": env_prod
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

			// load up our platform compile library
			var platform_compiler = path.join(options.platform_dir,'lib','compiler.js');
			if (!fs.existsSync(platform_compiler)) {
				log.fatal("No platform compiler library for "+platform+" at "+platform_compiler);
			}
			platform_compiler = require(platform_compiler);

			// the header in case libraries want to use it
			options.header = util.HEADER;

			var platform_library = path.join(options.platform_dir,'lib','library.js');
			if (!fs.existsSync(platform_library)) {
				log.fatal("No platform library for "+platform+" at "+platform_library);
			}
			platform_library = require(platform_library);
			
			// place to put hyperloop header
			options.headerdir = options.dest;

			platform_library.getArchitectures(options, function(err, archs, details, settings){
				err && log.fatal(err);

				var index = 0,
					compiledSources = {},
					uncompiledSources = {},
					results = {},
					symboltable = {};

				files.forEach(function(filename) {
					if (!fs.existsSync(filename)) {
						log.fatal("Couldn't find source file", filename.magenta);
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
								log.fatal("File '"+filename.cyan+"' is not valid JSON");
							}
						}
						uncompiledSources[filename] = {source:source, json: isJSON};
					}
					else {
						var relativeFilename = isDir ? filename.replace(path.resolve(src), '') : src,
							relativeFilename = relativeFilename.charAt(0) === '/' ? relativeFilename.substring(1) : relativeFilename,
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


				(function nextArch(err) {
					err && log.fatal(err);

					var arch = archs[index++];
					if (arch) {

						// initialize the library
						platform_compiler.initialize(options, build_opts, arch, details, settings, function(err, state) {
							err && log.fatal(err);

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

							options.srcfiles = [],
								compiledFiles = {},
								uncompiledFiles = uncompiledSources;

							Object.keys(compiledSources).forEach(function(filename){
								var entry = compiledSources[filename],
									jsfilename = entry.jsfilename,
									relativeFilename = entry.relativeFilename,
									source = entry.source,
									target = entry.fn,
									fn = entry.fn;

								// before compile build hook if found
								platform_compiler.beforeCompile && platform_compiler.beforeCompile(state,arch,filename,jsfilename,relativeFilename,source);

								// compile into the ast
								var ast = compiler.compile(options, state, platform_compiler, arch, source, fn, jsfilename, build_opts);

								// after compile build hook if found
								platform_compiler.afterCompile && platform_compiler.afterCompile(state,arch,filename,jsfilename,relativeFilename,source,ast);

								// compress the code
								var sourceobj = compiler.compress(ast, build_opts, fn, target, options, state);

								// validate all the found symbols
								platform_compiler.validateSymbols && platform_compiler.validateSymbols(state,arch,state.symbols,nodefail);

								// turn it into IR
								var ir = entry.ir = new IR();
								ir.parse(state,arch,filename,jsfilename,relativeFilename,source,sourceobj.ast);

								// if we have --dump-ir, generate the IR into build source directory
								if (options.dump_ir) {
									var fn = path.join(options.jsSrcDir,relativeFilename+'.ir');
									fs.writeFileSync(fn, JSON.stringify(ir,null,3), 'utf8');
								}

								// generate code
								library.generateCodeDependencies(options,state,symboltable,relativeFilename,arch,state.symbols,nodefail);

								// write out our JS source to aid in debugging transformed code
								var srcFile = path.join(options.jsSrcDir, relativeFilename);
								fs.writeFileSync(srcFile, sourceobj.ast.print_to_string({beautify:true}),'utf8');
								
								compiledFiles[filename] = {
									ast: sourceobj.ast,
									relativeFilename: relativeFilename,
									jsfilename: jsfilename,
									source: sourceobj,
									ir: ir
								};

							});

							// now that we've processed all JS code, we need to generate it
							library.generateCode(options,state,symboltable,arch,nodefail);

							// call finish which should now do the actual compiling, etc.
							platform_compiler.finish(options, build_opts, arch, state, uncompiledFiles, compiledFiles, function(err) {
								err && log.fatal(err);
								// after JS compile, finish
								codegen.generateLibrary(options, build_opts, arch, state, platform_compiler, uncompiledSources, compiledFiles, function(err,r){
									err && log.fatal(err);
									results[arch] = r;
									nextArch();
								});
							});
						});
					}
					else {
						platform_library.generateApp(options, results, settings, function(err, libfile) {
							if (err) {
								done(err);
							}
							done();
						});
					}

				})();

			});
		} catch (E) {
			done(E);
		}

		function nodefail(node, msg) {
			var location = node.location || node;
			log.fatal(msg+" at "+(location.file+":"+location.line).green);
		}
	}
);

module.exports = compile;
