/**
 * generic compiler
 */
var fs = require('fs'),
	path = require('path'),
	wrench = require('wrench'),
	log = require('../log'),
	util = require('../util'),
	jsgen = require('./jsgen'),
	syslibrary = require('./library');

exports.generateLibrary = generateLibrary;

function generateLibrary (options, build_opts, arch, state, library, uncompiledFiles, compiledFiles, callback) {
	// we are going to load the platform library from the platform dir
	var platform_lib = path.join(options.platform_dir, 'lib','library.js');
	if (!fs.existsSync(platform_lib)) {
		return callback("Couldn't find platform library at "+platform_lib);
	}
	platform_lib = require(platform_lib);

	var filemap = [],
		externs = [];

	function makeRelative(p) {
		if (p=='.') {
			p = '/';
		}
		else if (p.charAt(0)!='/') {
			p = '/'+p;
		}
		return p;
	}

	Object.keys(compiledFiles).forEach(function(key){
		var obj = compiledFiles[key],
			relative = makeRelative(path.relative(options.src,key)),
			symbols = [],
			symbolnames = [],
			cleanup = [],
			code = generateMain(options, state, obj, symbols, symbolnames, externs, cleanup),
			header = generateHeader(options, state, obj),
			fn = path.join(options.srcdir, obj.jsfilename + library.getFileExtension());
			fnh = path.join(options.dest, obj.jsfilename + library.getFileExtension(true)),
			root = path.resolve(options.src) == path.resolve(path.dirname(key)),
			dirname = makeRelative(path.dirname(obj.relativeFilename));

		// give platform library a chence to append something
		platform_lib.generateMain && platform_lib.generateMain(options, state, obj, symbols, symbolnames, externs, cleanup);
	
		syslibrary.writeSourceFile(options, platform_lib, fn, code, true)
		fs.writeFileSync(fnh,header,'utf8');

		filemap.push({
			compiled: true,
			filename: relative,
			source: obj.source.inlinecode,
			root: root,
			id: obj.jsfilename,
			filename: relative,
			dirname: dirname,
			symbols: symbols,
			symbolnames: symbolnames,
			cleanup: cleanup,
			ir: obj.ir
		});
	});

	Object.keys(uncompiledFiles).forEach(function(key){
		var obj = uncompiledFiles[key],
			relative = obj.relative ? obj.relative : makeRelative(path.relative(options.src,key)),
			root = obj.root ? obj.root : path.resolve(options.src) == path.resolve(path.dirname(key)),
			dirname = obj.dirname ? obj.dirname : makeRelative(path.dirname(relative));

		filemap.push({
			compiled: false,
			source: obj.source,
			root: root,
			dirname: dirname,
			filename: relative,
			json: obj.json
		});
	});

	// generate our source embed 
	generateSourceEmbed(syslibrary,options,state,platform_lib,filemap,externs);

	// save our source cache
	syslibrary.saveSourceCache(options);

	options.libname = platform_lib.getLibraryFileName(options.name);

	// write out the symbol map for the library
	var symmap = jsgen.getSymbolMap();
	fs.writeFileSync(path.join(options.dest,'app_symbols.json'),JSON.stringify(symmap,null,'\t'),'utf8');

	// run the compile
	platform_lib.compileLibrary(options, arch, state.metabase, callback);
}

function generateDecode(jscodevar, indent, code, varname) {
	var buf = jsgen.makeVariableName(),
		result = jsgen.makeVariableName();
	code.push(indent+'char '+buf+'['+jscodevar+'_length+1];');
	code.push(indent+'memset('+buf+',0,'+jscodevar+'_length);');
	code.push(indent+buf+'['+jscodevar+'_length]=\'\\0\';');
	code.push(indent+'HL_DECODE_'+jscodevar+'('+jscodevar+','+buf+');');
	code.push(indent+'std::string '+result+' = base64_decode(std::string('+buf+'));');
	code.push(indent+'auto '+varname+' = JSStringCreateWithUTF8CString('+result+'.c_str());');
	code.push(indent+'memset('+buf+',0,'+jscodevar+'_length);');
	return result;
}

