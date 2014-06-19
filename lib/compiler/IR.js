/**
 * hyperloop intermediate representation (IR)
 */
var Uglify = require('uglify-js'),
	log = require('../log'),
	jsgen = require('./jsgen');

module.exports = IR;

const API_VERSION = '1';

function IR() {
	this.reset();
}

/*
 * Reset IR state
 */
IR.prototype.reset = function() {
	// each of the nodes in our translation unit
	this.nodes = [];
	// all of the symbols that are exposed in JS that we have declared
	this.symboltable = {};
};

/**
 * parse the JS AST into IR 
 */
IR.prototype.parse = function(state,arch,filename,jsfilename,relativeFilename,source,ast) {
	this.filename = relativeFilename;

	// --skip_ir options basically does nothing special and just returns whole code
	if (state.options.skip_ir) {
		this.addJSExpression(ast);
		this.optimize();
		return;
	}

	for (var c=0;c<ast.body.length;c++) {
		this.parseNode(state, ast.body[c]);
	}

	//TODO: we need to do this in a pipeline
	this.optimize();
};

IR.prototype.unindent = function(node) {
	if (this.isIgnoreNode(node)) return;
	this.indent_for_print--;
};

IR.prototype.indent = function(node) {
	if (this.isIgnoreNode(node)) return;
	this.indent_for_print = this.indent_for_print || 0;
	var space = '';
	for (var i = 0; i < this.indent_for_print; i++) {
		space += '  ';
	}
	this.indent_for_print++;
	return space;
};

IR.prototype.parseNode = function(state, node) {
	var self = this,
		handled = false;

	if (!this.isIgnoreNode(node)) {
		log.debug(this.indent(node)+'IR=>',node.TYPE,node.print_to_string().magenta);
	}

	if (node instanceof Uglify.AST_EmptyStatement) {
		handled = true;
	} else if (node instanceof Uglify.AST_Var) {
		node.definitions.forEach(function(n){
			return self.parseNode(state, n);
		});
	} else if (node instanceof Uglify.AST_VarDef) {
		var name = node.name.name;
		if (node.value && node.value.expression) {
			var expr = self.parseFunctionExpression(state, node);
			if (expr) {
				self.addAssignment(name,expr,node);
			} else {
				self.addJSExpression(node);
			}
		} else {
			var value = node.value && node.value.value,
				is_static = !!value || node.value===null;

			if (!is_static && node.value) {
				value = node.value.name;
			}

			if (!is_static && !value) {
				//TODO: need to be able to support generation of variables that are a more complex
				//values (such as objects, functions, etc) but for now, we'll just turn it into code
				//and let the VM deal with it
				self.addJSExpression(node);
			}
			else {
				self.addVar(name, value, is_static, node);
			}
		}
	} else if (node instanceof Uglify.AST_Call) {
		var expr = self.parseFunctionExpression(state, node);
		if (expr) {
			self.addAssignment(name,expr,node);
		} else {
			self.addJSExpression(node);
		}
		handled = true; // don't descend
	} else if (node instanceof Uglify.AST_Assign) {
		// TODO: for now, we'll be a little lazy and use JS expression. we should 
		// improve this
		var name = node.left && node.left.name,
			expr = undefined;
		//TODO: right now, only handle expressions that are equality, handle more...
		if (node.right && node.operator === '=') {
			expr = self.parseFunctionExpression(state, node.right);
			self.addAssignment(name,expr,node);
		}

		if (!expr) {
			self.addJSExpression(node);
		}

		handled = true; // don't descend

	} else if (node instanceof Uglify.AST_SimpleStatement) {
		node.body.walk(new Uglify.TreeWalker(function(n){
			return self.parseNode(state, n);
		}));
		handled = true; // don't descend
	} else if (node instanceof Uglify.AST_Defun || node instanceof Uglify.AST_For || node instanceof Uglify.AST_Do || node instanceof Uglify.AST_ForIn || node instanceof Uglify.AST_Try) {
		self.addJSExpression(node);
	} else if (node instanceof Uglify.AST_Const) {
		node.definitions.forEach(function(n){
			self.parseNode(state, n);
		});
	} else if (node instanceof Uglify.AST_Binary || node instanceof Uglify.AST_Conditional || node instanceof Uglify.AST_UnaryPrefix || node instanceof Uglify.AST_Array) {
		//TODO: ideally we would generate code branches here
		self.addJSExpression(node);
		handled = true; // don't descend
	} else if (this.isIgnoreNode(node)) {
		// dealt with above
	} else {
		//self.addJSExpression(node);
		throw new Error('NOT HANDLED=>'+node.TYPE+' => '+node.print_to_string());
	}

	this.unindent(node);

	return handled;
};

