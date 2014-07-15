/**
 * compiler specs
 */

var should = require('should'),
	ast = require('../').compiler.ast;

describe("ast", function(){
	it("should load private APIs for testing", function(){
		should(ast.testing.compileCommand).should.be.ok;
	});
});