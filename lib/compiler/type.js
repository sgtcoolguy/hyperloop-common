/**
 * type class
 */
var util = require('../util'),
	path = require('path'),
	fs = require('fs'),
	_ = require('underscore'),
	log = require('../log');

exports.resolveType = resolveType;
exports.Class = Type;
exports.platform = null;
exports.metabase = null;

var typeCache = {},
	baseTypeCache = [];

/**
 * return all the base type names
 */
exports.__defineGetter__('types', function(){ 
	return _.unique(baseTypeCache);
});

/**
 * return all the detected native object types (classes)
 */
exports.__defineGetter__('classes',function(){
	return Object.keys(typeCache).map(function(k){
		var obj = typeCache[k];
		if (obj.isNativeObject()) {
			return obj.toName();
		}
	}).filter(function(v){
		return v;
	});
});

exports.reset = function() {
	log.debug('type reset called')
	typeCache = {};
	baseTypeCache = [];
};

const JS_NUMBER = 1;
const JS_STRING = 2;
const JS_OBJECT = 3;
const JS_BOOLEAN = 4;
const JS_UNDEFINED = 5;
const JS_NULL = 6;

const NATIVE_OBJECT = 1;
const NATIVE_PRIMITIVE = 2;
const NATIVE_BOOLEAN = 3;
const NATIVE_STRUCT = 4;
const NATIVE_POINTER = 5;
const NATIVE_STRING = 6;
const NATIVE_NULL = 7;
const NATIVE_VOID = 8;
const NATIVE_FUNCTION_POINTER = 9;
const NATIVE_BLOCK = 10;
const NATIVE_UNION = 11;
const NATIVE_ARRAY = 12;

Type.JS_NUMBER = JS_NUMBER;
Type.JS_STRING = JS_STRING;
Type.JS_OBJECT = JS_OBJECT;
Type.JS_BOOLEAN = JS_BOOLEAN;
Type.JS_UNDEFINED = JS_UNDEFINED;
Type.JS_NULL = JS_NULL;

Type.NATIVE_OBJECT = NATIVE_OBJECT;
Type.NATIVE_PRIMITIVE = NATIVE_PRIMITIVE;
Type.NATIVE_BOOLEAN = NATIVE_BOOLEAN;
Type.NATIVE_STRUCT = NATIVE_STRUCT;
Type.NATIVE_UNION = NATIVE_UNION;
Type.NATIVE_POINTER = NATIVE_POINTER;
Type.NATIVE_STRING = NATIVE_STRING;
Type.NATIVE_NULL = NATIVE_NULL;
Type.NATIVE_VOID = NATIVE_VOID;
Type.NATIVE_FUNCTION_POINTER = NATIVE_FUNCTION_POINTER;
Type.NATIVE_BLOCK = NATIVE_BLOCK;
Type.NATIVE_ARRAY = NATIVE_ARRAY;

var isPrimitive = /^(const)?\s*?(un)?(signed)?\s*(float|int|short|double|long|long)\s*(long|double)?\s*(\d{0,2})?\s*([*]{0,2})$/,
	isEnumeration = /^enum\s*/,
	isStruct = /^(const)?\s*struct\s*(.*?)(\*)?$/,
	isCharArray = /^(const)?\s*(un)?(signed)?\s*char\s*\[(\d+)?\]$/,
	isFunctionPointer = /^(.*)?\s*\(\*\)\((.*)\)$/,
	isBlock = /^(.*)?\s*\(\^\)\((.*)\)$/,
	isUnion = /^union\s*(.*)$/,
	isConstPointer = /^const\s+(.*)\*$/,
	isPointer = /(\w+)\s(\*+)$/;


exports.isFunctionPointer = isFunctionPointer;
exports.isPrimitive = isPrimitive;
exports.isEnumeration = isEnumeration;
exports.isStruct = isStruct;
exports.isCharArray = isCharArray;
exports.isBlock = isBlock;
exports.isUnion = isUnion;
exports.isConstPointer = isConstPointer;
exports.isPointer = isPointer;