function generateRequire(state,indent, ir, id, filename, dirname, symbols, symbolnames, cleanup, jscode, code, jscodevar, moduleid) {
	code.push(indent+'static JSValueRef result = nullptr;');
	code.push(indent+'if (result==nullptr)');
	code.push(indent+'{');

	// increase indent level
	indent+='\t';

	code.push('');
	code.push(indent+'// get the global object');
	code.push(indent+'auto object = JSContextGetGlobalObject(ctx);');
	code.push('');

	// properties that we are going to save and then restore in the global scope each
	// time we load a module
	var modulePropertyNames = ['module','exports','__filename','__dirname','require'],
		moduleVariables = {};

	// save off our global module variables that we will later re-link after the module is loaded
	modulePropertyNames.forEach(function(name){
		var n = jsgen.makeVariableName(),
			v = jsgen.makeVariableName();
		code.push(indent+'// '+name);
		code.push(indent+'auto '+n+' = JSStringCreateWithUTF8CString("'+name+'");');
		code.push(indent+'auto '+v+' = JSObjectGetProperty(ctx,object,'+n+',exception);');
		moduleVariables[name]=[n,v];
	});


	code.push(indent+'// create the module object');
	code.push(indent+'auto module = HyperloopCreateModule(ctx,parent,"'+filename+'","'+dirname+'",exception);');
	code.push('');

	code.push(indent+'// set properties into our global scope from the module');
	modulePropertyNames.forEach(function(name){
		var vars = moduleVariables[name];
		if (name!=='module') {
			code.push(indent+'JSObjectSetProperty(ctx,object,'+vars[0]+',JSObjectGetProperty(ctx,module,'+vars[0]+',exception),0,exception);');
		}
		else {
			code.push(indent+'JSObjectSetProperty(ctx,object,'+vars[0]+',module,0,exception);');
		}
	});
	code.push('');

	// process builtin symbols such as memory operations
	if (state.builtin_symbols) {
		code.push(indent+'// process builtin symbols');
		Object.keys(state.builtin_symbols).forEach(function(key) {
			code.push(indent+'auto '+key+'Property = JSStringCreateWithUTF8CString("'+key+'");');
			code.push(indent+'auto '+key+'Fn = JSObjectMakeFunctionWithCallback(ctx,'+key+'Property,'+key+');');
			code.push(indent+'JSObjectSetProperty(ctx,object,'+key+'Property,'+key+'Fn,kJSPropertyAttributeReadOnly|kJSPropertyAttributeDontEnum|kJSPropertyAttributeDontDelete,nullptr);');
			code.push('');
		});
	}

	if (symbols && symbols.length) {
		code.push(indent+'// process our symbols in scope');
		symbols.forEach(function(line){
			code.push(indent+line);
		});
		code.push('');
	}

	if (ir) {
		code.push(indent+'// ---- IR code generation ----');
		code.push('');
		ir.toNative().forEach(function(line){
			code.push(indent+line);
		});
	}
	else {
		code.push(indent+'// ---- static code ----');
		code.push('');
		var v = jsgen.makeVariableName(),
			n = jsgen.makeVariableName();
		generateDecode(jscodevar,indent,code,n);
		code.push('');
		code.push(indent+'auto '+v+' = JSStringCreateWithUTF8CString("'+filename+'");');
		code.push(indent+'JSEvaluateScript(ctx,'+n+',nullptr,'+v+',1,exception);');
		code.push(indent+'JSStringRelease('+v+');');
		code.push(indent+'CHECK_EXCEPTION(exception);');
	}

	code.push('');	
	code.push(indent+'// tell the module we\'re loaded');
	code.push(indent+'result = HyperloopModuleLoaded(ctx,module);');

	code.push('');	
	code.push(indent+'// restore previous module values back into global');	
	modulePropertyNames.forEach(function(name){
		var vars = moduleVariables[name];
		code.push(indent+'JSObjectSetProperty(ctx,object,'+vars[0]+','+vars[1]+',0,exception);');
		code.push(indent+'JSStringRelease('+vars[0]+');');
	});

	code.push('');
/**
 	FIXME: don't release them for now since blocks won't work

	code.push(indent+'// remove properties')

	symbolnames && symbolnames.forEach(function(name){
		code.push(indent+'JSObjectDeleteProperty(ctx,object,'+name+'Property,exception);');
	});
*/

	code.push('');
	code.push(indent+'// cleanup')

	cleanup && cleanup.forEach(function(line){
		code.push(indent+line);
	});

	code.push('');

	// decrease indent level
	indent = indent.substring(0,indent.length-1);

	code.push(indent+'}');
	code.push(indent+'return result;');

	return jscode;
}

