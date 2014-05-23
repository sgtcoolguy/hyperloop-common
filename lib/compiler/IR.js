/**
 * hyperloop intermediate representation (IR)
 */
var Uglify = require('uglify-js'),
	log = require('../log'),
	jsgen = require('./jsgen');

module.exports = IR;

const API_VERSION = '1';

function IR() {
	// each of the nodes in our translation unit
	this.nodes = [];
	// all of the symbols that are exposed in JS that we have declared
	this.symboltable = {};
}

/**
 * optimization that will join adjacent code nodes together
 */
IR.prototype.coalesce = function() {
	var newnodes = [],
		prev;
	for (var c=0;c<this.nodes.length;c++) {
		var node = this.nodes[c];
		// we see the the previous node is code and this node is also 
		// code, so we coalesce the nodes together so we can have fewer evals
		if (prev && node.type==='code' && prev.type==='code') {
			var as = !/;$/.test(prev.code) ? ';' : '';
			prev.code += as + node.code;
		}
		else {
			newnodes.push(node);
			prev = node;
		}
	}
	this.nodes = newnodes;
}

/**
 * return a JSON representation of the IR
 */
IR.prototype.toJSON = function() {
	return {
		nodes: this.nodes,
		apiversion: API_VERSION // version of the IR spec
	};
}

/**
 * perform optimizations on the parse tree
 */
IR.prototype.optimize = function() {
	this.coalesce();
}

/**
 * parse the JS AST into IR 
 */
IR.prototype.parse = function(state,arch,filename,jsfilename,relativeFilename,source,ast) {
	this.filename = relativeFilename;
	var symbols = state.symbols;
	var self = this;
	for (var c=0;c<ast.body.length;c++) {
		var node = ast.body[c];
//		log.debug('IR=>',node.TYPE,node.print_to_string().magenta.bold);
		if (node instanceof Uglify.AST_EmptyStatement) {
			continue;
		}
		else if (node instanceof Uglify.AST_Var) {
			node.definitions.forEach(function(def){
				var name = def.name.name,
					expr = def.value && def.value.expression;
				if (expr) {
					var expr = parseExpression(self,def,expr,def.value.args,symbols);
					annotateExpr(self,expr,def);
					var assignment = self.addAssignment(name,expr);
					annotateExpr(self,assignment,def);
				}
				else {
					var value = def.value && def.value.value,
						is_static = !!value || def.value===null;

					if (!is_static && def.value) {
						value = def.value.name;
					}

					if (!is_static && !value) {
						//TODO: need to be able to support generation of variables that are a more complex
						//values (such as objects, functions, etc) but for now, we'll just turn it into code
						//and let the VM deal with it
						var expr = self.createJSExpression('var '+def.print_to_string())
						expr.line = def.start.line;
						annotateExpr(self,expr,def);
						self.addExpression(expr);
					}
					else {
						var expr = self.createVar(name, value, is_static);
						expr.line = def.start.line;
						annotateExpr(self,expr,def);
						self.addExpression(expr);
					}
				}
			});
		}
		else if (node instanceof Uglify.AST_SimpleStatement) {
			node.body.walk(new Uglify.TreeWalker(function(n){
				//log.info(n.TYPE,n.print_to_string().green)
				if (n instanceof Uglify.AST_SimpleStatement || n instanceof Uglify.AST_Call) {
					var expr = parseExpression(self,n,n.expression,n.args,symbols);
					annotateExpr(self,expr,n);
					self.addExpression(expr);
					return true; // don't descend
				}
				else if (n instanceof Uglify.AST_Assign) {
					// TODO: for now, we'll be a little lazy and use JS expression. we should 
					// improve this
					var name = n.left && n.left.name,
						expr = n.right && n.right.expression,
						op = n.operator,
						handled = false;

					//TODO: right now, only handle expressions that are equality, handle more...
					if (op === '=') {
						if (expr) {
							expr = parseExpression(self,n,expr,n.right.args,symbols);
							annotateExpr(self,expr,n);
							var assignment = self.addAssignment(name,expr);
							annotateExpr(self,assignment,n);
							handled = true;
						}
					}

					// escape hatch...
					if (!handled) {
						expr = self.createJSExpression(n.print_to_string())
						expr.line = n.start.line;
						annotateExpr(self,expr,n);
						self.addExpression(expr);
					}

					return true; // don't descend
				}
				else if (n instanceof Uglify.AST_Binary || n instanceof Uglify.AST_Conditional || n instanceof Uglify.AST_UnaryPrefix) {
					//TODO: ideally we would generate code branches here
					var expr = self.createJSExpression(n.print_to_string())
					expr.line = n.start.line;
					annotateExpr(self,expr,n);
					self.addExpression(expr);
					return true; // don't descend
				}
				else if (n instanceof Uglify.AST_Seq || n instanceof Uglify.AST_Dot || n instanceof Uglify.AST_SymbolRef || n instanceof Uglify.AST_Constant) {
					// dealt with above
				}
				else {
					log.fatal("NOT HANDLED BODY",n.TYPE,n.print_to_string().green)
				}
			}));
		}
		else if (node instanceof Uglify.AST_Defun || 
				 node instanceof Uglify.AST_For || 
				 node instanceof Uglify.AST_Do ||
				 node instanceof Uglify.AST_ForIn ||
				 node instanceof Uglify.AST_Try) {
			var expr = self.createJSExpression(node.print_to_string())
			expr.line = node.start.line;
			annotateExpr(self,expr,node);
			self.addExpression(expr);
		}
		else if (node instanceof Uglify.AST_Const) {
			//TODO: need to handle this better as a specific value
			node.definitions.forEach(function(def){
				var name = def.name.name,
					value = def.value && def.value.value,
					is_static = !!value;
				if (!value && def.value.name) {
					value = def.value.name;
				}	
				var expr = self.createConst(name,value,is_static);
				expr.line = def.start.line;
				annotateExpr(self,expr,def);
				self.addExpression(expr);
			});
		}
		else {
			log.fatal('NOT HANDLED=>',node.TYPE,node.print_to_string());
		}
	}

	//TODO: we need to do this in a pipeline
	this.optimize();
};