function Type(metabase, type, platform) {
	if (!metabase) throw new Error("metabase is required");
	if (!type) throw new Error("type is required");
	this._platform = platform;
	this._type = this._value = this._name = type;
	this._jstype = JS_UNDEFINED;
	this._const = '';
	this._nativetype = NATIVE_POINTER;
	this._pointer = null;
	this._parse(metabase);
}

Type.prototype.getAsKey = function() {
	return this.toString().replace(/^(enum|struct)\s*/,'');
}

Type.prototype.toString = function() {
	return this._value || this._type;
}

Type.prototype.toCast = function(leaveCast) {
	var cast = (this._value || this._type);
	return leaveCast ? cast : cast.replace(/^const /,'').trim();
}

Type.prototype.getNewNativeObjectCast = function(varname) {
	return '<'+this.toCast()+'>('+varname+')';
};

Type.prototype.toBaseCast = function(leaveCast) {
	return this.toCast(leaveCast);
};

Type.prototype.toNativeObject = function() {
	var cast = this.toCast();
	if (this.toBaseCast() != cast) {
		return 'dynamic_cast<'+cast+'>(o->getObject())';
	} else {
		return 'o->getObject()';
	}
};

Type.prototype._parseToBuiltins = function(type) {
	switch (type) {
		case 'null': {
			this._jstype = JS_NULL;
			this._nativetype = NATIVE_NULL;
			return true;
		}
		case 'undefined':
		case 'void': {
			this._jstype = JS_UNDEFINED;
			this._nativetype = NATIVE_VOID;
			return true;
		}
		case 'void *': {
			this._jstype = JS_OBJECT;
			this._nativetype = NATIVE_POINTER;
			this._pointer = '*';
			this._name = this._name || 'void';
			this._void = true;
			return true;
		}
		case 'const void *': {
			this._jstype = JS_OBJECT;
			this._nativetype = NATIVE_POINTER;
			this._pointer = '*';
			this._const = 'const';
			this._name = this._name || 'void';
			this._void = true;
			return true;
		}
		case 'char': {
			this._jstype = JS_STRING;
			this._nativetype = NATIVE_STRING;
			this._length = 1;
			return true;
		}
		case 'bool':
		case 'signed char': {
			this._jstype = JS_BOOLEAN;
			this._nativetype = NATIVE_BOOLEAN;
			return true;
		}
		case 'char *': {
			this._jstype = JS_STRING;
			this._nativetype = NATIVE_STRING;
			this._pointer = '*';
			return true;
		}
		case 'const char *': {
			this._jstype = JS_STRING;
			this._nativetype = NATIVE_STRING;
			this._pointer = '*';
			this._const = 'const';
			return true;
		}
	}
	return false;
}

Type.prototype._parseTypedef = function(metabase, type) {
	if (!metabase) throw new Error("missing required metabase");

	if (metabase.types && type in metabase.types) {
		var typeobj = metabase.types[type];
		if (typeobj.alias && type!==typeobj.alias) {
			// if we have an alias which is different than our name, we need to use it
			return { 
				typeobj: typeobj,
				type: typeobj.name
			};
		}
		else {
			// if we have an alias and its the same as the type, use it
			type = typeobj.subtype || typeobj.type;
			this._value = this._name = typeobj.alias || typeobj.subtype || typeobj.type || typeobj.name;
		}
		if (typeobj.framework) {
			this._framework = typeobj.framework;
		}
		if (this._value==='definition') {
			this._value = this._name = this._type;
		}
		// we have be aliased to a builtin such as GLvoid -> void
		if (this._parseToBuiltins(typeobj.type)) {
			return true;
		}
		return { 
			typeobj: typeobj,
			type: type
		};
	}
}

Type.prototype.getImport = function() {
	return this._import;
}

Type.prototype.getFramework = function() {
	return this._framework;
}

