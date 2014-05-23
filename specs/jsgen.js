var should = require('should'),
	jsgen = require('../').compiler.jsgen;

describe("JS source header generation", function() {

	it("should transform simple expression", function(){
		var source = '1+1',
			result = jsgen.transform(source);
		result.should.not.be.null;
		result.source.should.be.equal("_('M'), _('S'), _('s'), _('x')");
		result.length.should.be.equal(4);
	});

	it("should transform replace newlines", function(){
		var source = '\n1+1\n',
			result = jsgen.transform(source);
		result.should.not.be.null;
		result.source.should.be.equal("_('M'), _('S'), _('s'), _('x')");
		result.length.should.be.equal(4);
	});

	it("should transform replace newlines but preserve spaces", function(){
		var source = '\n1 + 1\n',
			result = jsgen.transform(source);
		result.should.not.be.null;
		result.source.should.be.equal("_('M'), _('S'), _('A'), _('r'), _('I'), _('D'), _('E'), _('=')");
		result.length.should.be.equal(8);
	});

	it("should transform replace newlines but preserve tabs", function(){
		var source = '\n1\t+\t1\n',
			result = jsgen.transform(source);
		result.should.not.be.null;
		result.source.should.be.equal("_('M'), _('Q'), _('k'), _('r'), _('C'), _('T'), _('E'), _('=')");
		result.length.should.be.equal(8);
	});

	it("should transform preserve newlines", function(){
		var source = '\n1\n+\n1\n',
			result = jsgen.transform(source);
		result.should.not.be.null;
		result.source.should.be.equal("_('M'), _('Q'), _('o'), _('r'), _('C'), _('j'), _('E'), _('=')");
		result.length.should.be.equal(8);
	});

	it("should transform with custom transformer", function(){
		var source = '\n1\t+\t1\n',
			transformer = function(value) {
				return "X('"+value+"')";
			},
			result = jsgen.transform(source,transformer);
		result.should.not.be.null;
		result.source.should.be.equal("X('M'), X('Q'), X('k'), X('r'), X('C'), X('T'), X('E'), X('=')");
		result.length.should.be.equal(8);
	});

	it("should transform with custom transformer and allow omission", function(){
		var source = '\n1\t+\t1\n',
			transformer = function(value) {
				if (value!='\\t') return "X('"+value+"')";
			},
			result = jsgen.transform(source,transformer);
		result.should.not.be.null;
		result.source.should.be.equal("X('M'), X('Q'), X('k'), X('r'), X('C'), X('T'), X('E'), X('=')");
		result.length.should.be.equal(8);
	});

	it("should transform with custom transformer and provide no wrapping", function(){
		var source = '\n1\t+\t1\n',
			transformer = function(value) {
				return value!='\\t' && value;
			},
			result = jsgen.transform(source,transformer);
		result.should.not.be.null;
		result.source.should.be.equal("M, Q, k, r, C, T, E, =");
		result.length.should.be.equal(8);
	});

	it("should transform with custom spacing len", function(){
		var source = '1+1',
			result = jsgen.transform(source,1); // wrap every char
		result.should.not.be.null;
		result.source.should.be.equal("_('M'), \n\t_('S'), \n\t_('s'), \n\t_('x')");
		result.length.should.be.equal(4);
	});

	it('should generate definition', function(){
		var source = '1+1',
			srccode = jsgen.transform(source),
			result = jsgen.generateDefine('foo',srccode);
		result.should.not.be.null;
		result.should.be.equal("static const char foo[] = {\n\t_('M'), _('S'), _('s'), _('x')\n};\nstatic const size_t foo_length = 4;\n");
	});

	it('should generate source code body', function(){
		var source = '1+1',
			srccode = jsgen.transform(source),
			define = jsgen.generateDefine('foo',srccode),
			result = jsgen.generateBody('// header','0xa',[define]);
		result.should.not.be.null;
		result.should.be.equal("// header\n#define _HL_XOR 0xa\n#define _(v) (char)((int)v^_HL_XOR)\n\nstatic const char foo[] = {\n\t_('M'), _('S'), _('s'), _('x')\n};\nstatic const size_t foo_length = 4;\n");
	});

	it('should generate source code body with no header and default xor', function(){
		var source = '1+1',
			srccode = jsgen.transform(source),
			define = jsgen.generateDefine('foo',srccode),
			result = jsgen.generateBody(define);
		result.should.not.be.null;
		result.should.be.equal("#define _HL_XOR 0xAC\n#define _(v) (char)((int)v^_HL_XOR)\n\nstatic const char foo[] = {\n\t_('M'), _('S'), _('s'), _('x')\n};\nstatic const size_t foo_length = 4;\n");
	});

	it('should generate decoder define', function(){
		var result = jsgen.generateDecoder('foo');
		result.should.not.be.null;
		result.should.be.equal('#define HL_DECODE_foo(array,buf)\\\nfor (size_t i = 0; i < foo_length; i++) {\\\n\tbuf[i] = array[i] ^ _HL_XOR;\\\n}\n');
	});

	it('should generate same obfuscation symbol', function(){
		var uniq = ''+new Date;
		jsgen.obfuscate(uniq).should.be.equal(jsgen.obfuscate(uniq));
	});
});
