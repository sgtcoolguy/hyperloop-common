/**
 * base64 specs
 */

var should = require('should'),
	wrench = require('wrench'),
	path = require('path'),
	fs = require('fs'),
	exec = require('child_process').exec,
	clang = require('../../').compiler.clang,
	log = require('../../').log;

describe("base64", function(){


	it("should be able to compile and test base64", function(done){
		clang.should.not.be.null;

		var build_dir = path.join(__dirname,'../../','build'),
			config = {
				srcfiles: [],
				outdir: build_dir,
				cflags: [ '-I"'+path.join(__dirname,'../../templates')+'"', '-DHL_TEST' ]
			},
			main = [
				'#include <base64.h>',
				'#include <string>',
				'#include <iostream>',
				'int main(int argc, char **argv){',
				'\tstd::string str(argv[1]);',
				'\tstd::cout << base64_decode(str) << std::endl;',
				'\treturn 0;',
				'}'
			],
			mainFile = path.join(build_dir,'main.cpp');

		if (!fs.existsSync(build_dir)) {
			wrench.mkdirSyncRecursive(build_dir);
		}

		fs.writeFileSync(mainFile, main.join('\n'), 'utf8');

		config.srcfiles.push({
			srcfile: path.join(__dirname,'../../templates/base64.cpp'),
			objfile: path.join(build_dir,'base64.o')
		});

		config.srcfiles.push({
			srcfile: mainFile,
			objfile: mainFile.replace(/\.cpp$/,'.o')
		});


		clang.compile(config, function(err, results) {
			if (err) { return done(err); }
			results.length.should.be.equal(2);

			var exe = path.join(build_dir, 'base64'),
				cmd = 'clang '+results.join(' ')+' -o "'+exe+'" -lstdc++';

			exec(cmd, function(err,stdout,stderr){
				if (err) { return done (err); }

				exec(exe+' aHlwZXJsb29w', function(err, stdout, stderr) {
					if (err) { return done(err); }

					stdout.trim().should.be.equal('hyperloop'); // aHlwZXJsb29w == hyperloop

					done();
				});
			});
		});

	});
});