Type.prototype._parse = function(metabase) {
	var type = this._type,
		typeobj,
		defConst,
		defPointer;

	if (!type) {
		throw new Error("missing type");
	}

	if (!metabase) {
		throw new Error("missing metabase");
	}

	if (this._parseToBuiltins(type)) {
		return;
	}

	if (isConstPointer.test(type) && metabase.types && !(type in metabase.types)) {
		var m = isConstPointer.exec(type);
		var ptype = m[1].trim();
		if (metabase && ptype in metabase.types) {
			type = ptype + ' *';
			this._const = defConst = 'const';
			this._basename = ptype;
			this._pointer = defPointer = '*';
			var tries = [ptype+' *', ptype];
			for (var c=0;c<tries.length;c++) {
				var to = this._parseTypedef(metabase,tries[c]);
				if (to===true) {
					return;
				}
				else if (to) {
					type = to.type;
					this._name = type+' *';
					typeobj = to.typeobj;
					break;
				}
			}
			this._value = 'const '+ptype+' *';
		}
	}

	if (!typeobj) {
		var to = this._parseTypedef(metabase,type);
		if (to===true) {
			return;
		}
		else if (to) {
			type = to.type;
			typeobj = to.typeobj;
		}

		if (typeobj && isPointer.test(typeobj.type)) {
			var m = isPointer.exec(typeobj.type);
			this._pointer = defPointer = m[2];
		}
	}


	if (typeobj && typeobj.import) {
		this._import = typeobj.import;
	}
	else if (typeobj && typeobj.framework) {
		this._framework = typeobj.framework;
	}
	if (typeobj && typeobj.vector) {
		this._vector = typeobj.vector;
		this._vector_size = typeobj.vector_size;
		this._vector_type = typeobj.vector_type;
	}

	if (isPrimitive.test(type) || (typeobj && isPrimitive.test(typeobj.type))) {
		var m = isPrimitive.exec(type) || isPrimitive.exec(typeobj.type);
		this._const = m[1] || defConst;
		this._value = this._value || m[4] + (m[5] ? (' '+m[5]) : '') + (m[6] ? (' '+m[6]) : '');
		this._pointer = m[7] || defPointer;
		this._jstype = JS_NUMBER;
		this._nativetype = NATIVE_PRIMITIVE;
		return;
	}
	else if (isEnumeration.test(type) || (typeobj && typeobj.metatype === 'enum') || (typeobj && isEnumeration.test(typeobj.type))) {
		this._jstype = JS_NUMBER;
		this._nativetype = NATIVE_PRIMITIVE;
		this._name = this._name.replace(/^enum\s*/,'').replace(/\*/g,'').replace('const ','').trim();
		return;
	}
	else if (isStruct.test(type) || (typeobj && typeobj.metatype === 'struct') || (typeobj && isStruct.test(typeobj.type)) || (isStruct.test(this._type))) {
		this._jstype = JS_OBJECT;
		this._nativetype = NATIVE_STRUCT;
		var m = isStruct.exec(type);
		if (m && m.length > 2) {
			this._const = m[1] || defConst;
			this._pointer = m[3] || defPointer;
		}
		else {
			this._pointer = defPointer;
		}
		!this._value && (this._value = type);
		this._name = this._name || this._name.replace(/^struct\s*/,'').replace(/\*/g,'').replace('const ','').trim();
		this._fields = typeobj && typeobj.fields || [];
		var self = this;
		if (this._fields.length) {
			this._fields.forEach(function(field){
				if (!field.rawtype) {
					field.rawtype = field.type;
					field.type = resolveType(field.type);
				}
			});
		}
		if (!this.isPointer()) {
			this._value +=' *';
			this._pointer = '*';
			this._was_not_pointer_obj = true; // mark this was not pointer object so that we can remove this pointer later on
		}
	}
	else if (typeobj && isUnion.test(typeobj.type) || type && isUnion.test(type)) {
		this._jstype = JS_OBJECT;
		this._nativetype = NATIVE_UNION;
		return;
	}
	else if (isCharArray.test(type)) {
		var m = isCharArray.exec(type);
		this._jstype = JS_STRING;
		this._nativetype = NATIVE_STRING;
		this._const = m[1] || defConst;
		this._length = parseInt(m[4]);
		return;
	}
	else if (isFunctionPointer.test(type) || isBlock.test(type)) {
		this._jstype = JS_OBJECT;
		this._nativetype = isFunctionPointer.test(type) ? NATIVE_FUNCTION_POINTER : NATIVE_BLOCK;
		var m = this._nativetype === NATIVE_FUNCTION_POINTER ? isFunctionPointer.exec(type) : isBlock.exec(type);
		this._functionReturnType = resolveType(m[1].trim());
		var self = this;
		var fnargs = m[2] && m[2].split(',') || [];
		this._functionArgTypes = fnargs.length ? fnargs.map(function(a){
			return resolveType(a.trim());
		}) : fnargs;
		return;
	}
}

