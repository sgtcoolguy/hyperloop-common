/**
 * IR specs
 */
var should = require('should'),
	Uglify = require('uglify-js'),
	_ = require('underscore'),
	jsgen = require('../').compiler.jsgen,
	IR = require('../').compiler.IR;

describe("IR", function(){

	it("should be able to construct instance of IR", function(){
		jsgen.resetVariableNames();
		var ir = new IR();
		ir.should.be.an.object;
		ir.count.should.be.an.number;
		ir.count.should.be.equal(0);
	});

	it("should be able to create a value argument as number", function(){
		jsgen.resetVariableNames();
		var ir = new IR();
		var arg = ir.createValueArgument(1);
		arg.should.be.an.object;
		arg.metatype.should.be.equal('value');
		arg.value.should.be.equal(1);
		arg.type.should.be.equal('number');
		var code = arg.toNative().split('\n');
		code[0].should.be.equal('JSValueMakeNumber(ctx,1);');
	});

	it("should be able to create a value argument as string", function(){
		jsgen.resetVariableNames();
		var ir = new IR();
		var arg = ir.createValueArgument('1');
		arg.should.be.an.object;
		arg.metatype.should.be.equal('value');
		arg.value.should.be.equal('1');
		arg.type.should.be.equal('string');
		var code = arg.toNative().split('\n');
		code[1].should.be.equal('const char var1[] = { 49,0 };');
		code[2].should.be.equal('auto var0 = JSStringCreateWithUTF8CString(var1);');
	});

	it("should be able to create a value argument as boolean", function(){
		jsgen.resetVariableNames();
		var ir = new IR();
		var arg = ir.createValueArgument(true);
		arg.should.be.an.object;
		arg.metatype.should.be.equal('value');
		arg.value.should.be.equal(true);
		arg.type.should.be.equal('boolean');
		var code = arg.toNative().split('\n');
		code[0].should.be.equal('JSValueMakeBoolean(ctx,true);');
	});

	it("should be able to create a value argument as null", function(){
		jsgen.resetVariableNames();
		var ir = new IR();
		var arg = ir.createValueArgument(null);
		arg.should.be.an.object;
		arg.metatype.should.be.equal('value');
		should(arg.value).be.equal(null);
		arg.type.should.be.equal('null');
		var code = arg.toNative().split('\n');
		code[0].should.be.equal('JSValueMakeNull(ctx);');
	});

	it("should be able to create a value argument as undefined", function(){
		jsgen.resetVariableNames();
		var ir = new IR();
		var arg = ir.createValueArgument(undefined);
		arg.should.be.an.object;
		arg.metatype.should.be.equal('value');
		should(arg.value).be.equal(undefined);
		arg.type.should.be.equal('undefined');
		var code = arg.toNative().split('\n');
		code[0].should.be.equal('JSValueMakeUndefined(ctx);');
	});

	it("should be able to create a variable argument", function(){
		jsgen.resetVariableNames();
		var ir = new IR();
		var arg = ir.createVariableArgument('a');
		arg.should.be.an.object;
		arg.metatype.should.be.equal('variable');
		should(arg.value).be.equal('a');
		arg.type.should.be.equal('variable');
		var code = arg.toNative().split('\n');
		code[0].should.be.equal('a; // variable');
	});

	it("should be able to parse const variable", function(){
		jsgen.resetVariableNames();
		var ir = new IR(),
			source = 'const CONST=\'value\';',
			ast = Uglify.parse(source);
		ir.parse({options:{}}, 'app.js', 'app.js', 'app.js', 'app.js', source, ast);
		ir.count.should.be.equal(1);
		should.exist(ir.nodes[0].toNative);
		ir.nodes[0].type.should.be.equal('variable');
		ir.nodes[0].metatype.should.be.equal('string');
		ir.nodes[0].name.should.be.equal('CONST');
		ir.nodes[0].value.should.be.equal('value');
		ir.nodes[0].line.should.be.equal(1);
		ir.nodes[0].filename.should.be.equal('app.js');
		var code = ir.nodes[0].toNative().split('\n');
		code[2].should.be.equal('const char var2[] = { 118,97,108,117,101,0 };');
		code[3].should.be.equal('auto var1 = JSStringCreateWithUTF8CString(var2);');
		code[4].should.be.equal('auto CONST = JSValueMakeString(ctx,var1);');
		code[6].should.be.equal('auto var0 = JSStringCreateWithUTF8CString("CONST");');
	});

	it("should be able to parse variable", function(){
		jsgen.resetVariableNames();
		var ir = new IR(),
			source = 'var v1=\'value\';',
			ast = Uglify.parse(source);
		ir.parse({options:{}}, 'app.js', 'app.js', 'app.js', 'app.js', source, ast);
		ir.count.should.be.equal(1);
		should.exist(ir.nodes[0].toNative);
		ir.nodes[0].type.should.be.equal('variable');
		ir.nodes[0].metatype.should.be.equal('string');
		ir.nodes[0].name.should.be.equal('v1');
		ir.nodes[0].value.should.be.equal('value');
		ir.nodes[0].line.should.be.equal(1);
		ir.nodes[0].filename.should.be.equal('app.js');
		var code = ir.nodes[0].toNative().split('\n');
		code[2].should.be.equal('const char var2[] = { 118,97,108,117,101,0 };');
		code[4].should.be.equal('auto v1 = JSValueMakeString(ctx,var1);');
		code[6].should.be.equal('auto var0 = JSStringCreateWithUTF8CString("v1");');
		code[7].should.be.equal('JSObjectSetProperty(ctx,object,var0,v1,0,exception);');
	});

	it("should be able to parse JS function", function(){
		jsgen.resetVariableNames();
		var ir = new IR(),
			source = 'function doSomeFunc() {} doSomeFunc();',
			ast = Uglify.parse(source);
		ir.parse({options:{},symbols:{}}, 'app.js', 'app.js', 'app.js', 'app.js', source, ast);
		ir.count.should.be.equal(1);
		should.exist(ir.nodes[0].toNative);
		ir.nodes[0].type.should.be.equal('code');
		ir.nodes[0].code.should.be.equal('var doSomeFunc=(function doSomeFunc(){});doSomeFunc;doSomeFunc()');
		ir.nodes[0].line.should.be.equal(1);
		ir.nodes[0].filename.should.be.equal('app.js');
		var code = ir.nodes[0].toNative().split('\n');
		should(code).have.length(12);
		code[2].should.be.equal('const char var0[] = { 118,97,114,32,100,111,83,111,109,101,70,117,110,99,61,40,102,117,110,99,116,105,111,110,32,100,111,83,111,109');
		code[3].should.be.equal('    ,101,70,117,110,99,40,41,123,125,41,59,100,111,83,111,109,101,70,117,110,99,59,100,111,83,111,109,101,70,117');
		code[4].should.be.equal('    ,110,99,40,41,0 };');
		code[5].should.be.equal('auto var1 = JSStringCreateWithUTF8CString(var0);');
		code[6].should.be.equal('auto var2 = JSStringCreateWithUTF8CString("app.js");');
		code[7].should.be.equal('auto doSomeFunc = JSEvaluateScript(ctx,var1,object,var2,1,exception);');
		code[8].should.be.equal('JSStringRelease(var1);');
		code[9].should.be.equal('JSStringRelease(var2);');
		code[10].should.be.equal('CHECK_EXCEPTION(exception);');
	});

	it("should be able to parse builtin function", function(){
		jsgen.resetVariableNames();
		var ir = new IR(),
			source = 'abs();',
			ast = Uglify.parse(source);
		ir.parse({options:{},symbols:{}}, 'app.js', 'app.js', 'app.js', 'app.js', source, ast);
		ir.count.should.be.equal(1);
		should.exist(ir.nodes[0].toNative);
		ir.nodes[0].type.should.be.equal('code');
		ir.nodes[0].code.should.be.equal('abs()');
		ir.nodes[0].line.should.be.equal(1);
		ir.nodes[0].filename.should.be.equal('app.js');
		var code = ir.nodes[0].toNative().split('\n');
		code[2].should.be.equal('const char var0[] = { 97,98,115,40,41,0 };');
		code[3].should.be.equal('auto var1 = JSStringCreateWithUTF8CString(var0);');
		code[5].should.be.equal('JSEvaluateScript(ctx,var1,object,var2,1,exception);');
	});

	it("should be able to parse JS object", function(){
		jsgen.resetVariableNames();
		var ir = new IR(),
			source = 'var obj = { get frame(){return frame;}, get window(){return window;} };',
			ast = Uglify.parse(source);
		ir.parse({options:{},symbols:{}}, 'app.js', 'app.js', 'app.js', 'app.js', source, ast);
		should.exist(ir.nodes[0].toNative);
		ir.nodes[0].type.should.be.equal('code');
		ir.nodes[0].code.should.be.equal('obj={get frame(){return frame},get window(){return window}}');
		ir.nodes[0].line.should.be.equal(1);
		ir.nodes[0].filename.should.be.equal('app.js');
		var code = ir.nodes[0].toNative().split('\n');
		code[2].should.be.equal('const char var0[] = { 111,98,106,61,123,103,101,116,32,102,114,97,109,101,40,41,123,114,101,116,117,114,110,32,102,114,97,109,101,125');
		code[4].should.be.equal('auto var1 = JSStringCreateWithUTF8CString(var0);');
		code[6].should.be.equal('JSEvaluateScript(ctx,var1,object,var2,1,exception);');
	});

	it("should be able to parse native function", function(){
		jsgen.resetVariableNames();
		var ir = new IR(),
			source = 'CGPointMake_function(10,20);',
			ast = Uglify.parse(source);
		ir.parse({options:{},
			symbols:{
				'CGPointMake_function':{symbolname:'CGPointMake_function'}
			}}, 'app.js', 'app.js', 'app.js', 'app.js', source, ast);
		ir.count.should.be.equal(1);
		should.exist(ir.nodes[0].expression);
		should.exist(ir.nodes[0].toNative);
		should.not.exist(ir.nodes[0].name);
		ir.nodes[0].expression.type.should.be.equal('native');
		ir.nodes[0].expression.metatype.should.be.equal('function');
		ir.nodes[0].expression.name.should.be.equal('CGPointMake_function');
		ir.nodes[0].expression.symbolname.should.be.equal('CGPointMake_function');
		ir.nodes[0].expression.arguments.length.should.be.equal(2);
		ir.nodes[0].line.should.be.equal(1);
		ir.nodes[0].filename.should.be.equal('app.js');
		var code = ir.nodes[0].toNative().split('\n');
		code[2].should.be.equal('var1[0] = JSValueMakeNumber(ctx,10);');
		code[3].should.be.equal('var1[1] = JSValueMakeNumber(ctx,20);');
		code[4].should.be.equal('CGPointMake_function(ctx,CGPointMake_functionFn,CGPointMake_functionFn,2,var1,exception);');
	});

	it("should be able to parse variable from native function", function(){
		jsgen.resetVariableNames();
		var ir = new IR(),
			source = 'var point = CGPointMake_function(10,20);',
			ast = Uglify.parse(source);
		ir.parse({options:{},
			symbols:{
				'CGPointMake_function':{symbolname:'CGPointMake_function'}
			}}, 'app.js', 'app.js', 'app.js', 'app.js', source, ast);
		ir.count.should.be.equal(1);
		should.exist(ir.nodes[0].expression);
		should.exist(ir.nodes[0].toNative);
		ir.nodes[0].name.should.be.equal('point');
		ir.nodes[0].expression.type.should.be.equal('native');
		ir.nodes[0].expression.metatype.should.be.equal('function');
		ir.nodes[0].expression.name.should.be.equal('CGPointMake_function');
		ir.nodes[0].expression.symbolname.should.be.equal('CGPointMake_function');
		ir.nodes[0].expression.arguments.length.should.be.equal(2);
		ir.nodes[0].line.should.be.equal(1);
		ir.nodes[0].filename.should.be.equal('app.js');
		var code = ir.nodes[0].toNative().split('\n');
		code[2].should.be.equal('var1[0] = JSValueMakeNumber(ctx,10);');
		code[3].should.be.equal('var1[1] = JSValueMakeNumber(ctx,20);');
		code[4].should.be.equal('auto point = CGPointMake_function(ctx,CGPointMake_functionFn,CGPointMake_functionFn,2,var1,exception);');
		code[8].should.be.equal('auto var0 = JSStringCreateWithUTF8CString("point");');
		code[9].should.be.equal('JSObjectSetProperty(ctx,object,var0,point,0,exception);');
	});

	it("should be able to parse getter from native variable", function(){
		jsgen.resetVariableNames();
		var ir = new IR(),
			source = 'var point = CGPointMake_function(10,20);\nvar x = CGPoint_Get_x(point);',
			ast = Uglify.parse(source);
		ir.parse({options:{},
			symbols:{
				'CGPointMake_function':{symbolname:'CGPointMake_function'},
				'CGPoint_Get_x':{symbolname:'CGPoint_Get_x'},
				'CGPoint_Set_x':{symbolname:'CGPoint_Set_x'}
			}}, 'app.js', 'app.js', 'app.js', 'app.js', source, ast);
		ir.count.should.be.equal(2);
		var node = _.find(ir.nodes, function(value, key) {
			return value.line == 2;
		});
		node.name.should.be.equal('x');
		should.exist(node.expression);
		should.exist(node.toNative);
		node.expression.type.should.be.equal('native');
		node.expression.metatype.should.be.equal('function');
		node.expression.name.should.be.equal('CGPoint_Get_x');
		node.expression.arguments.length.should.be.equal(1);
		var code = node.toNative().split('\n');
		code[2].should.be.equal('var1[0] = point; // variable');
		code[3].should.be.equal('auto x = CGPoint_Get_x(ctx,CGPoint_Get_xFn,CGPoint_Get_xFn,1,var1,exception);');
		code[7].should.be.equal('auto var0 = JSStringCreateWithUTF8CString("x");');
		code[8].should.be.equal('JSObjectSetProperty(ctx,object,var0,x,0,exception);');
	});

	it("should be able to parse setter from native variable", function(){
		jsgen.resetVariableNames();
		var ir = new IR(),
			source = 'var point = CGPointMake_function(10,20);\nCGPoint_Set_x(point,11);',
			ast = Uglify.parse(source);
		ir.parse({options:{},
			symbols:{
				'CGPointMake_function':{symbolname:'CGPointMake_function'},
				'CGPoint_Get_x':{symbolname:'CGPoint_Get_x'},
				'CGPoint_Set_x':{symbolname:'CGPoint_Set_x'}
			}}, 'app.js', 'app.js', 'app.js', 'app.js', source, ast);
		ir.count.should.be.equal(2);
		var node = _.find(ir.nodes, function(value, key) {
			return value.line == 2;
		});
		should.exist(node.expression);
		should.exist(node.toNative);
		node.expression.type.should.be.equal('native');
		node.expression.metatype.should.be.equal('function');
		node.expression.name.should.be.equal('CGPoint_Set_x');
		node.expression.arguments.length.should.be.equal(2);
		var code = node.toNative().split('\n');
		code[2].should.be.equal('var1[0] = point; // variable');
		code[3].should.be.equal('var1[1] = JSValueMakeNumber(ctx,11);');
		code[4].should.be.equal('CGPoint_Set_x(ctx,CGPoint_Set_xFn,CGPoint_Set_xFn,2,var1,exception);');
	});

	it("should be able to parse native setter with arithmetic operation", function(){
		jsgen.resetVariableNames();
		var ir = new IR(),
			source = 'var point = CGPointMake_function(10,20);\nCGPoint_Set_x(point, CGPoint_Get_x(point) + 11)',
			ast = Uglify.parse(source);
		ir.parse({options:{},
			symbols:{
				'CGPointMake_function':{symbolname:'CGPointMake_function'},
				'CGPoint_Get_x':{symbolname:'CGPoint_Get_x'},
				'CGPoint_Set_x':{symbolname:'CGPoint_Set_x'}
			}}, 'app.js', 'app.js', 'app.js', 'app.js', source, ast);
		ir.count.should.be.equal(2);
		var node = _.find(ir.nodes, function(value, key) {
			return value.line == 2;
		});
		should.exist(node.toNative);
		node.type.should.be.equal('code');
		node.code.should.be.equal('CGPoint_Set_x(point,CGPoint_Get_x(point)+11)');
		var code = node.toNative().split('\n');
		code[2].should.be.equal('const char var0[] = { 67,71,80,111,105,110,116,95,83,101,116,95,120,40,112,111,105,110,116,44,67,71,80,111,105,110,116,95,71,101');
		code[4].should.be.equal('auto var1 = JSStringCreateWithUTF8CString(var0);');
		code[6].should.be.equal('JSEvaluateScript(ctx,var1,object,var2,2,exception);');
	});

	it("should be able to parse nested native function", function(){
		jsgen.resetVariableNames();
		var ir = new IR(),
			source = 'var bounds = UIScreen_Get_bounds(UIScreen_mainScreen());',
			ast = Uglify.parse(source);
		ir.parse({options:{},
			symbols:{
				'UIScreen_Get_bounds':{symbolname:'UIScreen_Get_bounds'},
				'UIScreen_mainScreen':{symbolname:'UIScreen_mainScreen'},
			}}, 'app.js', 'app.js', 'app.js', 'app.js', source, ast);
		ir.count.should.be.equal(1);
		should.exist(ir.nodes[0].name);
		should.exist(ir.nodes[0].expression);
		should.exist(ir.nodes[0].toNative());
		ir.nodes[0].name.should.be.equal('bounds');
		ir.nodes[0].line.should.be.equal(1);
		ir.nodes[0].filename.should.be.equal('app.js');
		ir.nodes[0].expression.type.should.be.equal('native');
		ir.nodes[0].expression.metatype.should.be.equal('function');
		ir.nodes[0].expression.name.should.be.equal('UIScreen_Get_bounds');
		ir.nodes[0].expression.arguments.length.should.be.equal(1);
		var code = ir.nodes[0].toNative().split('\n');
		code[3].should.be.equal('var3[0] = UIScreen_mainScreen(ctx,UIScreen_mainScreenFn,UIScreen_mainScreenFn,0,nullptr,exception);');
		code[6].should.be.equal('bounds = UIScreen_Get_bounds(ctx,UIScreen_Get_boundsFn,UIScreen_Get_boundsFn,1,var3,exception);');
		code[10].should.be.equal('auto var2 = JSStringCreateWithUTF8CString("bounds");');
		code[11].should.be.equal('JSObjectSetProperty(ctx,object,var2,bounds,0,exception);');
	});

	it("should be able to parse native constructor", function(){
		jsgen.resetVariableNames();
		var ir = new IR(),
			source = 'var bounds = UIScreen_Get_bounds(UIScreen_mainScreen());\nvar window = UIWindow_constructor_initWithFrame(bounds);',
			ast = Uglify.parse(source);
		ir.parse({options:{},
			symbols:{
				'UIScreen_Get_bounds':{symbolname:'UIScreen_Get_bounds'},
				'UIScreen_mainScreen':{symbolname:'UIScreen_mainScreen'},
				'UIWindow_constructor_initWithFrame':{symbolname:'UIWindow_constructor_initWithFrame'},
			}}, 'app.js', 'app.js', 'app.js', 'app.js', source, ast);
		ir.count.should.be.equal(2);
		var node = _.find(ir.nodes, function(value, key) {
			return value.line == 2;
		});
		should.exist(node.toNative);
		should.exist(node.expression);
		node.name.should.be.equal('window');
		node.filename.should.be.equal('app.js');
		node.expression.type.should.be.equal('native');
		node.expression.metatype.should.be.equal('function');
		node.expression.name.should.be.equal('UIWindow_constructor_initWithFrame');
		node.expression.arguments.length.should.be.equal(1);
		var code = node.toNative().split('\n');
		code[2].should.be.equal('var1[0] = bounds; // variable');
		code[3].should.be.equal('auto window = UIWindow_constructor_initWithFrame(ctx,UIWindow_constructor_initWithFrameFn,UIWindow_constructor_initWithFrameFn,1,var1,exception);');
		code[7].should.be.equal('auto var0 = JSStringCreateWithUTF8CString("window");');
		code[8].should.be.equal('JSObjectSetProperty(ctx,object,var0,window,0,exception);');
	});
});
