/**
 * IR specs
 */
var should = require('should'),
	IR = require('../').compiler.IR;

describe("IR", function(){

	it("should be able to construct instance of IR", function(){
		var ir = new IR();
		ir.should.be.an.object;
		ir.count.should.be.an.number;
		ir.count.should.be.equal(0);
	});

	it("should be able to create a native function expression", function(){
		var ir = new IR();
		var expr = ir.createNativeFunction('a','a');
		expr.should.be.an.object;
		expr.type.should.be.equal('native');
		expr.metatype.should.be.equal('function');
		expr.name.should.be.equal('a');
		expr.symbolname.should.be.equal('a');
		should(expr.arguments).be.undefined;
	});

	it("should be able to create a value argument as number", function(){
		var ir = new IR();
		var arg = ir.createValueArgument(1);
		arg.should.be.an.object;
		arg.metatype.should.be.equal('value');
		arg.value.should.be.equal(1);
		arg.type.should.be.equal('number');
	});

	it("should be able to create a value argument as string", function(){
		var ir = new IR();
		var arg = ir.createValueArgument('1');
		arg.should.be.an.object;
		arg.metatype.should.be.equal('value');
		arg.value.should.be.equal('1');
		arg.type.should.be.equal('string');
	});

	it("should be able to create a value argument as boolean", function(){
		var ir = new IR();
		var arg = ir.createValueArgument(true);
		arg.should.be.an.object;
		arg.metatype.should.be.equal('value');
		arg.value.should.be.equal(true);
		arg.type.should.be.equal('boolean');
	});

	it("should be able to create a value argument as null", function(){
		var ir = new IR();
		var arg = ir.createValueArgument(null);
		arg.should.be.an.object;
		arg.metatype.should.be.equal('value');
		should(arg.value).be.equal(null);
		arg.type.should.be.equal('null');
	});

	it("should be able to create a value argument as undefined", function(){
		var ir = new IR();
		var arg = ir.createValueArgument(undefined);
		arg.should.be.an.object;
		arg.metatype.should.be.equal('value');
		should(arg.value).be.equal(undefined);
		arg.type.should.be.equal('undefined');
	});

	it("should be able to create a variable argument", function(){
		var ir = new IR();
		var arg = ir.createVariableArgument('a');
		arg.should.be.an.object;
		arg.metatype.should.be.equal('variable');
		should(arg.value).be.equal('a');
		arg.type.should.be.equal('variable');
	});

	it("should be able to create assignment with native function", function(){
		var ir = new IR();
		var expr = ir.createNativeFunction('a','a');
		ir.addAssignment("v", expr);
		ir.count.should.be.equal(1);
		var found = ir.map(function(i){ return i; });
		should(found).not.be.null;
		should(found[0].expression).be.equal(expr);
		should(found[0].expression.name).be.equal("a");
		should(found[0].name).be.equal("v");
	});

	it("should be able to create assignment and add it", function(){
		var ir = new IR();
		var expr = ir.createNativeFunction('a','a');
		ir.addExpression(expr);
		ir.count.should.be.equal(1);
		var found = ir.map(function(i){ return i; });
		should(found).not.be.null;
		should(found[0].name).be.equal("a");
	});

});