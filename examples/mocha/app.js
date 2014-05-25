var m = require('./ti-mocha.js');

describe('ti-mocha', function() {
	it('test 1', function(){});
	it.skip('test 2', function(){
		throw new Error("failed");
	});
});

mocha.run();