Type.prototype.isConst = function() {
	return !!this._const;
}

Type.prototype.isPointer = function() {
	return !!this._pointer;
}

Type.prototype.isPointerToPointer = function() {
	return this._pointer=='**';
};

Type.prototype.toJSType = function() {
	return this._jstype;
}

Type.prototype.isJSType = function(type) {
	return this._jstype===type;
}

Type.prototype.isJSNumber = function() {
	return this.isJSType(JS_NUMBER);
}

Type.prototype.isJSString = function() {
	return this.isJSType(JS_STRING);
}

Type.prototype.isJSBoolean = function() {
	return this.isJSType(JS_BOOLEAN);
}

Type.prototype.isJSObject = function() {
	return this.isJSType(JS_OBJECT);
}

Type.prototype.isJSUndefined = function() {
	return this.isJSType(JS_UNDEFINED);
}

Type.prototype.isJSNull = function() {
	return this.isJSType(JS_NULL);
}

Type.prototype.isNativeType = function (type) {
	return this._nativetype===type;
}

Type.prototype.isNativeObject = function() {
	return this.isNativeType(NATIVE_OBJECT);
}

Type.prototype.isNativeBoolean = function() {
	return this.isNativeType(NATIVE_BOOLEAN);
}

Type.prototype.isNativeString = function() {
	return this.isNativeType(NATIVE_STRING);
}

Type.prototype.isNativeStruct = function() {
	return this.isNativeType(NATIVE_STRUCT);
}

Type.prototype.isNativePrimitive = function() {
	return this.isNativeType(NATIVE_PRIMITIVE);
}

Type.prototype.isNativePointer = function() {
	return this.isNativeType(NATIVE_POINTER);
}

Type.prototype.isNativeNull = function() {
	return this.isNativeType(NATIVE_NULL);
}

Type.prototype.isNativeVoid = function() {
	return this.isNativeType(NATIVE_VOID);
}

Type.prototype.isNativeVoidPointer = function() {
	return this.isNativePointer() && this._void;
}

Type.prototype.isNativeFunctionPointer = function() {
	return this.isNativeType(NATIVE_FUNCTION_POINTER);
}

Type.prototype.isNativeBlock = function() {
	return this.isNativeType(NATIVE_BLOCK);
}

Type.prototype.isNativeUnion = function() {
	return this.isNativeType(NATIVE_UNION);
}

Type.prototype.isNativeArray = function() {
	return this.isNativeType(NATIVE_ARRAY);
}

Type.prototype.isNativePrimitiveVector = function() {
	return this._vector;
}

Type.prototype.getNativeVectorSize = function() {
	return this._vector && this._vector_size;
}

Type.prototype.getNativeVectorType = function() {
	return this._vector && this._vector_type;
}

Type.prototype.toName = function() {
	return this._name;
}

Type.prototype.safeName = function(name) {
	return name.replace(/struct /,'').replace(/\s/g,'').replace(/\*/g,'').trim();
}

Type.prototype.toJSValueName = function() {
	return this.safeName(this.toName()) + '_ToJSValue';
}

Type.prototype.toNativeName = function() {
	return 'JSValueTo_'+this.safeName(this.toName());
}

Type.prototype.toFields = function() {
	// for structures
	return this._fields || [];
}

Type.prototype.getCharArrayLength = function() {
	return this._length || 0; // unlimited
}

Type.prototype.toJS = function(varname) {
	switch (this._jstype) {
		case JS_UNDEFINED: {
			return 'JSValueMakeUndefined(ctx)';
		}
		case JS_NULL: {
			return 'JSValueMakeNull(ctx)';
		}
		default: {
			return this.toJSValueName()+'(ctx,'+varname+',exception)';
		}
	}
}

Type.prototype.toNative = function(varname) {
	switch (this._nativetype) {
		case NATIVE_VOID:
		case NATIVE_NULL: {
			return 'nullptr';
		}
	}
	return this.toNativeName()+'(ctx,'+varname+',exception)';
}

