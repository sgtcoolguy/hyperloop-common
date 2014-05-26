require('./ti-mocha.js');
var should = require('./should.js');

describe('ti-mocha', function() {
	it('test 1', function(){
		true.should.be.true;
		(1).should.equal(1);
		should(1).be.equal(1);
	});
	it.skip('test 2', function(){
		throw new Error("failed");
	});
});

mocha.run();