/**
 * turn the IR into native JSC code
 */
IR.prototype.toNative = function(indent) {
	var code = [];
	this.iterate(function(node){
		node.toNative(indent).split('\n').forEach(function(line){
			code.push(line);
		});
	});
	return code;
}

IR.prototype.iterate = function(iterator) {
	this.nodes.forEach(iterator);
	return this.nodes.length;
};

IR.prototype.map = function(iterator) {
	return this.nodes.map(iterator);
};

IR.prototype.filter = function(iterator) {
	return this.nodes.filter(iterator);
};

Object.defineProperty(IR.prototype, "count", {
	get: function count() {
		return this.nodes.length;
	}
});

Object.defineProperty(IR.prototype, "symbols", {
	get: function symbols() {
		return Object.keys(this.symboltable);
	}
});

function toType(value, type) {
	var t = type ? type : 
		value===null ? 'null' : 
		value===undefined ? 'undefined' : 
		typeof(value);
	return t;
}

IR.prototype.createNativeFunction = function(name,symbolname,arguments) {
	return new Expression(this,'native','function',name,symbolname,arguments);
};

IR.prototype.createJSExpression = function(code) {
	return new Code(this,code);
};

IR.prototype.createConst = function(name, value, is_static) {
	return new Variable(this,toType(value),name,value,true,is_static);
};

IR.prototype.createVar = function(name, value, is_static) {
	return new Variable(this,toType(value),name,value,false,is_static);
};

IR.prototype.createValueArgument = function(value, type) {
	return new Argument(this,'value',value,toType(value,type));
};

IR.prototype.createVariableArgument = function(value) {
	return new Argument(this,'variable',value,'variable');
};

IR.prototype.addAssignment = function(name,expression) {
	var assignment = new Assignment(this,name,expression)
	this.nodes.push(assignment);
	return assignment;
};

IR.prototype.addExpression = function(expression) {
	this.nodes.push(expression);
}

//---------------------------------------------------------------------------//

function makeVariableName() {
	return jsgen.makeVariableName();
}

function splitCodeIntoLines(code, str) {
	str.split('\n').forEach(function(line){
		code.push(line);
	});
}

function codeToString(code, indent) {
	if (typeof(indent)==='undefined' || !indent){
		return code.join('\n');
	}
	return code.map(function(line){
		return indent + line;
	}).join('\n');
}

