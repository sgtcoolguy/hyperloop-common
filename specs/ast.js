/**
 * compiler specs
 */

var should = require('should'),
	log = require('../').log,
	ast = require('../').compiler.ast;

describe("ast", function(){
	it("should load private APIs for testing", function(){
		should(ast.testing.compileCommand).should.be.ok;
	});

	it("should not transform calls to query methods when property exists", function(){
		should(ast.compile).should.be.ok;
		var source = "\'use hyperloop\'; CLLocationManager.locationServicesEnabled()",
			options = {},
			state = {
				metabase: {protocols: {}, types:{}, symbols:{}, classes: {'CLLocationManager': {
					'methods': {
						"locationServicesEnabled": [
				          {
				            "name": "locationServicesEnabled",
				            "metatype": "method",
				            "instance": false,
				            "selector": "locationServicesEnabled",
				            "returnType": "signed char",
				            "returnSubtype": "BOOL",
				            "requiresSentinel": false,
				            "args": [],
				            "hasVarArgs": false,
				            "availability": {
				              "platform": "ios",
				              "introduced": "4.0",
				              "deprecated": "0",
				              "obseleted": "0",
				              "message": ""
				            }
				          }]
				},
				'properties': {
					"locationServicesEnabled": {
			          "name": "locationServicesEnabled",
			          "type": "signed char",
			          "subtype": "BOOL",
			          "attributes": [
			            "readonly",
			            "nonatomic"
			          ],
			          "metatype": "property",
			          "header": "CoreLocation/CLLocationManager.h",
			          "availability": {
			            "platform": "ios",
			            "introduced": "2.0",
			            "deprecated": "4.0",
			            "obseleted": "0",
			            "message": ""
			          }
			        }
				}}}},
				libfile: 'blah',
				symbols: {},
				obfuscate: false
			},
			library = require('../../hyperloop-ios/lib/compiler'),
			build_opts = {DEBUG:true,platform:'ios',OBFUSCATE:false,DUMP_AST:true};

		var result = ast.compile(options, state, library, 'i386', source, 'filename', 'jsfilename.js', build_opts);
		result.print_to_string().should.eql("CLLocationManager_locationServicesEnabled();");
	});
});