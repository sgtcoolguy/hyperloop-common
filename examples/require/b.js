

exports.foo = function() {
	return 2;
}

// FIXME: circular loading should be supported - right now this will crash
// var a = require('./a');
// console.log("a should be 1 =>",a.foo());