function makeVarAssign(ir,varname) {
	if (varname && varname.charAt(0)==='&') {
		varname = varname.substring(1);
	}
	var defined = varname && ir.symboltable[varname] ? '' : 'auto',
		useAuto = defined && varname && varname.indexOf('[')===-1,
		varassign = (varname ? ((useAuto ? 'auto ':'')+varname) : '');

	if (useAuto) {
		ir.symboltable[varname]=1;
	}
	return varassign ? varassign + ' = ' : '';
}

function annotateExpr(self, expr, node) {
	expr.filename = self.filename;
	expr.line = (node && node.start && node.start.line) || 0;
}

function parseArgs (self,args,sym,symbols,node) {
	return args.map(function(arg){
		var expr;
		if (arg.value || typeof(arg.value)!='undefined') {
			expr = self.createValueArgument(arg.value);
		}
		else if (arg.name) {
			expr = self.createVariableArgument(arg.name);
		}
		else if (arg.expression) {
			if (arg.operator) {
				var v = eval(arg.operator+''+arg.expression.value);
				expr = self.createValueArgument(v);
			}
			else {
				expr = parseExpression(self,arg,arg.expression,arg.args,symbols);
			}
		}
		else if (arg.elements) {
			expr = self.createJSExpression(arg.print_to_string());
		}
		else {
			expr = self.createValueArgument(undefined);
		}
		annotateExpr(self,expr,node);
		return expr;
	});
}

function parseExpression(self,node,expr,args,symbols) {
	var result;
	if (expr && expr.name) {
		var fn = expr.name,
			sym = symbols[fn];
		if (sym) {
			var args = parseArgs(self,args,sym,symbols,node);
			result = self.createNativeFunction(fn,sym.symbolname,args);
		}
	}
	result = result || self.createJSExpression(node.print_to_string());
	annotateExpr(self,result,node);
	return result;
}

//---------------------------------------------------------------------------//

function Assignment (ir, name, expression) {
	this.ir = ir;
	this.name = name;
	this.expression = expression;
}

Assignment.prototype.toJSON = function() {
	return {
		nodetype: 'assignment',
		name: this.name,
		expression: this.expression
	};
}

Assignment.prototype.toNative = function(indent) {
	var code = [];
	code.push('// assignment '+this.name+':'+this.line);
	var v = makeVariableName();
	var e = this.expression.toNative(null,this.name);
	splitCodeIntoLines(code, e);
	code.push('auto '+v+' = JSStringCreateWithUTF8CString("'+this.name+'");');
	code.push('JSObjectSetProperty(ctx,object,'+v+','+this.name+',0,exception);');
	code.push('JSStringRelease('+v+');');
	code.push('CHECK_EXCEPTION(exception);');
	code.push('');
	return codeToString(code,indent);
}

function makeJSValue(value, type, varassign, code) {
	switch (type) {
		case 'number': {
			code.push(varassign+'JSValueMakeNumber(ctx,'+value+');');
			break;
		}
		case 'boolean': {
			code.push(varassign+'JSValueMakeBoolean(ctx,'+value+');');
			break;
		}
		case 'string': {
			var v = makeVariableName();
			code.push('auto '+v+' = JSStringCreateWithUTF8CString("'+value+'");');
			code.push(varassign+'JSValueMakeString(ctx,'+v+');');
			code.push('JSStringRelease('+v+');');
			break;
		}
		case 'undefined': {
			code.push(varassign+'JSValueMakeUndefined(ctx);');
			break;
		}
		case 'null': {
			code.push(varassign+'JSValueMakeNull(ctx);');
			break;
		}
	}
}

function Argument(ir, metatype, value, type) {
	this.ir = ir;
	this.type = type;
	this.metatype = metatype;
	this.value = value;
}

Argument.prototype.toJSON = function() {
	return {
		nodetype: 'argument',
		type: this.type,
		metatype: this.metatype,
		value: this.value
	};
}

Argument.prototype.isVariable = function() {
	return this.type === 'variable';
}

Argument.prototype.isValue = function() {
	return this.type === 'value';
}

Argument.prototype.toNative = function(indent, varname) {
	var code = [];
	var varassign = makeVarAssign(this.ir,varname);
	switch (this.metatype) {
		case 'value': {
			code.push('// static value');
			makeJSValue(this.value,this.type,varassign,code);
			break;
		}
		case 'variable': {
			code.push('// variable value');
			code.push(varassign+this.value+';');
			break;
		}
		default: {
			log.fatal(this);
		}
	}
	return codeToString(code, indent);
}

