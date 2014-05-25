"use hyperloop"

var vm = hyperloop$vm,
	global = hyperloop$global;

var sandbox = {
	global: global,
	module: {
		exports: {}
	},
	__filename: 'filename',
	__dirname: 'dirname',
	require: function() {}
};
global.foobar = 'yes';

function makeWrapper(content) {
	var fn = (function(){
		var require = this.require,
			__filename = this.__filename,
			__dirname = this.__dirname,
			module = this.module,
			exports = module.exports,
			global = this.global;
	}).toString().substring('function () {'.length).replace(/\}$/,'');

	fn+= ';' + content + '; if (exports!=module.exports){module.exports=exports} return module.exports;';r
	return fn;
}

console.log('script should be 1=>',vm.runInNewContext(makeWrapper('exports.a=1'),sandbox).a);
console.log('script should be 2=>',vm.runInNewContext('return 1 + 1'));
console.log('script should be filename=>',vm.runInNewContext(makeWrapper('exports.a=__filename'),sandbox).a);
console.log('script should be yes=>',vm.runInNewContext(makeWrapper('exports.a=global.foobar'),sandbox).a);
console.log('script should be Foo=>',vm.runInNewContext(makeWrapper('function Foo(){};Foo.prototype.toString=function(){return "Foo"};exports = (new Foo()).toString();'),sandbox));

if (global.foobar) {
	console.log("foobar should be yes=>",global.foobar);
}
else {
	console.log("should not have gotten here, something is wrong!");
}

for (var c=0;c<1;c++) {
	console.log("c should be 0=>",c);
}

(function(){
	console.log("executed anonymous function, good!");
})();

1 ? console.log("cool, worked") : console.log("not sure you should have gotten here");

1 && console.log("yes, worked");

while (1) {
	console.log("while worked");
	break;
}

var i = 0;
do {
	console.log("do...while worked");
	i++;
} while (i != 1)

for (var p in {a:1}) {
	console.log("for..in worked");
}

try {
	throw "try/catch worked";
	console.log("try/catch failed");
}
catch(E){
	console.log(E);
}

const CONSTV = 1;
const CONSTW = i;
console.log("const static should be 1=>",CONSTV);
console.log("const variable should be 1=>",CONSTW);
console.log('TI_EXIT');
