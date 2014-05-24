/**
 * library front-end test case
 */
var should = require('should'),
	path = require('path'),
	fs = require('fs'),
	appc = require('node-appc'),
	_ = require('underscore'),
	library = require('../').compiler.library,
	typelib = require('../').compiler.type;

describe("Library front-end", function() {

	it("should load", function(done) {
		should.exist(library);
		done();
	});

	it.skip("should add returnType of methods to symbol table", function(done) {
		this.timeout(100000);
		var arch = 'android',
			options = {DEBUG:true,platform:arch,OBFUSCATE:false},
			symboltable = {},
			state = {
				metabase: {classes: {'java.lang.CharSequence': {}}},
				libfile: 'blah',
				symbols: {},
				obfuscate: false
			},
			symbols = {"java_lang_String_constructor":{"type":"constructor","metatype":"constructor","symbolname":"java_lang_String_constructor","class":"java.lang.String","location":{"file":"./app.js","comments_before":[],"nlb":false,"endpos":29,"pos":26,"col":10,"line":2,"value":"new","type":"operator"},"argcount":1},"java_lang_String_subSequence":{"type":"method","metatype":"instance","symbolname":"java_lang_String_subSequence","instance":"obj","class":"java.lang.String","name":"subSequence","location":{"file":"./app.js","comments_before":[],"nlb":false,"endpos":70,"pos":67,"col":10,"line":3,"value":"obj","type":"name"},"argcount":2,"method":{"exceptions":[],"args":[{"type":"int"},{"type":"int"}],"attributes":["public"],"instance":true,"returnType":"java.lang.CharSequence","signature":"(II)Ljava/lang/CharSequence;"},"returnType":"java.lang.CharSequence"}};
		
		library.generateCodeDependencies(options,state,symboltable,'example.js',arch,symbols,function(node, msg){
			fail(msg);
		});

		should.exist(symboltable.classmap);
		should.exist(symboltable.classmap['java.lang.CharSequence']);
		done();
	});

	it("shouldn't wipe the existing symbol table entry to add returnType of methods", function(done) {
		this.timeout(100000);
		var arch = 'android',
			options = {DEBUG:true,OBFUSCATE:false},
			symboltable = {},
			state = {
				metabase: {classes: {'java.lang.String': {}}},
				libfile: 'blah',
				symbols: {},
				obfuscate: false
			},
			symbols = {"java_lang_String_constructor":{"type":"constructor","metatype":"constructor","symbolname":"java_lang_String_constructor","class":"java.lang.String","location":{"file":"./app.js","comments_before":[],"nlb":false,"endpos":29,"pos":26,"col":10,"line":2,"value":"new","type":"operator"},"argcount":1},"java_lang_String_subSequence":{"type":"method","metatype":"instance","symbolname":"java_lang_String_subSequence","instance":"obj","class":"java.lang.String","name":"subSequence","location":{"file":"./app.js","comments_before":[],"nlb":false,"endpos":70,"pos":67,"col":10,"line":3,"value":"obj","type":"name"},"argcount":2,"method":{"exceptions":[],"args":[{"type":"int"},{"type":"int"}],"attributes":["public"],"instance":true,"returnType":"java.lang.String","signature":"(II)Ljava/lang/String;"},"returnType":"java.lang.String"}};
		typelib.metabase = state.metabase;
		library.generateCodeDependencies(options,state,symboltable,'example.js',arch,symbols,function(node, msg){
			fail(msg);
		});

		should.exist(symboltable.classmap);
		should.exist(symboltable.classmap['java.lang.String']);
		should.exist(symboltable.classmap['java.lang.String'].constructors);
		should.exist(symboltable.classmap['java.lang.String'].constructors["java_lang_String_constructor"]);
		done();
	});

	// TODO Add tests for methods whose return type is void (that we don't end up polluting the classmap?)
}); 