/**
 * common utilities
 */
var _ = require('underscore'),
	fs = require('fs'),
	path = require('path'),
	ejs = require('ejs'),
	appc = require('node-appc'),
	uuid = require('node-uuid'),
	wrench = require('wrench'),
	log = require('./log'),
	crypto = require('crypto');

// module interface

exports.copyAndFilterEJS = copyAndFilterEJS;
exports.copyAndFilterString = copyAndFilterString;
exports.filterString = filterString;
exports.copyFileSync = copyFileSync;
exports.appendFileSync = appendFileSync;
exports.prependFileSync = prependFileSync;
exports.downloadResourceIfNecessary = downloadResourceIfNecessary;
exports.escapePaths = escapePaths;
exports.guid = guid;
exports.isDirectory = isDirectory;
exports.sha1 = sha1;
exports.writableHomeDirectory = writableHomeDirectory;
exports.setTemplateDefaultArgs = setTemplateDefaultArgs;
exports.renderTemplate = renderTemplate;
exports.writeIfDifferent = writeIfDifferent;
exports.multilineComment = multilineComment;
exports.sanitizeSymbolName = sanitizeSymbolName;
exports.filelisting = filelisting;
exports.rpad = rpad;
exports.die = die;

exports.HEADER = [
	'/**',
	' * DO NOT EDIT - this is a generated file',
	' * This source code is protected by US and International Patent Laws and contains',
	' * patents or patents pending. Copyright (c) 2014 Appcelerator, Inc.',
	' */'
].join('\n')+'\n';


// implementation

const ignoreList = /\.(CVS|svn|git|DS_Store)$/;

function copyAndFilterEJS(from, to, obj) {
	obj = obj || {};
	if (!from || !to) {
		throw new TypeError('Bad arguments. from and to must be defined as strings.');
	}

	var content = fs.readFileSync(from,'utf8').toString(),
		output = ejs.render(content, obj);

	return writeIfDifferent(to, output);
}

function copyAndFilterString(from, to, obj) {
	obj = obj || {};
	if (!from || !to) {
		throw new TypeError('Bad arguments. from and to must be defined as strings.');
	}
	var template = fs.readFileSync(from, 'utf8'),
		filtered = filterString(template, obj);
	
	return writeIfDifferent(to, filtered);
}

function filterString(contents, obj) {
	Object.keys(obj).forEach(function(key) {
		var value = obj[key];
		contents = contents.replace(new RegExp(key, 'g'), value);
	});
	return contents;
}

/**
 * copy srcFile to destFile and optionally, filter based on function
 */
function copyFileSync(srcFile, destFile, filter) {
	if (!srcFile || !destFile) {
		throw new TypeError('Bad arguments. srcFile and destFile must be defined as strings.');
	}

	if (!ignoreList.test(srcFile)) {

		// if we have a filter and it passed or if we don't have one at all
		if (!filter || (typeof(filter)==='function' && filter(srcFile, destFile))) {

			// copy file
			if (!isDirectory(srcFile)) {
				var contents = fs.readFileSync(srcFile,'utf8');
				fs.writeFileSync(destFile, contents, 'utf8');

				// set permissions to that of original file
				var stat = fs.lstatSync(srcFile);
				fs.chmodSync(destFile, stat.mode);

				log.debug('copying', srcFile.cyan, 'to', destFile.cyan);
			}
		}
	}
}

/**
 * append contents in fromFile to toFile
 */
function appendFileSync(fromFile, toFile) {
	if (!fromFile || !toFile) {
		throw new TypeError('Bad arguments. fromFile and toFile must be defined as strings.');
	}
	var fromContents = fs.readFileSync(fromFile,'utf8'),
		toContents = fs.readFileSync(toFile,'utf8'),
		destContents = String(toContents) + String(fromContents);

	fs.writeFileSync(toFile, destContents, 'utf8');
	
	log.debug('appending', fromFile.cyan, 'to', toFile.cyan);
}

/**
 * prepend contents in fromFile to toFile
 */
function prependFileSync(fromFile, toFile) {
	if (!fromFile || !toFile) {
		throw new TypeError('Bad arguments. fromFile and toFile must be defined as strings.');
	}
	var fromContents = fs.readFileSync(fromFile,'utf8'),
		toContents = fs.readFileSync(toFile,'utf8'),
		destContents = String(fromContents) + String(toContents);

	fs.writeFileSync(toFile, destContents, 'utf8');
	
	log.debug('prepending', fromFile.cyan, 'to', toFile.cyan);
}