function Variable(ir, type, name, value, is_const, is_static) {
	this.ir = ir;
	this.type = 'variable';
	this.name = name;
	this.value = value;
	this.metatype = toType(value,type);
	this.is_const = is_const;
	this.is_static = is_static;
}

Variable.prototype.toJSON = function() {
	return {
		nodetype: 'variable',
		type: this.type,
		name: this.value,
		metatype: this.metatype,
		'const': this.is_const,
		'static': this.is_static
	};
}

Variable.prototype.toNative = function(indent) {
	var code = [];
	var v = makeVariableName(),
		p = this.is_const ? 'kJSPropertyAttributeDontDelete|kJSPropertyAttributeReadOnly' : '0';
	code.push('// variable:'+this.line+' '+(this.is_const?'(const)':''));
	if (this.is_static) {
		// value is set as static value
		makeJSValue(this.value,this.metatype,'auto '+this.name+' = ',code);
		code.push('auto '+v+' = JSStringCreateWithUTF8CString("'+this.name+'");');
		code.push('JSObjectSetProperty(ctx,object,'+v+','+this.name+','+p+',exception);');
	}
	else {
		// value is set from another variable value
		var s = makeVariableName();
		code.push('auto '+s+' = JSStringCreateWithUTF8CString("'+this.value+'");');
		code.push('auto '+this.name+' = JSObjectGetProperty(ctx,object,'+s+',exception);');
		code.push('auto '+v+' = JSStringCreateWithUTF8CString("'+this.name+'");');
		code.push('JSObjectSetProperty(ctx,object,'+v+','+this.name+','+p+',exception);');
		code.push('JSStringRelease('+v+');');
	}
	this.ir.symboltable[this.name]=1;
	code.push('CHECK_EXCEPTION(exception);');
	code.push('');
	return codeToString(code, indent);
}

function Expression(ir,type,metatype,name,symbolname,arguments) {
	this.ir = ir;
	this.type = type;
	this.metatype = metatype;
	this.name = name;
	this.symbolname = symbolname;
	this.arguments = arguments;
}

Expression.prototype.toJSON = function() {
	return {
		nodetype: 'expression',
		type: this.type,
		metatype: this.metatype,
		name: this.name,
		symbolname: this.symbolname,
		arguments: this.arguments
	};
}

Expression.prototype.toNative = function(indent, varname) {
	var code = [],
		argname = 'nullptr',
		argcount = (this.arguments||[]).length,
		varassign = makeVarAssign(this.ir,varname);

	code.push('// expression '+this.symbolname+':'+this.line);

	if (argcount) {
		argname = makeVariableName();
		code.push('JSValueRef '+argname+'['+argcount+'];');
	}

	this.arguments && this.arguments.forEach(function(arg,index){
		var argcode = arg.toNative(null,argname+'['+index+']');
		splitCodeIntoLines(code,argcode);
	});

	var v = this.name+'Fn';
	code.push(varassign+this.symbolname+'(ctx,'+v+','+v+','+argcount+','+argname+',exception);');
	code.push('CHECK_EXCEPTION(exception);');

	code.push('');
	return codeToString(code, indent);
}

function Code(ir, code) {
	this.ir = ir;
	this.type = 'code';
	this.code = code;
}

Code.prototype.toJSON = function() {
	return {
		nodetype: 'code',
		type: this.type,
		code: this.code
	};
}

Code.prototype.toNative = function(indent, varname) {
	var code = [];
	code.push('// sourcecode:'+this.line);

	//TODO: use the symbol table for sourcecode
	
	var varassign = makeVarAssign(this.ir,varname),
		v = makeVariableName(),
		f = makeVariableName(),
		src = this.code.replace(/"/g,'\\"'); //TODO: add jsgen encoding

	src = src.replace(/;,/g,';'); //FIXME: not sure why but some of the Java code produces invalid JS

	code.push('auto '+v+' = JSStringCreateWithUTF8CString("'+src+'");');
	code.push('auto '+f+' = JSStringCreateWithUTF8CString("'+this.filename+'");');
	code.push(varassign+'JSEvaluateScript(ctx,'+v+',object,'+f+','+this.line+',exception);')
	code.push('JSStringRelease('+v+');');
	code.push('JSStringRelease('+f+');');
	code.push('CHECK_EXCEPTION(exception);');

	code.push('');
	return codeToString(code, indent);
}