function generateVarname (name) {
	var x = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_',
		buf = '_',
		len = 4;
	for (var c=0;c<len;c++) {
		buf+=x.charAt(Math.round(Math.random() * x.length));
	}
	buf+='$';
	for (var c=0;c<name.length;c++) {
		var ch = name.charAt(c);
		switch (ch) {
			case '@':
			case '!':
			case '^':
			case '&':
			case '\\':
			case '%':
			case '^':
			case '#':
			case '*':
			case '(':
			case ')':
			case '+':
			case '=':
			case '{':
			case '}':
			case '|':
			case '[':
			case ']':
			case '~':
			case '`':
			case '\'':
			case '<':
			case '>':
			case ',':
			case '?':
			case '"':
			case ':':
			case ';':
			case '.':
			case '-':
			case '/':
			case ' ':
				ch = '_';
				break;
		}
		buf+=ch;
		buf+=x.charAt(Math.round(Math.random() * x.length));
	}
	return buf;
}

function generateSourceEmbed (library, options, state, platform_lib, filemap, externs) {

	var moduleid = options.moduleid ? options.moduleid.replace(/\./g,'_') : 'Source',
		name = options.moduleid ? 'HL_jscode_'+moduleid : 'HL_jscode',
		fn = path.join(options.srcdir, name+platform_lib.getFileExtension(false)),
		code = [];

	code.push(util.HEADER);
	code.push('');
	code.push('#include <hyperloop.h>');
	code.push('#include <map>');
	code.push('');

	var ecode = [],
		defines = [],
		decoders = [],
		mapping = [],
		varnames = [];

	state.builtin_symbols && Object.keys(state.builtin_symbols).forEach(function(key) {
		externs.push('EXPORTAPI JSValueRef '+key+'(JSContextRef ctx, JSObjectRef function, JSObjectRef thisObject, size_t argumentCount, const JSValueRef arguments[], JSValueRef* exception);');
	});

	ecode.push(util.multilineComment('load up embedded source code from the app'));
	ecode.push('EXPORTAPI JSValueRef HyperloopLoadEmbedSource(JSGlobalContextRef ctx, const JSObjectRef & parent, const char *path, JSValueRef *exception)');
	ecode.push('{');
	ecode.push('\tstd::string filepath(path);');
	filemap.forEach(function(fe){
		var pathNoExt = fe.filename.replace(/\.js(on)?$/,''),
			id = fe.id || path.basename(pathNoExt),
			fn = (options.moduleid ? '/'+options.moduleid : '') + fe.filename,
			compare = 'if (filepath.find("'+fn+'")==0)',
			varname = generateVarname(id),
			debugfn = options.debugsource && path.join(options.srcdir,fn),
			genjs = fe.json;
		ecode.push('\t'+compare);
		ecode.push('\t{');
		if (fe.json) {
			ecode.push('\t\tstatic JSValueRef result = nullptr;');
			ecode.push('\t\tif (result==nullptr)');
			ecode.push('\t\t{');
			var n = jsgen.makeVariableName();
			generateDecode(varname,'\t\t\t',ecode,n);
			ecode.push('\t\t\tresult = JSValueMakeFromJSONString(ctx,'+n+');');
			ecode.push('\t\t\tJSStringRelease('+n+');');
			ecode.push('\t\t}');
			fe.cleanup && fe.cleanup.forEach(function(cl) {
				ecode.push('\t\t\t'+cl);
			});
			ecode.push('\t\treturn result;');
			var define = jsgen.generateDefine(varname,jsgen.transform(fe.source,null,null,debugfn));
			defines.push('// '+fn+'\n'+define);
		}
		else {
			generateRequire(state,'\t\t',fe.ir,id,fe.filename,fe.dirname,fe.symbols,fe.symbolnames,fe.cleanup,fe.source,ecode,varname,options.moduleid,options.debugsource);
			if (!fe.ir) {
				var define = jsgen.generateDefine(varname,jsgen.transform(fe.source,null,null,debugfn));
				defines.push('// '+fn+'\n'+define);
				genjs = true;
			}
		}
		ecode.push('\t}');
		mapping.push({filename:fn,varname:varname});
		genjs && decoders.push(jsgen.generateDecoder(varname));
		varnames.push(fn);
	});

	code.push(jsgen.generateBody(null, options.xor, defines));
	code.push('');

	code = code.concat(decoders);

	externs.length && code.push('// externs');
	externs.forEach(function(e){
		e = /^EXPORTAPI/.test(e) ? e : 'EXPORTAPI '+e;
		code.push(e);
	});
	code.push('');

	code = code.concat(ecode);

	code.push('\tauto msg = std::string("Cannot find module \'");');
	code.push('\tmsg+=filepath;');
	code.push('\tmsg+=std::string("\'");');
	code.push('\tauto result = HyperloopMakeException(ctx,msg.c_str());');
	code.push('\tauto msgStr = HyperloopMakeString(ctx,"MODULE_NOT_FOUND",0);');
	code.push('\tauto code = JSStringCreateWithUTF8CString("code");');
	code.push('\tauto obj = JSValueToObject(ctx,result,0);');
	code.push('\tJSObjectSetProperty(ctx, obj, code, msgStr, 0, 0);');
	code.push('\tJSStringRelease(code);');
	code.push('\t*exception = result;');
	code.push('\treturn JSValueMakeUndefined(ctx);');
	code.push('}');

	code.push('');

	code.push('EXPORTAPI void HyperloopInitialize_'+moduleid+'()');
	code.push('{');
	code.push('\tHyperloopRegisterTranslationUnit(&HyperloopLoadEmbedSource,'+varnames.length+','+varnames.map(function(v){return '"'+v+'"';}).join(',')+');');
	code.push('}');
	code.push('');

	library.writeSourceFile(options, platform_lib, fn, code, true);
}