IR.prototype.parseFunctionExpression = function(state, node) {
	var expr = node.expression || (node.value && node.value.expression);
	if (expr) {
			var args = node.args || (node.value && node.value.args),
			sym = state.symbols[expr.name];
		if (args && sym) {
			args = this.parseArgs(state,args,node);
			if (args) {
				expr = new Expression(this,'native','function',expr.name,sym.symbolname,args);
				annotateExpr(this,expr,node);
				return expr;
			}
		}
	}
	return undefined;
};

IR.prototype.parseArgs = function(state,args,node) {
	var self = this,
		fail = false;
	var map = args.map(function(arg){
		var expr;
		if (arg.value || typeof(arg.value)!='undefined') {
			expr = self.createValueArgument(arg.value);
		} else if (arg.name) {
			expr = self.createVariableArgument(arg.name);
		} else if (arg.expression) {
			if (arg.operator) {
				var v = eval(arg.operator+''+arg.expression.value);
				expr = self.createValueArgument(v);
			}
			else {
				expr = self.parseFunctionExpression(state,arg);
			}
		}

		if (expr) {
			annotateExpr(self,expr,node);
		} else {
			fail = true;
		}

		return expr;
	});

	// if anything wrong, return undefined
	if (fail) {
		return undefined;
	} else {
		return map;
	}
};

IR.prototype.isIgnoreNode = function(node) {
	return (node instanceof Uglify.AST_Seq || node instanceof Uglify.AST_Dot || node instanceof Uglify.AST_SymbolRef || node instanceof Uglify.AST_Constant);
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
};

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
};

/**
 * return a JSON representation of the IR
 */
IR.prototype.toJSON = function() {
	return {
		nodes: this.nodes,
		apiversion: API_VERSION // version of the IR spec
	};
};

/**
 * perform optimizations on the parse tree
 */
IR.prototype.optimize = function() {
	this.coalesce();
};

IR.prototype.createValueArgument = function(value, type) {
	return new Argument(this,'value',value,toType(value,type));
};

IR.prototype.createVariableArgument = function(value) {
	return new Argument(this,'variable',value,'variable');
};

IR.prototype.addAssignment = function(name,expression,node) {
	if (expression) {
		var assignment = new Assignment(this,name,expression);
		this.pushToNode(assignment, node);
	}
};

IR.prototype.addVar = function(name, value, is_static, node) {
	var expr = new Variable(this,toType(value),name,value,false,is_static);
	this.pushToNode(expr, node);
};

IR.prototype.addConst = function(name, value, is_static, node) {
	var expr = new Variable(this,toType(value),name,value,true,is_static);
	this.pushToNode(expr, node);
};

IR.prototype.addJSExpression = function(node) {
	var code = node.print_to_string();
	var expr = new Code(this, code, node);
	this.pushToNode(expr, node);
};

IR.prototype.pushToNode  =function(expr, node) {
	expr.line = getLineFromNode(node);
	annotateExpr(this,expr,node);
	this.nodes.push(expr);
};

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
};