Type.prototype.toDeclaration = function() {
	var thename = this.safeName(this.toName()),
		code = [];
	code.push('typedef Hyperloop::NativeObject<'+this.toCast()+'> * Native'+thename+';');
	code.push('');
	code.push('static void Finalize'+thename+'(JSObjectRef object)');
	code.push('{');
	code.push('\tauto p = JSObjectGetPrivate(object);')
	code.push('\tauto po = static_cast<Native'+thename+'>(static_cast<Hyperloop::AbstractObject *>(p));')
	code.push('\tdelete po;');
	//TODO: review this, should go through normal template
	code.push('}');
	code.push('');
	code.push('static JSClassRef Register'+thename+'()');
	code.push('{');
	code.push('\tstatic JSClassDefinition def = kJSClassDefinitionEmpty;');
	code.push('\tstatic JSClassRef ref = nullptr;');
	code.push('\tif (ref==nullptr)');
	code.push('\t{');
	code.push('\t\tdef.finalize = Finalize'+thename+';');
	code.push('\t\tdef.className = "'+thename+'";');
	code.push('\t\tref = JSClassCreate(&def);');
	code.push('\t}');
	code.push('\treturn ref;');
	code.push('}');
	code.push('');
	return code.join('\n');
}

Type.prototype.toNativePointer = function(varname, skipConst) {
	if (this.isConst() && !skipConst) {
		return 'HyperloopVoidPointerToJSValue(ctx,const_cast<void *>('+varname+'),exception)';
	}
	return 'HyperloopVoidPointerToJSValue(ctx,'+varname+',exception)';
}

Type.prototype.getAssignmentName = function() {
	return 'auto';
}

Type.prototype.getAssignmentCast = function(value) {
	return value;
}

Type.prototype.getRealCast = function(value) {
	// cast to the real type if the type and value are different
	if (this._type!=this._value) {
		// make sure we lop off const
		var cast = this._type;
		if (this.isConst()) {
			cast = cast.replace(/const /,'');
		}
		return 'static_cast<'+cast+'>('+value+')';
	}
	return value;
}

Type.prototype.toVoidCast = function(varname) {
	return 'static_cast<void *>('+varname+')';
}

Type.prototype.toJSBody = function(varname, preamble, cleanup, declare) {
	var thename = this.safeName(this.toName());
	switch(this._jstype) {
		case JS_NUMBER: {
			if (this.isPointer()) {
				// strip off the const
				if (this.isConst()) {
					varname = 'const_cast<'+this._name+'>('+varname+')';
				}
				// cast to void * from number
				return this.toNativePointer('static_cast<void *>('+varname+')',true);
			}
			return 'JSValueMakeNumber(ctx,static_cast<double>('+varname+'))';
		}
		case JS_BOOLEAN: {
			return 'JSValueMakeBoolean(ctx,'+varname+')';
		}
		case JS_STRING: {
			if (this._length==1) {
				return 'HyperloopMakeString(ctx,&'+varname+',exception)';
			}
			return 'HyperloopMakeString(ctx,'+varname+',exception)';
		}
		case JS_UNDEFINED: {
			return 'JSValueMakeUndefined(ctx)';
		}
		case JS_NULL: {
			return 'JSValueMakeNull(ctx)';
		}
		case JS_OBJECT: {
			if (this.isNativeFunctionPointer() || this.isNativeBlock() || this.isNativePointer()) {
				// strip off the const
				if (this.isConst()) {
					return this.toNativePointer('const_cast<void *>('+varname+')',true);
				}
				else {
					var cast_type = this.isNativeFunctionPointer() ? 'reinterpret_cast' : 'static_cast';
					return this.toNativePointer(cast_type+'<void *>('+varname+')');
				}
			}
			if (this.isNativeStruct() && this._was_not_pointer_obj) {
				var copyvarname = varname+'$';
				preamble.push(this.toCast()+' '+copyvarname+' = ('+this.toCast()+')malloc(sizeof('+this.toName()+'));');
				preamble.push('memcpy('+copyvarname+',&'+varname+','+'sizeof('+this.toName()+'));');
				varname = copyvarname; // overwrite variable name
			}
			declare.push('JSValueRef '+this.toJSValueName()+'(JSContextRef,'+this.toCast()+',JSValueRef *);');
			return this.toJSValueName()+'(ctx,'+varname+',exception)';
		}
	}
}