function generateHeader (options, state, obj) {
	var code = [];
	code.push(util.HEADER);
	code.push('');
	code.push('#include <hyperloop.h>');
	code.push('');
	code.push('JSValueRef HyperloopLoad_'+obj.jsfilename.replace(/\W/g, '_')+' (JSValueRef *exception);');

	// give platform library a chence to append something
	var platform_lib = path.join(options.platform_dir, 'library.js');
	if (fs.existsSync(platform_lib)) {
		platform_lib = require(platform_lib);
		if (platform_lib.generateHeader) {
			platform_lib.generateHeader(options, state, obj, code);
		}
	}

	return code.join('\n');
}

function generateMain (options, state, obj, symbols, symbolnames, externs, cleanup) {
	var code = [];

	code.push(util.HEADER);
	code.push('');
	code.push('#include <hyperloop.h>');
	code.push('');

	code.push(util.multilineComment('source file: '+obj.relativeFilename));
	code.push('');

	Object.keys(state.symbols).forEach(function(name){
		var symbol = state.symbols[name],
			symbolname = symbol.symbolname;
		symbolnames.push(name);
		symbols.push('// '+symbolname);
		symbols.push('auto '+name+'Property = JSStringCreateWithUTF8CString("'+name+'");');
		symbols.push('auto '+name+'Fn = JSObjectMakeFunctionWithCallback(ctx,'+name+'Property,'+symbolname+');');
		symbols.push('JSObjectSetProperty(ctx,object,'+name+'Property,'+name+'Fn,kJSPropertyAttributeReadOnly|kJSPropertyAttributeDontEnum|kJSPropertyAttributeDontDelete,nullptr);');
		cleanup.push('JSStringRelease('+name+'Property);');
		symbols.push('');
		externs.push('EXPORTAPI JSValueRef '+symbolname+'(JSContextRef ctx, JSObjectRef function, JSObjectRef thisObject, size_t argumentCount, const JSValueRef arguments[], JSValueRef* exception);');
	});

	if (state.custom_properties) {
		state.custom_properties.forEach(function(name){
			symbols.push('// '+name);
			symbols.push('auto '+name+'Property = JSStringCreateWithUTF8CString("'+name+'");');
			symbols.push('auto '+name+'Fn = JSObjectMakeFunctionWithCallback(ctx,'+name+'Property,'+name+');');
			symbols.push('JSObjectSetProperty(ctx,object,'+name+'Property,'+name+'Fn,kJSPropertyAttributeReadOnly|kJSPropertyAttributeDontEnum|kJSPropertyAttributeDontDelete,nullptr);');
			cleanup.push('JSStringRelease('+name+'Property);');
			symbols.push('');
			externs.push('EXPORTAPI JSValueRef '+name+'(JSContextRef ctx, JSObjectRef function, JSObjectRef thisObject, size_t argumentCount, const JSValueRef arguments[], JSValueRef* exception);');
		});
	}

	code.push('');
	code.push('EXPORTAPI JSValueRef HyperloopLoadEmbedSource(JSGlobalContextRef ctx, const char *path, JSValueRef *exception);');
	code.push('');

	code.push(util.multilineComment('entry point for '+obj.relativeFilename));
	code.push('EXPORTAPI JSValueRef HyperloopLoad_'+obj.jsfilename.replace(/\W/g, '_')+' (JSValueRef *exception)');
	code.push('{');
	code.push('#ifdef USE_TIJSCORE');
	code.push('\treturn HyperloopLoadEmbedSource(InitializeHyperloop(HyperloopGlobalContext()),"'+obj.jsfilename.replace(/\W/g, '_')+'",exception);');
	code.push('#else');
	code.push('\treturn HyperloopLoadEmbedSource(InitializeHyperloop(),"'+obj.jsfilename.replace(/\W/g, '_')+'",exception);');
	code.push('#endif');
	code.push('}');

	return code.join('\n');
}
