console.log("should be /a.js =>",__filename);

exports.foo = function() {
	return 1;
}


var b = require('./b');
console.log("b should be 2 =>",b.foo());

module.children.forEach(function(child, index){
	console.log("a.js child["+index+"] => ",module.id);
});