Type.prototype.__defineGetter__('framework', function() {
	return this._framework;
});

Type.prototype.toNativeFunctionCallback = function(fnName) {

	var name = fnName+'_FunctionCallback';
	var declare = [];
	var returnsValue = !this._functionReturnType.isNativeVoid();
	var _cleanup = [], args = [], contextarg, _preamble = [], _code = [], _argtypes = [];
	var argCount = this._functionArgTypes.length;
	if (this._functionArgTypes.length) {
		this._functionArgTypes.forEach(function(arg, index){
			var argtype = String(arg);
			_argtypes.push(argtype+' arg'+index);
			if (index < argCount-1) {
				var gen = arg.toJS('arg'+index, _preamble, _cleanup, true);
				_code.push('\tauto argValue'+index+' = '+gen+';');
				args.push('argValue'+index);
			}
		});
		contextarg = this._functionArgTypes[argCount-1];
	}
	declare.push(this._functionReturnType+' '+name+'('+_argtypes.join(', ')+')');
	declare.push('{');

	// we need the last argument to be a void pointer if we want to 
	// make it a JS compatible callback
	if (contextarg && contextarg.isNativeVoidPointer()) {

		declare.push('\tauto ctx = HyperloopGlobalContext();');
		declare.push('\tJSValueRef *exception = nullptr;');

		_preamble.length && _preamble.forEach(function(p) { declare.push(p) });
		_code.forEach(function(p) { declare.push(p) });

		declare.push('\tauto argumentCount = '+(argCount-1)+';');
		declare.push('\tJSValueRef arguments[] = { '+args.join(', ')+' };');

		//TODO: generate check exception

		var invokegen = 'HyperloopInvokeFunctionCallback((void *)arg'+(argCount-1)+',argumentCount,arguments,exception);';

		if (this._functionReturnType.isNativeVoid()) {
			declare.push('\t'+invokegen);
		}
		else {
			declare.push('\tauto fnCallbackResult = '+invokegen);
			_preamble=[];
			_code=[];
			var gen = this._functionReturnType.toNative('fnCallbackResult',_preamble,_code);
			_preamble.length && _preamble.forEach(function(c){declare.push('\t'+c)});
			declare.push('\tauto returnResult = '+gen+';');
			_code.length && _code.forEach(function(c){declare.push('\t'+c)});
			declare.push('\treturn returnResult;');
		}
	}
	else {
		declare.push("\t//NOTE: this function will not be invoked since it doesn't have the last parameter as a void*");
	}
	declare.push('}');
	declare.push('');

	declare.push(util.multilineComment('called to allow the construction of a native function callback'));
	declare.push('JSValueRef '+fnName+'_constructor(JSContextRef ctx, JSObjectRef function, JSObjectRef thisObject, size_t argumentCount, const JSValueRef arguments[], JSValueRef* exception)');
	declare.push('{');
	declare.push('\tif (argumentCount==0 || !JSValueIsObject(ctx,arguments[0]) || !JSObjectIsFunction(ctx,JSValueToObject(ctx,arguments[0],exception)))');
	declare.push('\t{');
	declare.push('\t\t*exception = HyperloopMakeException(ctx,"first argument must be a function callback");')
	declare.push('\t\treturn JSValueMakeUndefined(ctx);');
	declare.push('\t}');
	declare.push('');
	declare.push('\treturn JSValueMakeUndefined(ctx);'); //FIXME
	// declare.push('\tHLPrivateObjectRef privateObject = HyperloopCreateFunctionCallback(ctx,arguments[0],&'+name+',exception);');
	// declare.push('\treturn JSObjectMake(ctx, HLCallbackClassRef(), (void *)privateObject);');
	declare.push('}');

	return declare.join('\n');
}

function makeSafeVarname(name) {
	return name.replace(/[\[\]]/g,'_');
}

Type.prototype.hasConstructor = function() {
	return true;
};

Type.prototype.toValueAtConversionFail = function() {
	return 'nullptr';
};

