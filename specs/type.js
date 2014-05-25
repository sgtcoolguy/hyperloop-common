var should = require('should'),
	hyperloop = require('../'),
	typelib = hyperloop.compiler.type,
	library = hyperloop.compiler.library;

describe('#types', function(){

	before(function(){
		typelib.reset();
		typelib.metabase = null;
		typelib.platform = null;
	});

	afterEach(function(){
		typelib.reset();
		typelib.metabase = null;
		typelib.platform = null;
	});

	it('should not work without metabase',function(){
		(function(){
			typelib.resolveType('hello');
		}).should.throw();
	});

	['int','float','double','long','long long','long double','short'].forEach(function(name){
		['','signed','unsigned','const','const signed','const unsigned'].forEach(function(prepend){
			['','*','**'].forEach(function(postpend){
				var value = (prepend+' '+name+' '+postpend).trim();
				it(value, function() {
					typelib.metabase = {};
					var type = typelib.resolveType(value);
					type.isJSNumber().should.be.true;
					type.isNativePrimitive().should.be.true;
					type.isConst().should.equal(/^const/.test(value));
					type.isPointer().should.equal(/\*$/.test(value));
					type.isPointerToPointer().should.equal(/\*\*$/.test(value));
					var typename = (prepend+' '+name+' '+postpend).trim();
					var cast = 'static_cast<'+typename.replace('const ','')+'>';
					if (type.isPointer()) {
						type.toNativeBody('value').should.equal(cast+'(HyperloopJSValueToVoidPointer(ctx,value,exception))');
						if (type.isConst()) {
							type.toJSBody('value').should.equal('HyperloopVoidPointerToJSValue(ctx,static_cast<void *>(const_cast<'+typename+'>(value)),exception)');
						}
						else {
							type.toJSBody('value').should.equal('HyperloopVoidPointerToJSValue(ctx,static_cast<void *>(value),exception)');
						}
					}
					else {
						if (type.isConst()) {
							type.toNativeBody('value').should.equal(cast+'(JSValueToNumber(ctx,value,exception))');
						}
						else {
							type.toJSBody('value').should.equal('JSValueMakeNumber(ctx,static_cast<double>(value))');
						}
					}
				});
			});
		});
	});

	it('null',function(){
		typelib.metabase = {};
		var type = typelib.resolveType('null');
		type.isJSNull().should.be.true;
		type.isNativeNull().should.be.true;
		type.toJSBody('value').should.equal('JSValueMakeNull(ctx)');
		type.toNativeBody('value').should.equal('nullptr');
	});

	it('undefined', function(){
		typelib.metabase = {};
		var type = typelib.resolveType('undefined');
		type.isJSUndefined().should.be.true;
		type.isNativeVoid().should.be.true;
		type.toJSBody('value').should.equal('JSValueMakeUndefined(ctx)');
		type.toNativeBody('value').should.equal('nullptr');
	});

	it('bool', function() {
		typelib.metabase = {};
		var type = typelib.resolveType('bool');
		type.isJSBoolean().should.be.true;
		type.isNativeBoolean().should.be.true;
		type.toJSBody('value').should.equal('JSValueMakeBoolean(ctx,value)');
		type.toNativeBody('value').should.equal('JSValueToBoolean(ctx,value)');
	});

	it('void', function(){
		typelib.metabase = {};
		var type = typelib.resolveType('void');
		type.isJSUndefined().should.be.true;
		type.isNativeVoid().should.be.true;
		type.toJSBody('value').should.equal('JSValueMakeUndefined(ctx)');
		type.toNativeBody('value').should.equal('nullptr');
	});

	it('void *', function(){
		typelib.metabase = {};
		var type = typelib.resolveType('void *');
		type.isJSObject().should.be.true;
		type.isNativePointer().should.be.true;
		var preamble = [], cleanup = [], declare = [];
		type.toJSBody('value',preamble,cleanup,declare).should.equal('HyperloopVoidPointerToJSValue(ctx,static_cast<void *>(value),exception)');
		preamble.should.be.empty;
		cleanup.should.be.empty;
		declare.should.be.empty;
		type.toNativeBody('value',preamble,cleanup,declare).should.equal('valuebuf2->getObject()');
		preamble.should.not.be.empty;
		preamble[0].should.equal('auto valuebuf = static_cast<Hyperloop::AbstractObject*>(JSObjectGetPrivate(JSValueToObject(ctx,value,exception)));');
		preamble[1].should.equal('auto valuebuf2 = static_cast<Hyperloop::NativeObject<void *> *>(valuebuf);');
		cleanup.should.be.empty;
		declare.should.be.empty;
	});

	it('const void *', function(){
		typelib.metabase = {};
		var type = typelib.resolveType('const void *');
		type.isJSObject().should.be.true;
		type.isNativePointer().should.be.true;
		type.isConst().should.be.true;
		type.toJSBody('value').should.equal('HyperloopVoidPointerToJSValue(ctx,const_cast<void *>(value),exception)');
		var preamble = [], cleanup = [], declare = [];
		type.toNativeBody('value',preamble,cleanup,declare).should.equal('valuebuf2->getObject()');
		preamble.should.not.be.empty;
		preamble[0].should.equal('auto valuebuf = static_cast<Hyperloop::AbstractObject*>(JSObjectGetPrivate(JSValueToObject(ctx,value,exception)));');
		preamble[1].should.equal('auto valuebuf2 = static_cast<Hyperloop::NativeObject<void *> *>(valuebuf);');
		cleanup.should.be.empty;
		declare.should.be.empty;
	});

	it('char', function(){
		typelib.metabase = {};
		var type = typelib.resolveType('char');
		type.isJSString().should.be.true;
		type.isNativeString().should.be.true;
		var preamble = [], cleanup = [];
		type.toNativeBody('value',preamble,cleanup).should.equal('valuebuf[0]');
		preamble.should.not.be.empty;
		cleanup.should.not.be.empty;
		preamble[0].should.equal('auto valuebuf = HyperloopJSValueToStringCopy(ctx,value,exception);');
		cleanup[0].should.equal('delete [] valuebuf;');
		type.toJSBody('value').should.equal('HyperloopMakeString(ctx,&value,exception)');
	});

	it('signed char', function(){
		typelib.metabase = {};
		var type = typelib.resolveType('signed char');
		type.isJSBoolean().should.be.true;
		type.isNativeBoolean().should.be.true;
		type.toJSBody('value').should.equal('JSValueMakeBoolean(ctx,value)');
		type.toNativeBody('value').should.equal('JSValueToBoolean(ctx,value)');
	});

	it('char *', function(){
		typelib.metabase = {};
		var type = typelib.resolveType('char *');
		type.isJSString().should.be.true;
		type.isNativeString().should.be.true;
		type.isPointer().should.be.true;
		var preamble = [], cleanup = [];
		type.toNativeBody('value',preamble,cleanup).should.equal('valuebuf');
		preamble.should.not.be.empty;
		cleanup.should.not.be.empty;
		preamble[0].should.equal('auto valuebuf = HyperloopJSValueToStringCopy(ctx,value,exception);');
		cleanup[0].should.equal('delete [] valuebuf;');
		type.toJSBody('value').should.equal('HyperloopMakeString(ctx,value,exception)');
	});

	it('const char *', function(){
		typelib.metabase = {};
		var type = typelib.resolveType('const char *');
		type.isJSString().should.be.true;
		type.isNativeString().should.be.true;
		type.isPointer().should.be.true;
		type.isConst().should.be.true;
		var preamble = [], cleanup = [];
		type.toNativeBody('value',preamble,cleanup).should.equal('valuebuf');
		preamble.should.not.be.empty;
		cleanup.should.not.be.empty;
		preamble[0].should.equal('auto valuebuf = HyperloopJSValueToStringCopy(ctx,value,exception);');
		cleanup[0].should.equal('delete [] valuebuf;');
		type.toJSBody('value').should.equal('HyperloopMakeString(ctx,value,exception)');
	});

	it('char []', function(){
		typelib.metabase = {};
		var type = typelib.resolveType('char []');
		type.isJSString().should.be.true;
		type.isNativeString().should.be.true;
		var preamble = [], cleanup = [];
		type.toNativeBody('value',preamble,cleanup).should.equal('valuebuf');
		preamble.should.not.be.empty;
		cleanup.should.not.be.empty;
		preamble[0].should.equal('auto valuebuf = HyperloopJSValueToStringCopy(ctx,value,exception);');
		cleanup[0].should.equal('delete [] valuebuf;');
		type.toJSBody('value').should.equal('HyperloopMakeString(ctx,value,exception)');
		type.getCharArrayLength().should.equal(0); // unlimited
	});

	it('char [10]', function(){
		typelib.metabase = {};
		var type = typelib.resolveType('char [10]');
		type.isJSString().should.be.true;
		type.isNativeString().should.be.true;
		var preamble = [], cleanup = [];
		type.toNativeBody('value',preamble,cleanup).should.equal('valuebuf');
		preamble.should.not.be.empty;
		cleanup.should.not.be.empty;
		preamble[0].should.equal('auto valuebuf = HyperloopJSValueToStringCopy(ctx,value,exception);');
		cleanup[0].should.equal('delete [] valuebuf;');
		type.toJSBody('value').should.equal('HyperloopMakeString(ctx,value,exception)');
		type.getCharArrayLength().should.equal(10);
	});

	it('const char []', function(){
		typelib.metabase = {};
		var type = typelib.resolveType('const char []');
		type.isJSString().should.be.true;
		type.isNativeString().should.be.true;
		type.isConst().should.be.true;
		var preamble = [], cleanup = [];
		type.toNativeBody('value',preamble,cleanup).should.equal('valuebuf');
		preamble.should.not.be.empty;
		cleanup.should.not.be.empty;
		preamble[0].should.equal('auto valuebuf = HyperloopJSValueToStringCopy(ctx,value,exception);');
		cleanup[0].should.equal('delete [] valuebuf;');
		type.toJSBody('value').should.equal('HyperloopMakeString(ctx,value,exception)');
		type.getCharArrayLength().should.equal(0); // unlimited
	});

	it('const char [10]', function(){
		typelib.metabase = {};
		var type = typelib.resolveType('const char [10]');
		type.isJSString().should.be.true;
		type.isNativeString().should.be.true;
		type.isConst().should.be.true;
		var preamble = [], cleanup = [];
		type.toNativeBody('value',preamble,cleanup).should.equal('valuebuf');
		preamble.should.not.be.empty;
		cleanup.should.not.be.empty;
		preamble[0].should.equal('auto valuebuf = HyperloopJSValueToStringCopy(ctx,value,exception);');
		cleanup[0].should.equal('delete [] valuebuf;');
		type.toJSBody('value').should.equal('HyperloopMakeString(ctx,value,exception)');
		type.getCharArrayLength().should.equal(10);
	});

	it('enum Foo', function(){
		typelib.metabase = {};
		var type = typelib.resolveType('enum Foo');
		type.isJSNumber().should.be.true;
		type.isNativePrimitive().should.be.true;
		type.toJSBody('value').should.equal('JSValueMakeNumber(ctx,static_cast<double>(value))');
		type.toNativeBody('value').should.equal('static_cast<enum Foo>(JSValueToNumber(ctx,value,exception))');
	});

	it('struct Foo', function() {
		typelib.metabase = {};
		var type = typelib.resolveType('struct Foo');
		type.isJSObject().should.be.true;
		type.isNativeStruct().should.be.true;
		var preamble = [], cleanup = [], declare = [];
		type.toJSBody('value',preamble,cleanup,declare).should.equal('Foo_ToJSValue(ctx,value,exception)');
		preamble.should.be.empty;
		cleanup.should.be.empty;
		declare.should.not.be.empty;
		declare[0].should.equal('JSValueRef Foo_ToJSValue(JSContextRef,struct Foo *,JSValueRef *);');
		declare=[];
		type.toNativeBody('value',preamble,cleanup,declare).should.equal('valuebuf2->getObject()');
		preamble.should.not.be.empty;
		cleanup.should.be.empty;
		declare.should.be.empty;
		preamble[0].should.be.equal('auto valuebuf = static_cast<Hyperloop::AbstractObject*>(JSObjectGetPrivate(JSValueToObject(ctx,value,exception)));');
		preamble[1].should.be.equal('auto valuebuf2 = static_cast<Hyperloop::NativeObject<struct Foo *> *>(valuebuf);');
	});

	it('struct Foo *', function() {
		typelib.metabase = {};
		var type = typelib.resolveType('struct Foo *');
		type.isJSObject().should.be.true;
		type.isNativeStruct().should.be.true;
		type.isPointer().should.be.true;
		var preamble = [], cleanup = [], declare = [];
		type.toJSBody('value',preamble,cleanup,declare).should.equal('Foo_ToJSValue(ctx,value,exception)');
		preamble.should.be.empty;
		cleanup.should.be.empty;
		declare.should.not.be.empty;
		declare[0].should.equal('JSValueRef Foo_ToJSValue(JSContextRef,struct Foo *,JSValueRef *);');
		declare=[];
		type.toNativeBody('value',preamble,cleanup,declare).should.equal('valuebuf2->getObject()');
		preamble.should.not.be.empty;
		cleanup.should.be.empty;
		declare.should.be.empty;
		preamble[0].should.be.equal('auto valuebuf = static_cast<Hyperloop::AbstractObject*>(JSObjectGetPrivate(JSValueToObject(ctx,value,exception)));');
		preamble[1].should.be.equal('auto valuebuf2 = static_cast<Hyperloop::NativeObject<struct Foo *> *>(valuebuf);');
	});

	it('const struct Foo *', function() {
		typelib.metabase = {};
		var type = typelib.resolveType('const struct Foo *');
		type.isJSObject().should.be.true;
		type.isNativeStruct().should.be.true;
		type.isPointer().should.be.true;
		type.isConst().should.be.true;
		var preamble = [], cleanup = [], declare = [];
		type.toJSBody('value',preamble,cleanup,declare).should.equal('constFoo_ToJSValue(ctx,value,exception)');
		preamble.should.be.empty;
		cleanup.should.be.empty;
		declare.should.not.be.empty;
		declare[0].should.equal('JSValueRef constFoo_ToJSValue(JSContextRef,struct Foo *,JSValueRef *);');
		declare=[];
		type.toNativeBody('value',preamble,cleanup,declare).should.equal('valuebuf2->getObject()');
		preamble.should.not.be.empty;
		cleanup.should.be.empty;
		declare.should.be.empty;
		preamble[0].should.be.equal('auto valuebuf = static_cast<Hyperloop::AbstractObject*>(JSObjectGetPrivate(JSValueToObject(ctx,value,exception)));');
		preamble[1].should.be.equal('auto valuebuf2 = static_cast<Hyperloop::NativeObject<struct Foo *> *>(valuebuf);');
	});

	it('int32_t', function() {
		var metabase = {
			types: {
				"__int32_t": {
					"name": "__int32_t",
					"alias": "__int32_t",
					"type": "int",
					"subtype": "int",
					"metatype": "typedef"
	     		}
			}
		};
		typelib.metabase = metabase;
		var type = typelib.resolveType('__int32_t');
		type.isJSNumber().should.be.true;
		type.isNativePrimitive().should.be.true;
		type.toJSBody('value').should.equal('JSValueMakeNumber(ctx,static_cast<double>(value))');
		type.toNativeBody('value').should.equal('static_cast<__int32_t>(JSValueToNumber(ctx,value,exception))');
	});

	it("CGRect", function() {
		var metabase = {
			types: {
				"CGRect": {
					"name": "CGRect",
					"alias": "CGRect",
					"type": "struct CGRect",
					"subtype": "struct CGRect",
					"metatype": "typedef",
					"framework": "CoreGraphics",
					"fields": [
						{
							"name": "origin",
							"type": "struct CGPoint",
							"subtype": "CGPoint"
						},
						{
							"name": "size",
							"type": "struct CGSize",
							"subtype": "CGSize"
						}
					]
				}
			}
		};
		typelib.metabase = metabase;
		var type = typelib.resolveType('CGRect');
		type.isJSObject().should.be.true;
		type.isNativeStruct().should.be.true;
		var preamble = [], cleanup = [], declare = [];
		type.toJSBody('value',preamble,cleanup,declare).should.equal('CGRect_ToJSValue(ctx,value,exception)');
		preamble.should.be.empty;
		cleanup.should.be.empty;
		declare.should.not.be.empty;
		type.framework.should.be.equal('CoreGraphics');
		type.toNativeBody('value',preamble,cleanup,declare).should.equal('JSValueTo_CGRect(ctx,value,exception)');
		preamble.should.be.empty;
		cleanup.should.be.empty;
		declare.should.not.be.empty;
		declare[0].should.equal('JSValueRef CGRect_ToJSValue(JSContextRef,CGRect,JSValueRef *);');
		declare[1].should.equal('EXPORTAPI CGRect JSValueTo_CGRect(JSContextRef,JSValueRef,JSValueRef *);');
	});

	it('SEL', function () {
		var metabase = {
			types: {
				"SEL": {
					"name": "SEL",
					"alias": "SEL",
					"type": "struct objc_selector *",
					"subtype": "struct objc_selector *",
					"metatype": "typedef"
				},
				"struct objc_selector *": {
					"name": "SEL",
					"alias": "SEL",
					"type": "struct objc_selector *",
					"subtype": "struct objc_selector *",
					"metatype": "typedef"
				}
			}
		}
		typelib.metabase = metabase;
		var type = typelib.resolveType('SEL');
		type.isJSObject().should.be.true;
		type.isNativeStruct().should.be.true;
		type.isPointer().should.be.true;
		var preamble = [], cleanup = [], declare = [];
		type.toJSBody('value',preamble,cleanup,declare).should.equal('SEL_ToJSValue(ctx,value,exception)');
		preamble.should.be.empty;
		cleanup.should.be.empty;
		declare.should.not.be.empty;
		declare[0].should.equal('JSValueRef SEL_ToJSValue(JSContextRef,SEL,JSValueRef *);')
		declare=[];
		type.toNativeBody('value',preamble,cleanup,declare).should.equal('valuebuf2->getObject()');
		preamble.should.not.be.empty;
		cleanup.should.be.empty;
		declare.should.be.empty;
		preamble[0].should.be.equal('auto valuebuf = static_cast<Hyperloop::AbstractObject*>(JSObjectGetPrivate(JSValueToObject(ctx,value,exception)));');
		preamble[1].should.be.equal('auto valuebuf2 = static_cast<Hyperloop::NativeObject<SEL> *>(valuebuf);');
	});

	it('CFNullRef', function() {
		var metabase = {
			types: {
				"CFNullRef": {
					"name": "CFNullRef",
					"alias": "CFNullRef",
					"type": "const struct __CFNull *",
					"subtype": "const struct __CFNull *",
					"metatype": "typedef",
					"framework": "CoreFoundation"
				}
			}
		};
		typelib.metabase = metabase;
		var type = typelib.resolveType('CFNullRef');
		type.isJSObject().should.be.true;
		type.isNativeStruct().should.be.true;
		type.isPointer().should.be.true;
		type.isConst().should.be.true;
		var preamble = [], cleanup = [], declare = [];
		type.toJSBody('value',preamble,cleanup,declare).should.equal('CFNullRef_ToJSValue(ctx,value,exception)');
		preamble.should.be.empty;
		cleanup.should.be.empty;
		declare.should.not.be.empty;
		declare[0].should.equal('JSValueRef CFNullRef_ToJSValue(JSContextRef,CFNullRef,JSValueRef *);');
		declare=[];
		type.toNativeBody('value',preamble,cleanup,declare).should.equal('valuebuf2->getObject()');
		preamble.should.not.be.empty;
		cleanup.should.be.empty;
		declare.should.be.empty;
		preamble[0].should.equal('auto valuebuf = static_cast<Hyperloop::AbstractObject*>(JSObjectGetPrivate(JSValueToObject(ctx,value,exception)));');
		preamble[1].should.equal('auto valuebuf2 = static_cast<Hyperloop::NativeObject<CFNullRef> *>(valuebuf);');
	});

	it('__CFAllocator', function() {
		var metabase = {
			types: {
				"__CFAllocator": {
					"metatype": "struct",
					"name": "__CFAllocator",
					"type": "struct __CFAllocator",
					"subtype": "struct __CFAllocator",
					"framework": "CoreFoundation"
				},
					"struct __CFAllocator": {
					"metatype": "struct",
					"name": "__CFAllocator",
					"type": "struct __CFAllocator",
					"subtype": "struct __CFAllocator",
					"framework": "CoreFoundation"
				}
			}
		};
		typelib.metabase = metabase;
		var type = typelib.resolveType('__CFAllocator');
		type.isJSObject().should.be.true;
		type.isNativeStruct().should.be.true;
		type.isPointer().should.be.true;
		type.isConst().should.be.false;
		type.framework.should.equal('CoreFoundation');
		var preamble = [], cleanup = [], declare = [];
		type.toJSBody('value',preamble,cleanup,declare).should.equal('__CFAllocator_ToJSValue(ctx,value,exception)');
		cleanup.should.be.empty;
		declare.should.not.be.empty;
		preamble.should.be.empty;
		declare[0].should.equal('JSValueRef __CFAllocator_ToJSValue(JSContextRef,struct __CFAllocator *,JSValueRef *);');
		declare=[];
		type.toNativeBody('value',preamble,cleanup,declare).should.equal('valuebuf2->getObject()');
		cleanup.should.be.empty;
		declare.should.be.empty;
		preamble.should.not.be.empty;
		preamble[0].should.equal('auto valuebuf = static_cast<Hyperloop::AbstractObject*>(JSObjectGetPrivate(JSValueToObject(ctx,value,exception)));');
		preamble[1].should.equal('auto valuebuf2 = static_cast<Hyperloop::NativeObject<struct __CFAllocator *> *>(valuebuf);');
	});

	it('CFStringRef', function(){
		var metabase = {
			types: {
				"CFStringRef": {
					"name": "CFStringRef",
					"alias": "CFStringRef",
					"type": "const struct __CFString *",
					"subtype": "const struct __CFString *",
					"metatype": "typedef",
					"framework": "CoreFoundation"
				}			
 			}
		};
		typelib.metabase = metabase;
		var type = typelib.resolveType('CFStringRef');
		type.isJSObject().should.be.true;
		type.isNativeStruct().should.be.true;
		type.isPointer().should.be.true;
		type.isConst().should.be.true;
		type.framework.should.be.equal('CoreFoundation');
		var preamble = [], cleanup = [], declare = [];
		type.toJSBody('value',preamble,cleanup,declare).should.be.equal('CFStringRef_ToJSValue(ctx,value,exception)');
		cleanup.should.be.empty;
		declare.should.not.be.empty;
		preamble.should.be.empty;
		declare[0].should.equal('JSValueRef CFStringRef_ToJSValue(JSContextRef,CFStringRef,JSValueRef *);');
		declare=[];
		type.toNativeBody('value',preamble,cleanup,declare).should.be.equal('valuebuf2->getObject()');
		cleanup.should.be.empty;
		declare.should.be.empty;
		preamble.should.not.be.empty;
		preamble[0].should.equal('auto valuebuf = static_cast<Hyperloop::AbstractObject*>(JSObjectGetPrivate(JSValueToObject(ctx,value,exception)));');
		preamble[1].should.equal('auto valuebuf2 = static_cast<Hyperloop::NativeObject<CFStringRef> *>(valuebuf);');
	});

	it('CFAllocatorCopyDescriptionCallBack', function(){
		var metabase = {
			types: {
				"CFStringRef": {
					"name": "CFStringRef",
					"alias": "CFStringRef",
					"type": "const struct __CFString *",
					"subtype": "const struct __CFString *",
					"metatype": "typedef",
					"framework": "CoreFoundation"
				},
				"CFAllocatorCopyDescriptionCallBack": {
					"name": "CFAllocatorCopyDescriptionCallBack",
					"alias": "CFAllocatorCopyDescriptionCallBack",
					"type": "CFStringRef (*)(const void *)",
					"subtype": "CFStringRef (*)(const void *)",
					"metatype": "typedef",
					"framework": "CoreFoundation"
				}
			}
		};
		typelib.metabase = metabase;
		var type = typelib.resolveType('CFAllocatorCopyDescriptionCallBack');
		type.isJSObject().should.be.true;
		type.isNativeFunctionPointer().should.be.true;
		type.isPointer().should.be.false;
		type.isConst().should.be.false;
		type.framework.should.be.equal('CoreFoundation');
		var preamble = [], cleanup = [], declare = [];
		type.toJSBody('value',preamble,cleanup,declare).should.be.equal('HyperloopVoidPointerToJSValue(ctx,reinterpret_cast<void *>(value),exception)');
		declare.should.be.empty;
		preamble.should.be.empty;
		cleanup.should.be.empty;
		type.toNativeBody('value',preamble,cleanup).should.be.equal('nullptr');
		declare.should.be.empty;
		preamble.should.be.empty;
		cleanup.should.be.empty;
		var content = [
			'CFStringRef CFAllocatorCopyDescriptionCallBack_FunctionCallback(const void * arg0)',
			'{',
			'\tauto ctx = HyperloopGlobalContext();',
			'\tJSValueRef *exception = nullptr;',
			'\tauto argumentCount = 0;',
			'\tJSValueRef arguments[] = {  };',
			'\tauto fnCallbackResult = HyperloopInvokeFunctionCallback((void *)arg0,argumentCount,arguments,exception);',
			'\tauto returnResult = JSValueTo_CFStringRef(ctx,fnCallbackResult,exception);',
			'\treturn returnResult;',
			'}',
			'',
			'/**',
			' * called to allow the construction of a native function callback',
			' */',
			'JSValueRef CFAllocatorCopyDescriptionCallBack_constructor(JSContextRef ctx, JSObjectRef function, JSObjectRef thisObject, size_t argumentCount, const JSValueRef arguments[], JSValueRef* exception)',
			'{',
			'\tif (argumentCount==0 || !JSValueIsObject(ctx,arguments[0]) || !JSObjectIsFunction(ctx,JSValueToObject(ctx,arguments[0],exception)))',
			'\t{',
			'\t\t*exception = HyperloopMakeException(ctx,"first argument must be a function callback");',
			'\t\treturn JSValueMakeUndefined(ctx);',
			'\t}',
			'',
			'\treturn JSValueMakeUndefined(ctx);',
			'}',
		];
		type.toNativeFunctionCallback('CFAllocatorCopyDescriptionCallBack').should.be.equal(content.join('\n'));
	});

	it('NSComparator', function(){
		var metabase = {
			types: {
				"id": {
					"name": "id",
					"alias": "id",
					"type": "struct objc_object *",
					"subtype": "struct objc_object *",
					"metatype": "typedef",
					"fields": [
						{
							"name": "isa",
							"type": "Class",
							"subtype": "Class"
						}
					]
				},
				"NSComparisonResult": {
					"types": {
						"NSOrderedAscending": {
							"type": "int",
							"subtype": "NSInteger",
							"value": -1
						},
						"NSOrderedSame": {
							"type": "int",
							"subtype": "NSInteger",
							"value": 0
						},
						"NSOrderedDescending": {
							"type": "int",
							"subtype": "NSInteger",
							"value": 1
						}
					},
					"name": "NSComparisonResult",
					"metatype": "enum",
					"framework": "Foundation"					
				},
				"NSComparator": {
					"name": "NSComparator",
					"alias": "NSComparator",
					"type": "NSComparisonResult (^)(id, id)",
					"subtype": "NSComparisonResult (^)(id, id)",
					"metatype": "typedef",
					"framework": "Foundation"
				}
			}
		};
		typelib.metabase = metabase;
		var type = typelib.resolveType('NSComparator');
		type.isJSObject().should.be.true;
		type.isNativeBlock().should.be.true;
		type.isPointer().should.be.false;
		type.isConst().should.be.false;
		type.framework.should.be.equal('Foundation');
		var preamble = [], cleanup = [], declare = [];
		type.toJSBody('value',preamble,cleanup,declare).should.be.equal('HyperloopVoidPointerToJSValue(ctx,static_cast<void *>(value),exception)');
		declare.should.be.empty;
		preamble.should.be.empty;
		cleanup.should.be.empty;
		type.toNativeBody('value',preamble,cleanup,declare).should.be.equal('nullptr');
		declare.should.be.empty;
		preamble.should.be.empty;
		cleanup.should.be.empty;
		// TODO
		// type.toNativeFunctionCallback('CFAllocatorCopyDescriptionCallBack').should.be.equal('');
	});

	it('_opaque_pthread_attr_t', function(){
		var metabase = {
			types: {
				"_opaque_pthread_attr_t": {
					"metatype": "struct",
					"name": "_opaque_pthread_attr_t",
					"type": "definition",
					"subtype": "definition",
					"fields": [
						{
							"name": "__sig",
							"type": "long",
							"subtype": "long"
						},
						{
							"name": "__opaque",
							"type": "char [36]",
							"subtype": "char [36]"
						}
					]
				}
			}
		};
		typelib.metabase = metabase;
		var type = typelib.resolveType('_opaque_pthread_attr_t');
		var preamble = [], cleanup = [], declare = [];
		type.toJSBody('value',preamble,cleanup,declare).should.be.equal('_opaque_pthread_attr_t_ToJSValue(ctx,value,exception)');
		preamble.should.be.empty;
		cleanup.should.be.empty;
		declare.should.not.be.empty;
		declare[0].should.equal('JSValueRef _opaque_pthread_attr_t_ToJSValue(JSContextRef,_opaque_pthread_attr_t,JSValueRef *);');
		var fields = type.toFields();
		fields.should.have.length(2);
		fields[0].should.have.property('name','__sig');
		fields[0].should.have.property('type');
		fields[1].should.have.property('name','__opaque');
		fields[1].should.have.property('type');
		fields[0].type.isNativePrimitive().should.be.true;
		fields[0].type.isJSNumber().should.be.true;
		fields[1].type.isNativeString().should.be.true;
		fields[1].type.isJSString().should.be.true;
		fields[1].type.getCharArrayLength().should.equal(36);
		declare = [];
		type.toNativeBody('value',preamble,cleanup,declare).should.equal('JSValueTo__opaque_pthread_attr_t(ctx,value,exception)');
		preamble.should.be.empty;
		cleanup.should.be.empty;
		declare.should.not.be.empty;
		declare[0].should.be.equal('EXPORTAPI _opaque_pthread_attr_t JSValueTo__opaque_pthread_attr_t(JSContextRef,JSValueRef,JSValueRef *);');
	});

	it('SFNTLookupFormatSpecificHeader', function(){
		var metabase = {
			types: {
				"SFNTLookupFormatSpecificHeader": {
					"name": "SFNTLookupFormatSpecificHeader",
					"alias": "SFNTLookupFormatSpecificHeader",
					"type": "union SFNTLookupFormatSpecificHeader",
					"subtype": "union SFNTLookupFormatSpecificHeader",
					"metatype": "typedef",
					"framework": "CoreText",
					"fields": [
						{
						"name": "theArray",
						"type": "struct SFNTLookupArrayHeader",
						"subtype": "SFNTLookupArrayHeader"
						},
						{
						"name": "segment",
						"type": "struct SFNTLookupSegmentHeader",
						"subtype": "SFNTLookupSegmentHeader"
						},
						{
						"name": "single",
						"type": "struct SFNTLookupSingleHeader",
						"subtype": "SFNTLookupSingleHeader"
						},
						{
						"name": "trimmedArray",
						"type": "struct SFNTLookupTrimmedArrayHeader",
						"subtype": "SFNTLookupTrimmedArrayHeader"
						}
					]
				}				
			}
		};
		typelib.metabase = metabase;
		var type = typelib.resolveType('SFNTLookupFormatSpecificHeader');
		type.isNativeUnion().should.be.true;
		type.isJSObject().should.be.true;
		var preamble = [], cleanup = [], declare = [];
		type.toJSBody('value',preamble,cleanup,declare).should.be.equal('SFNTLookupFormatSpecificHeader_ToJSValue(ctx,value,exception)');
		preamble.should.be.empty;
		cleanup.should.be.empty;
		declare.should.not.be.empty;
		declare[0].should.equal('JSValueRef SFNTLookupFormatSpecificHeader_ToJSValue(JSContextRef,SFNTLookupFormatSpecificHeader,JSValueRef *);');
		declare = [];
		type.toNativeBody('value',preamble,cleanup,declare).should.equal('JSValueTo_SFNTLookupFormatSpecificHeader(ctx,value,exception)');
		preamble.should.be.empty;
		cleanup.should.be.empty;
		declare.should.not.be.empty;
		declare[0].should.be.equal('EXPORTAPI SFNTLookupFormatSpecificHeader JSValueTo_SFNTLookupFormatSpecificHeader(JSContextRef,JSValueRef,JSValueRef *);');
	});

	it('CGAffineTransform', function(){
		var metabase = {
			types: {
				"CGAffineTransform": {
					"metatype": "struct",
					"name": "CGAffineTransform",
					"type": "definition",
					"subtype": "definition",
					"framework": "CoreGraphics",
					"fields": [
						{
						"name": "a",
						"type": "float",
						"subtype": "CGFloat"
						},
						{
						"name": "b",
						"type": "float",
						"subtype": "CGFloat"
						},
						{
						"name": "c",
						"type": "float",
						"subtype": "CGFloat"
						},
						{
						"name": "d",
						"type": "float",
						"subtype": "CGFloat"
						},
						{
						"name": "tx",
						"type": "float",
						"subtype": "CGFloat"
						},
						{
						"name": "ty",
						"type": "float",
						"subtype": "CGFloat"
						}
					]
				}				
			}
		};
		typelib.metabase = metabase;
		var type = typelib.resolveType('CGAffineTransform');
		type.isJSObject().should.be.true;
		type.isNativeStruct().should.be.true;
		type.toString().should.be.equal('CGAffineTransform');
		type.toName().should.be.equal('CGAffineTransform');
	});

	it('MKTileOverlayPath', function(){
		var metabase = {
			types: {
				"MKTileOverlayPath": {
					"name": "MKTileOverlayPath",
					"alias": "MKTileOverlayPath",
					"type": "MKTileOverlayPath",
					"subtype": "struct MKTileOverlayPath",
					"metatype": "typedef",
					"framework": "MapKit",
					"fields": [
						{
						"name": "x",
						"type": "int",
						"subtype": "NSInteger"
						},
						{
						"name": "y",
						"type": "int",
						"subtype": "NSInteger"
						},
						{
						"name": "z",
						"type": "int",
						"subtype": "NSInteger"
						},
						{
						"name": "contentScaleFactor",
						"type": "float",
						"subtype": "CGFloat"
						}
					]
				}				
			}
		}
		typelib.metabase = metabase;
		// test where subtype starts with struct but not type
		var type = typelib.resolveType('MKTileOverlayPath');
		type.isJSObject().should.be.true;
		type.isNativeStruct().should.be.true;
		type.toString().should.be.equal('MKTileOverlayPath');
		type.toName().should.be.equal('MKTileOverlayPath');
	});

	it('GLvoid', function(){
		var metabase = {
			types: {
				"GLvoid": {
					"name": "GLvoid",
					"alias": "GLvoid",
					"type": "void",
					"subtype": "void",
					"metatype": "typedef",
					"framework": "OpenGLES"
				}				
			}
		};
		typelib.metabase = metabase;
		// test where typedef to void
		var type = typelib.resolveType('GLvoid');
		type.isJSUndefined().should.be.true;
		type.isNativeVoid().should.be.true;
	});

	it('struct OpaqueMIDIDeviceList *', function(){
		var metabase = {
			types: {
				"OpaqueMIDIDeviceList": {
					"metatype": "struct",
					"name": "OpaqueMIDIDeviceList",
					"type": "struct OpaqueMIDIDeviceList",
					"subtype": "struct OpaqueMIDIDeviceList",
					"framework": "CoreMIDI"
				},
				"MIDIDeviceListRef": {
					"name": "MIDIDeviceListRef",
					"alias": "MIDIDeviceListRef",
					"type": "struct OpaqueMIDIDeviceList *",
					"subtype": "struct OpaqueMIDIDeviceList *",
					"metatype": "typedef",
					"framework": "CoreMIDI"
				}
			}
		};

		typelib.metabase = metabase;
		var type = typelib.resolveType('struct OpaqueMIDIDeviceList *');
		type.isNativeStruct().should.be.true;
		type.toString().should.be.equal('struct OpaqueMIDIDeviceList *');
		type.toName().should.be.equal('struct OpaqueMIDIDeviceList *');
	});

	it('NSStringEncoding', function(){
		var metabase = {
			types: {
				"NSStringEncoding": {
					"name": "NSStringEncoding",
					"alias": "NSStringEncoding",
					"type": "unsigned int",
					"subtype": "NSUInteger",
					"metatype": "typedef",
					"framework": "Foundation"
				}				
			}
		};
		typelib.metabase = metabase;
		var type = typelib.resolveType('NSStringEncoding');
		type.isNativePrimitive().should.be.true;
		type.isJSNumber().should.be.true;
		type.toString().should.be.equal('NSStringEncoding');

		type = typelib.resolveType('const NSStringEncoding *');
		type.isNativePrimitive().should.be.true;
		type.isJSNumber().should.be.true;
		type.isPointer().should.be.true;
		type.isConst().should.be.true;
		type.toString().should.be.equal('const NSStringEncoding *');
	});

	it('struct CGPath',function(){
		var metabase = {
			types: {
				"CGPath": {
					"metatype": "struct",
					"name": "CGPath",
					"type": "struct CGPath",
					"subtype": "struct CGPath",
					"framework": "CoreGraphics"
				},
				"struct CGPath": {
					"metatype": "struct",
					"name": "CGPath",
					"type": "struct CGPath",
					"subtype": "struct CGPath",
					"framework": "CoreGraphics"
				}
			}
		};
		typelib.metabase = metabase;
		var type = typelib.resolveType('CGPath');
		type.toString().should.be.equal('struct CGPath *');

		type = typelib.resolveType('const struct CGPath *');
		type.toString().should.be.equal('const struct CGPath *');
		type.isConst().should.be.true;
		type.isPointer().should.be.true;
		type.isNativeStruct().should.be.true;
		type.toName().should.be.equal('struct CGPath *');
	});

	it('NSGlyphProperty', function() {
		var metabase = {
			types: {
				"NSGlyphProperty": {
					"types": {
						"NSGlyphPropertyNull": {
						"type": "int",
						"subtype": "NSInteger",
						"value": 1
						},
						"NSGlyphPropertyControlCharacter": {
						"type": "int",
						"subtype": "NSInteger",
						"value": 2
						},
						"NSGlyphPropertyElastic": {
						"type": "int",
						"subtype": "NSInteger",
						"value": 4
						},
						"NSGlyphPropertyNonBaseCharacter": {
						"type": "int",
						"subtype": "NSInteger",
						"value": 8
						}
					},
					"name": "NSGlyphProperty",
					"metatype": "enum",
					"framework": "UIKit",
					"availability": {
						"platform": "ios",
						"introduced": "7.0",
						"deprecated": "0",
						"obseleted": "0",
						"message": ""
					}
				}
			}
		};
		typelib.metabase = metabase;
		var type = typelib.resolveType('NSGlyphProperty');
		type.toString().should.be.equal('NSGlyphProperty');
	});

	it('CFPropertyListRef', function(){
		var metabase = {
			types: {
				"CFPropertyListRef": {
					"name": "CFPropertyListRef",
					"alias": "CFPropertyListRef",
					"type": "const void *",
					"subtype": "CFTypeRef",
					"metatype": "typedef",
					"framework": "CoreFoundation"
				}
			}
		};
		typelib.metabase = metabase;
		var type = typelib.resolveType('CFPropertyListRef');
		type.toString().should.be.equal('CFPropertyListRef');
		type.toName().should.be.equal('CFPropertyListRef');
		type.getAsKey().should.be.equal('CFPropertyListRef');
		type.getFramework().should.be.equal('CoreFoundation');
	});

	it('__m64', function() {
		var metabase = {
			types: {
				"__m64": {
					"name": "__m64",
					"alias": "__m64",
					"type": "long long",
					"subtype": "long long",
					"metatype": "typedef",
					"import": "mmintrin.h",
					"vector": true,
					"vector_size": 1,
					"vector_type": "long long"
				}				
			}
		};
		typelib.metabase = metabase;
		var type = typelib.resolveType('__m64');
		type.isNativePrimitive().should.be.true;
		type.isJSNumber().should.be.true;
		type.toString().should.equal('__m64');
		type.getImport().should.equal('mmintrin.h');
		type.isNativePrimitiveVector().should.be.true;
		type.getNativeVectorSize().should.be.equal(1);
		type.getNativeVectorType().should.be.equal('long long');
	});

	it('isFunctionPointer', function(){
		var fp = typelib.isFunctionPointer;
		fp.test('__CLPK_logical (*)()').should.be.true;
		fp.exec('__CLPK_logical (*)()')[2].should.be.empty;
		fp.exec('__CLPK_logical (*)()')[1].should.be.equal('__CLPK_logical ');
	});

	it('const int *', function(){
		typelib.metabase = {};
		var type = typelib.resolveType('const int *');
		type.isNativePointer().should.be.false;
		type.isNativePrimitive().should.be.true;
		type.toNativeBody('value').should.be.equal('static_cast<int *>(HyperloopJSValueToVoidPointer(ctx,value,exception))');
	});

	it('SLRequestMethod', function(){
		var metabase = {
			types: {
				"SLRequestMethod": {
					"types": {
						"SLRequestMethodGET": {
						"type": "int",
						"subtype": "NSInteger",
						"value": 0
						},
						"SLRequestMethodPOST": {
						"type": "int",
						"subtype": "NSInteger",
						"value": 1
						},
						"SLRequestMethodDELETE": {
						"type": "int",
						"subtype": "NSInteger",
						"value": 2
						},
						"SLRequestMethodPUT": {
						"type": "int",
						"subtype": "NSInteger",
						"value": 3
						}
					},
					"name": "SLRequestMethod",
					"metatype": "enum",
					"framework": "CoreFoundation"
				},
				"enum SLRequestMethod": {
					"name": "TWRequestMethod",
					"alias": "TWRequestMethod",
					"type": "enum SLRequestMethod",
					"subtype": "SLRequestMethod",
					"metatype": "typedef",
					"framework": "Twitter"
				},
				"TWRequestMethod": {
					"name": "TWRequestMethod",
					"alias": "TWRequestMethod",
					"type": "enum SLRequestMethod",
					"subtype": "SLRequestMethod",
					"metatype": "typedef",
					"framework": "Twitter"
				}			
			}
		};
		typelib.metabase = metabase;
		var type = typelib.resolveType('SLRequestMethod');
		type.toString().should.equal('SLRequestMethod');
		type = typelib.resolveType('SLRequestMethod');
		type.toString().should.equal('SLRequestMethod');
		type.toNativeBody('value').should.equal('static_cast<SLRequestMethod>(JSValueToNumber(ctx,value,exception))');
	});

	it('const char *', function(){
		typelib.metabase = {};
		var type = typelib.resolveType('const char *');
		var preamble = [], cleanup = [], declares = [];
		type.toNativeBody('arguments[1]',preamble,cleanup,declares).should.equal('arguments_1_buf');
		preamble.should.not.be.empty;
		preamble[0].should.be.equal('auto arguments_1_buf = HyperloopJSValueToStringCopy(ctx,arguments[1],exception);');
		cleanup.should.not.be.empty;
		cleanup[0].should.be.equal('delete [] arguments_1_buf;');
		declares.should.be.empty;
	});

	it('_GLKMatrix4', function() {
		var metabase = {
			types: {
				"_GLKMatrix4": {
					"metatype": "union",
					"name": "_GLKMatrix4",
					"type": "definition",
					"subtype": "definition",
					"framework": "GLKit",
					"fields": [
						{
						"name": "m",
						"type": "float [16]",
						"subtype": "float [16]"
						}
					]
				},
				"GLKMatrix4": {
					"name": "GLKMatrix4",
					"alias": "GLKMatrix4",
					"type": "union _GLKMatrix4",
					"subtype": "union _GLKMatrix4",
					"metatype": "typedef",
					"framework": "GLKit",
					"fields": [
						{
						"name": "m",
						"type": "float [16]",
						"subtype": "float [16]"
						}
					]
				}			
			}
		};
		typelib.metabase = metabase;
		var type = typelib.resolveType('union _GLKMatrix4');
		type.toString().should.equal('union _GLKMatrix4');
		type.isNativeUnion().should.be.true;
		type = typelib.resolveType('GLKMatrix4');
		type.isNativeUnion().should.be.true;
	});

	it('const CGFloat *', function() {
		var metabase = {
			types: {
				"CGFloat": {
				"name": "CGFloat",
				"alias": "CGFloat",
				"type": "float",
				"subtype": "float",
				"metatype": "typedef",
				"framework": "CoreGraphics"
				}
			}
		};
		typelib.metabase = metabase;
		var type = typelib.resolveType('const CGFloat *');
		type.isNativePrimitive().should.be.true;
		type.isJSNumber().should.be.true;
		type.toJSBody('value').should.be.equal('HyperloopVoidPointerToJSValue(ctx,static_cast<void *>(const_cast<float *>(value)),exception)');
		type.toNativeBody('value').should.be.equal('static_cast<CGFloat *>(HyperloopJSValueToVoidPointer(ctx,value,exception))');
	});

	it('unsigned char *', function(){
		typelib.metabase = {};
		var type = typelib.resolveType('unsigned char *');
		type.toString().should.equal('unsigned char *');
		type.toName().should.equal('unsigned char *');
	});

	it('__CVBuffer', function(){
		var metabase = {
			types: {
				"__CVBuffer": {
					"metatype": "struct",
					"name": "__CVBuffer",
					"type": "struct __CVBuffer",
					"subtype": "struct __CVBuffer",
					"framework": "CoreVideo"
				},
					"struct __CVBuffer": {
					"metatype": "struct",
					"name": "__CVBuffer",
					"type": "struct __CVBuffer",
					"subtype": "struct __CVBuffer",
					"framework": "CoreVideo"
				}				
			}
		};
		typelib.metabase = metabase;
		var type = typelib.resolveType('struct __CVBuffer *');
		type.toString().should.equal('struct __CVBuffer *');
		type.toName().should.equal('struct __CVBuffer *');
	});

	it('CVImageBufferRef', function(){
		var metabase = {
			types: {
				"CVImageBufferRef": {
					"name": "CVImageBufferRef",
					"alias": "CVImageBufferRef",
					"type": "struct __CVBuffer *",
					"subtype": "CVBufferRef",
					"metatype": "typedef",
					"framework": "CoreVideo"
				}				
			}
		};
		typelib.metabase = metabase;
		var type = typelib.resolveType('CVImageBufferRef');
		type.toString().should.equal('CVImageBufferRef');
		type.toName().should.equal('CVImageBufferRef');
		type.isPointer().should.be.true;
	});

});

