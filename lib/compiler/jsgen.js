/**
 * JS source code generation
 */
var fs = require('fs'),
	util = require('../util'),
	log = require('../log'),
	defaultXor = '0xAC',
	symbolsCache = {},
	symbolsFnCache = {},
	symbolAlpha = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

exports.transform = transform;
exports.generateDecoder = generateDecoder;
exports.generateDefine = generateDefine;
exports.generateBody = generateBody;
exports.sanitizeClassName = sanitizeClassName;
exports.generateNewConstructorName = generateNewConstructorName;
exports.generateMethodName = generateMethodName;
exports.generateFunctionCallName = generateFunctionCallName;
exports.generateGetterName = generateGetterName;
exports.generateSetterName = generateSetterName;
exports.obfuscate = obfuscate;
exports.isBuiltinFunction = isBuiltinFunction;
exports.getSymbolMap = getSymbolMap;
exports.makeVariableName = makeVariableName;
exports.resetVariableNames = resetVariableNames;

/*
 * Check whether method is builtin
 */
function isBuiltinFunction(name) {
	return ['toString'].indexOf(name) >= 0;
}

/**
 * return the symbol map
 */
function getSymbolMap () {
	return symbolsCache;
}

/**
 * generate an obfuscated and very short symbol
 */
function obfuscate (fn, prefix) {
	// we always resolve the same symbol to the same obfuscated one
	var str = symbolsFnCache[fn];
	if (str) {
		return str;
	}
	str = prefix || '_$';
	while (1) {
		// pick a random location in the symbol string
		var k = symbolAlpha.charAt(Math.floor(Math.random() * symbolAlpha.length));
		str+=k;
		// we need to look into our symbol cache to make sure it's unique, if it's not
		// we're continue to loop and append until we find one that's unique
		if (!(str in symbolsCache)) {
			break;
		}
	}
	symbolsFnCache[fn] = str;
	symbolsCache[str] = fn;
	return str;
}

function sanitizeClassName(name) {
	return util.sanitizeSymbolName(name);
}

function generateNewConstructorName(name) {
	return sanitizeClassName(name)+'_constructor';
}

function generateMethodName(name, method) {
	return sanitizeClassName(name)+'_'+method;
}

function generateFunctionCallName(name) {
	return util.sanitizeSymbolName(name)+'_function';
}

function generateGetterName(classname, property) {
	return sanitizeClassName(classname)+'_Get_'+property;
}

function generateSetterName(classname, property) {
	return sanitizeClassName(classname)+'_Set_'+property;
}

function generateDefine(varname, srccode) {
	return 'static const char '+varname+'[] = {\n\t' + srccode.source + '\n};\n'+
		   'static const size_t '+varname+'_length = '+srccode.length+';\n';
}

function generateDecoder(varname) {
	return '#define HL_DECODE_'+varname+'(array,buf)\\\n'+
		   'for (size_t i = 0; i < '+varname+'_length; i++) {\\\n'+
		   '	buf[i] = array[i] ^ _HL_XOR;\\\n'+
		   '}\n'; 
}

function generateBody(header, xor, defines) {
	var t = typeof(header);
	if (t === 'object' && Array.isArray(header)) {
		defines = header;
		xor = null;
		header = null;
	}
	else if (t === 'string' && !xor && !defines) {
		defines = header;
		xor = null;
		header = null;
	}
	return (header ? (header + '\n') : '') +
		  '#define _HL_XOR '+(xor ? xor : defaultXor)+'\n'+
		  '#define _(v) (char)((int)v^_HL_XOR)\n\n' + 
		  (Array.isArray(defines) ? defines.join('\n') : defines);
}

function transform(srccode, split, transformer, debugfn) {
	var output = '',
		count = 0,
		inComment = false,
		input = '';

	if (typeof(split)==='function') {
		transformer = split;
		split = null;
	}

	split = split || 10;

	srccode.split(/\n/g).forEach(function(line){
		line = line.trim();
		if (line) {
			input += line + '\n';
		}
	});

	// trim the trailing \n
	input = input.trim();

	// log our our debug source
	debugfn && fs.writeFileSync(debugfn, input, 'utf8');

	// convert to base64
	input = new Buffer(input).toString('base64');

	// supply a transformer
	transformer = transformer || function(value) {
		return "_('"+value+"')";
	};

	for (var i = 0; i < input.length; i++) {
		var value = input[i];
		if (value==="'") {
			value="\\'";
		}
		else if (value==='\\') {
			value="\\\\";
		}
		else if (value==='\r') {
			value="\\r";
		}
		else if (value==='\n') {
			value="\\n";
		}
		else if (value==='\t') {
			value="\\t";
		}
		var transformed = transformer(value);
		if (transformed) {
			if (i != 0) output+=', ';
			if ((i % split) === 0) output+='\n\t';
			output+=transformed;
			count++;
		}
	}

	return {
		source: output.trim(),
		length: count
	};
}

var vars = 0;

function makeVariableName() {
	return 'var'+(vars++);

}

/*
 * reset variable index
 */
function resetVariableNames() {
	vars = 0;
}