Type.prototype.fromNativePointer = function(varname, preamble) {
	var subvar = makeSafeVarname(varname);
	preamble.push('auto '+subvar+'buf = static_cast<Hyperloop::AbstractObject*>(JSObjectGetPrivate(JSValueToObject(ctx,'+varname+',exception)));');
	preamble.push('auto '+subvar+'buf2 = static_cast<Hyperloop::NativeObject<'+this.toCast()+'> *>('+subvar+'buf);');
	var object = subvar+'buf2->getObject()';
	if (this._was_not_pointer_obj) {
		object = '*'+object;
	}
	return object;
}

Type.prototype.toNativeBody = function(varname, preamble, cleanup, declare) {
	var thename = this.safeName(this.toName());
	switch(this._nativetype) {
		case NATIVE_PRIMITIVE: {
			if (this.isPointer()) {
				return 'static_cast<'+this.toCast()+'>(HyperloopJSValueToVoidPointer(ctx,'+varname+',exception))';
			}
			return 'static_cast<'+this.toCast()+'>(JSValueToNumber(ctx,'+varname+',exception))';
		}
		case NATIVE_BOOLEAN: {
			return 'JSValueToBoolean(ctx,'+varname+')';
		}
		case NATIVE_STRING: {
			var subvar = makeSafeVarname(varname);
			preamble.push('auto '+subvar+'buf = HyperloopJSValueToStringCopy(ctx,'+varname+',exception);');
			cleanup.push('delete [] '+subvar+'buf;');
			if (this._length===1) {
				return subvar+'buf[0]';
			}
			return subvar+'buf';
		}
		case NATIVE_VOID:
		case NATIVE_NULL: {
			return 'nullptr';
		}
		case NATIVE_UNION:
		case NATIVE_STRUCT: {
			if (this.isPointer()) {
				return this.fromNativePointer(varname,preamble);
			}
		}
		case NATIVE_POINTER:
		case NATIVE_OBJECT: {
			if (this.isNativePointer()) {
				return this.fromNativePointer(varname,preamble);
			}
			declare.push('EXPORTAPI '+this.toCast()+' '+this.toNativeName()+'(JSContextRef,JSValueRef,JSValueRef *);');
			return this.toNativeName()+'(ctx,'+varname+',exception)';
		}
		case NATIVE_BLOCK:
		case NATIVE_FUNCTION_POINTER: {
			/*preamble.push('void * callbackPtr = HyperloopJSValueToVoidPointer(ctx,'+varname+',exception);');
			return 'HyperloopFunctionCallbackFunctionPointer(callbackPtr)';*/
			return 'nullptr'; //FIXME
		}
	}
}

/*
 * copy struct content into newly created struct memory
 */
Type.prototype.toAllocStruct = function(varname, fnname, selector, code) {
	code.push(this.toName()+' '+varname+'$ = '+fnname+'('+selector+');');
	code.push(this.toCast()+' '+varname+' = ('+this.toCast()+')malloc(sizeof('+this.toName()+'));');
	code.push('memcpy('+varname+',&'+varname+'$,'+'sizeof('+this.toName()+'));');
};

/**
 * main entry point which will construct an appropriate Type instance
 * and return it.  if platform is passed, will use the platform type
 * library subclass
 */
function resolveType(type) {

	if (arguments.length!==1) {
		log.error(arguments)
		throw new Error("resolveType should only take 1 argument as the string type");
	}

	if (typeof(type)==='object') {
		throw new Error('type must be a string');
	}

	if (type in typeCache) {
		return typeCache[type];
	}

	// allow these to be set globally
	var metabase = exports.metabase,
		platform = exports.platform;

	if (!metabase) {
		throw new Error('missing metabase, set using type.metabase');
	}

	if (!platform) {
		var typeobj = new Type(metabase,type,name);
	}
	else {
		// load our platform subclass and use it
		var fn = path.join(platform, 'lib', 'type');
		var Subclass = require(fn).Class;
		var name = path.basename(platform).replace('hyperloop-','');
		var typeobj = new Subclass(metabase,type,name);
	}


	// cache it
	typeCache[type] = typeobj;

	if (typeobj._basename) {
		baseTypeCache.push(typeobj._basename);
	}
	else {
		baseTypeCache.push(type);
	}
	return typeobj;
}