Assignment.prototype.toNative = function(indent) {
	var code = [];
	var v = makeVariableName();
	var e = this.expression.toNative(null,this.name);
	splitCodeIntoLines(code, e);
	if (this.name) {
		code.push('// assignment '+this.name+':'+this.line);
		code.push('auto '+v+' = JSStringCreateWithUTF8CString("'+this.name+'");');
		code.push('JSObjectSetProperty(ctx,object,'+v+','+this.name+',0,exception);');
		code.push('JSStringRelease('+v+');');
		code.push('CHECK_EXCEPTION(exception);');
		code.push('');
	}
	return codeToString(code,indent);
};

//---------------------------------------------------------------------------//

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
};

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
};

//---------------------------------------------------------------------------//

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
};

Argument.prototype.isVariable = function() {
	return this.type === 'variable';
};

Argument.prototype.isValue = function() {
	return this.type === 'value';
};

Argument.prototype.toNative = function(indent, varname) {
	var code = [];
	var varassign = makeVarAssign(this.ir,varname);
	switch (this.metatype) {
		case 'value': {
			makeJSValue(this.value,this.type,varassign,code);
			break;
		}
		case 'variable': {
			code.push(varassign+this.value+'; // variable');
			break;
		}
		default: {
			throw new Error("don't know how to handle metatype: "+this.metatype);
		}
	}
	return codeToString(code, indent);
};

//---------------------------------------------------------------------------//

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
};

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
};

//---------------------------------------------------------------------------//

function Code(ir, code, node) {
	this.ir = ir;
	this.type = 'code';
	this.code = code;

	if (node) {
		annotateExpr(ir, this, node);
	}
}

Code.prototype.toJSON = function() {
	return {
		nodetype: 'code',
		type: this.type,
		code: this.code
	};
};

function bufferToCIntArray(data) {
	var indent = '    ',
		position = 0,
		split = 30,
		length = data.length,
		output = [];
	for (var i=0;i<length;++i,++position) {
		if ((position % split) === 0) {
			output.push("\n"+indent);
		}
		if (position > 0) {
			output.push(",");
		}
		output.push(data.readInt8(i));
	}
	output.push(",0"); // NULL termination
	return output.join('').trim();
}

Code.prototype.toNative = function(indent, varname) {
	var code = [];
	code.push('// sourcecode:'+this.line);

	//TODO: use the symbol table for sourcecode
	
	var varassign = makeVarAssign(this.ir,varname),
		s = makeVariableName(),
		v = makeVariableName(),
		f = makeVariableName(),
		src = this.code.replace(/;,/g,';'); //FIXME: not sure why but some of the Java code produces invalid JS

	// preserver original source code
	code.push('// '+JSON.stringify(src));

	var buffer = bufferToCIntArray(new Buffer(src, 'utf8'));
	code.push('const char '+s+'[] = { '+buffer+' };');
	code.push('auto '+v+' = JSStringCreateWithUTF8CString('+s+');');
	code.push('auto '+f+' = JSStringCreateWithUTF8CString("'+this.filename+'");');
	code.push(varassign+'JSEvaluateScript(ctx,'+v+',object,'+f+','+this.line+',exception);');
	code.push('JSStringRelease('+v+');');
	code.push('JSStringRelease('+f+');');
	code.push('CHECK_EXCEPTION(exception);');

	code.push('');
	return codeToString(code, indent);
};

//---------------------------------------------------------------------------//
function getLineFromNode(node) {
	return (node && node.start && node.start.line) || 0;
}

function annotateExpr(self, expr, node) {
	expr.filename = self.filename;
	expr.line = expr.line || getLineFromNode(node);
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
			var s = makeVariableName();
			var buffer = bufferToCIntArray(new Buffer(value));
			code.push('// '+JSON.stringify(value));
			code.push('const char '+s+'[] = { '+buffer+' };');
			code.push('auto '+v+' = JSStringCreateWithUTF8CString('+s+');');
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

function toType(value, type) {
	var t = type ? type : 
		value===null ? 'null' : 
		value===undefined ? 'undefined' : 
		typeof(value);
	return t;
}
