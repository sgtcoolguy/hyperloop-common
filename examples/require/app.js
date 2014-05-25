"use hyperloop"

console.log("should be /app.js =>",__filename);

var a = require('./a'),
	b = require('./b'),
	c = require('./a'),
	d = require('./a.js'),
	e = require('./b.js'),
	f = require('c'),
	j = require('./c'),
	k = require('d'),
	l = require('e'),
	m = require('f'),
	z = require('/a');

console.log("a should be 1 =>",a.foo());
console.log("b should be 2 =>",b.foo());
console.log("c should be 1 =>",c.foo());
console.log("d should be 1 =>",d.foo());
console.log("e should be 2 =>",e.foo());
console.log("f should be 3 =>",f.foo());
console.log("j should be world =>",j.hello);
console.log("k should be 4 =>",k.foo());
console.log("l should be 5 =>",l.foo());
console.log("m should be 1 =>",m.foo());
console.log("z should be 1 =>",z.foo());


try {
	var x = require('x');
	console.log("should have raised exception",x);
}
catch (E) {
	console.log("should be true =>",E.code==='MODULE_NOT_FOUND');
}

console.log("should be /app.js =>",__filename);


//TODO: this is not correct
console.log("app.js children =>",module.children && module.children.length);
module.children.forEach(function(child, index){
	console.log("app.js child["+index+"] => ",module.id);
});

console.log('TI_EXIT');