function escapePaths(cmd) {
	cmd = cmd || '';
	if (!_.isString(cmd)) {
		throw new TypeError('Bad argument, must be a string');
	}
	return cmd.replace(/(["\s'$`\\])/g,'\\$1');
}

function guid() {
	return uuid.v4().toUpperCase();
}

/**
 * returns true if file path is a directory
 */
function isDirectory(file) {
	return fs.existsSync(file) && fs.statSync(file).isDirectory();
}

/**
 * return the sha1 of the contents string
 */
function sha1(contents) {
	return crypto.createHash('sha1').update((contents || '').toString()).digest('hex');
}

/**
 * return a writeable home directory for hyperloop
 */
function writableHomeDirectory() {
	var dir;

	if (process.platform === 'darwin') {
		dir = path.join(process.env.HOME,'Library','Application Support','org.appcelerator.hyperloop');
	}
	else {
		dir = path.join(appc.fs.home(),'hyperloop');
	}
	if (!fs.exists(dir)) {
		wrench.mkdirSyncRecursive(dir);
	}
	return dir;
}

/**
 * download a pre-build third-party tool / library
 */
function downloadResourceIfNecessary(name, version, url, checksum, dir, callback) {

	if (!name || !version || !url || !checksum || !dir) {
		throw new TypeError('Bad argument. name, version, url, checksum, and dir are not optional and must be a defined');
	}

	var verFn = path.join(dir,name+'-version.txt'),
		zf = path.join(dir,name+'.zip'),
		zipdir = path.join(dir,name),
		localVersion = fs.existsSync(verFn) ? fs.readFileSync(verFn,'utf8').toString() : null,
		resultExists = name !== 'ios-sim' || fs.existsSync(path.join(zipdir, name));

	if (version !== localVersion || !resultExists) {
		var http = require('http'),
			urllib = require('url'),
			req = http.request(urllib.parse(url)),
			hash = crypto.createHash('sha1');

		if (!fs.existsSync(zipdir)) {
			wrench.mkdirSyncRecursive(zipdir);
		}

		req.on('response', function(res) {
			if (res.statusCode !== 200) {
				return callback(new Error("error loading url: "+url+", status: "+res.statusCode));
			}
			var len = parseInt(res.headers['content-length'], 10),
				stream = fs.createWriteStream(zf),
				bar;

			// workaround appc.progressbar's lack of a quiet option
			var msgRaw = '  Downloading ' + name + ' library' + ' [] ' + ' :percent :etas',
				msg = '  Downloading ' + name + ' library'.magenta + ' [:bar]' + ' :percent :etas'.cyan,
				originalMsg = msg,
				progressWidth = process.stdout.columns - msgRaw.length;
			if (progressWidth <= 5) {
				msgRaw = '  Downloading ' + ' :percent :etas';
				msg = '  Downloading [:bar]' + ' :percent :etas'.cyan;
				progressWidth = process.stdout.columns - msgRaw.length;
			}
			if (progressWidth <= 5) {
				log.info(originalMsg.split('[:bar')[0]);
				msg = ':bar';
				progressWidth = process.stdout.columns - 5;
			}
			// TODO: send PR to node-appc to add quiet option to progressbar
			if (log.level !== 'quiet' && process.stdout.isTTY) {
				bar = new appc.progress(msg, {
					complete: '=',
					incomplete: ' ',
					width: progressWidth,
					total: len
				});
			} else {
				bar = { tick: function(){} };
			}

			bar.tick(0);

			res.on('data', function(chunk) {
				bar.tick(chunk.length);
				hash.update(chunk);
				stream.write(chunk, 'binary');
			});
			
			var closed = false,
				checked = false;
			stream.once('close', function() {
				closed = true;
				performChecks();
			});

			res.on('end', function() {
				if (!closed) {
					stream.once('drain', performChecks);
					stream.end();
				}
				else {
					performChecks();
				}
			});
			
			function performChecks() {
				if (checked) {
					return;
				}
				checked = true;
				stream.close();
				if (log.level !== 'quiet') {
					process.stdout.clearLine && process.stdout.clearLine();  // clear current text
					process.stdout.cursorTo && process.stdout.cursorTo(0);  // move cursor to beginning of line
					process.stdout.write(process.platform === 'win32' ? '\r\n\r\n' : '\n');
				}

				var checkChecksum = hash.digest('hex');
				if (checkChecksum !== checksum) {
					return callback(new Error("Invalid checksum (" + checkChecksum + ") received, expected (" + checksum + ") for " + url));
				}
				log.info('extracting zip contents');
				appc.zip.unzip(zf, zipdir, function(err) {
					if (err) { return callback(err); }
					log.debug('unzip completed, contents should be in', zipdir);
					fs.writeFileSync(verFn, version, 'utf8');
					fs.unlink(zf, callback);
				});
			}
		});

		req.end();

	}
	else {
		callback();
	}
}

/*
 Variable state for setTemplateDefaultArgs and renderTemplate.
 */
var templateCache = {},
	templateDefaultArgs = {};

/**
 *
 * @param args
 */
function setTemplateDefaultArgs(args) {
	templateDefaultArgs = args;
}

/**
 * Flexibly renders an EJS template, such that the template can render other templates relative to its directory, and
 * using the args passed in plus the args passed once to this module's 'setTemplateDefaultArgs' method.
 * @param name The string name of the template, relative to the current directory, such as "templates/class_header.ejs"
 * @param args The args dictionary to pass to the template renderer, which will be mixed with the template defaults.
 * @param dirname The optional current dirname of the script. Defaults to the parent template's provided dirname, or
 *                __dirname, which will be relative to this util module. (Generally, you want to pass this if you're
 *                calling this from a JS file, and don't pass it if calling from an EJS.)
 * @param nameIsTemplateContents If true, the "name" param will be treated as a string template instead of as a path to
 *                               the template.
 */
function renderTemplate(name, args, dirname, nameIsTemplateContents) {
	args = _.defaults(args || {}, this.renderTemplateArgs || {}, templateDefaultArgs);
	var template;
	if (nameIsTemplateContents) {
		template = name;
	} else {
		template = templateCache[name];
		if (!template) {
			template = templateCache[name] = fs.readFileSync(path.join(dirname
				|| this.renderTemplateDirName
				|| __dirname, name),'utf8').toString();
		}
	}
	args.renderTemplate = renderTemplate;
	args.renderTemplateArgs = args;
	args.renderTemplateDirName = dirname;
	var result = ejs.render(template, args);
	if (!nameIsTemplateContents && log.shouldLog('debug') && name.indexOf('.ejs') >= 0) {
		result = '/* START ' + name + ' */\n'
			+ result
			+ '\n/* END ' + name + ' */';
	}
	return result;
}

/**
 * If the file at path contains different contents than the supplied "contents" string, or if it doesn't exist, write.
 * @param path
 * @param contents
 */
function writeIfDifferent(path, contents) {
	if (!fs.existsSync(path)) {
		fs.writeFileSync(path, contents, 'utf8');
		log.debug('created', path.white);
		return true;
	}
	else if (fs.readFileSync(path, 'utf8') != contents) {
		fs.writeFileSync(path, contents, 'utf8');
		log.debug('modified', path.white);
		return true;
	}
	return false;
}

/**
 * utility for generating a mult-line comment
 * @param line
 */
function multilineComment(line) {
	var code = [],
		lines = line.split('\n');
	code.push('/**');
	lines.forEach(function(l){
		code.push(' * '+l);
	});
	code.push(' */');
	return code.join('\n');
}

function sanitizeSymbolName(type) {
	return type.replace('[]', 'Array')
		.replace(/[<>]/g, '$')
		.replace(/`\d/, '')
		.replace(/\s/g, '')
		.replace(/:/g, '_')
		.replace(/[`\(\)\[\]\s,\.]/g, '_')
		.replace(/\^/g, '')
		.replace(/\*/g, '')
		.replace(/'/g,'')
		.replace(/\./g,'');
}

var EXCLUDE_DIRS = ['.DS_Store','.git','.svn','CVS','RCS','SCCS'];

/**
 * Recursively get a listing of files for a given directory
 */
function filelisting(dir, filter, files, dest) {
	files = files || [];
	var type = typeof(filter);
	fs.readdirSync(dir).forEach(function(f) {
		if (f === dest) {
			return;
		}
		f = path.join(path.resolve(dir), f);
		var base = path.basename(f);
		if (isDirectory(f)) {
			!~EXCLUDE_DIRS.indexOf(f) && filelisting(f, filter, files, dest);
		}
		else {
			if (filter) {
				if (type === 'function') {
					filter(f,dir) && files.push(f);
				}
				else if (type == 'object') {
					filter.test(f) && files.push(f);
				}
			}
			else {
				files.push(f);
			}
		}
	});
	return files;
}

function rpad() {
	var len = arguments[0],
		line = '';
	for (var c=1;c<arguments.length;c++) {
		line+=arguments[c];
		if (c+1<arguments.length) {
			line+=' ';
		}
	}
	for (var c=line.length;c<len;c++) {
		line+=' ';
	}
	return line;
}

function createErrorOutput(msg, e) {
	var errs = [msg || 'An unknown error occurred'];
	var posArray = [];

	if (e) {
		var line = e.line || e.lineNumber;
		if (e.message) { errs.push(e.message.split('\n')); }
		if (line)  { posArray.push('line ' + line); }
		if (e.col) { posArray.push('column ' + e.col); }
		if (e.pos) { posArray.push('position ' + e.pos); }
		if (posArray.length) { errs.push(posArray.join(', ')); }

		// add the stack trace if we don't get anything good
		if (errs.length < 2) { errs.unshift(e.stack); }
	} else {
		errs.unshift(e.stack);
	}

	return errs;
}

function die(msg, e) {
	if (e) {
		log.error(createErrorOutput(msg, e));
	} else {
		log.error(msg);
	}
	process.exit(1);
}
