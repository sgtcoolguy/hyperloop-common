/**
 * specs for config.js
 */
var hyperloop = require('../'),
	util = hyperloop.util,
	appc = require('node-appc'),
	path = require('path'),
	fs = require('fs'),
	should = require('should'),
	config = hyperloop.config,
	homeFile = path.join(appc.fs.home(), '.hyperloop'),
	homeBackupFile = path.join(appc.fs.home(), '.hyperloop_backup'),
	currentFile = path.join(__dirname,'.hyperloop'),
	currentBackupFile = path.join(__dirname,'.hyperloop_backup'),
	cwdFile = path.join(process.cwd(),'.hyperloop'),
	cwdBackupFile = path.join(process.cwd(),'.hyperloop_backup'),
	pkgJSONFile = path.join(__dirname,'package.json'),
	pkgJSONBackupFile = path.join(__dirname,'package.json_backup');

describe("config", function(){

	before(function(){
		if (fs.existsSync(homeFile)){
			util.copyFileSync(homeFile,homeBackupFile);
		}
		if (fs.existsSync(currentFile)){
			util.copyFileSync(currentFile,currentBackupFile);
		}
		if (fs.existsSync(cwdFile)){
			util.copyFileSync(cwdFile,cwdBackupFile);
		}
		if (fs.existsSync(pkgJSONFile)){
			util.copyFileSync(pkgJSONFile,pkgJSONBackupFile);
		}
	});

	after(function(){
		if (fs.existsSync(homeBackupFile)){
			util.copyFileSync(homeBackupFile,homeFile);
		}
		if (fs.existsSync(currentBackupFile)){
			util.copyFileSync(currentBackupFile,currentFile);
		}
		if (fs.existsSync(cwdBackupFile)){
			util.copyFileSync(cwdBackupFile,cwdFile);
		}
		if (fs.existsSync(pkgJSONBackupFile)){
			util.copyFileSync(pkgJSONBackupFile,pkgJSONFile);
		}
	});

	afterEach (function(){
		fs.existsSync(homeFile) && fs.unlink(homeFile);
		fs.existsSync(currentFile) && fs.unlink(currentFile);
		fs.existsSync(cwdFile) && fs.unlink(cwdFile);
		fs.existsSync(pkgJSONFile) && fs.unlink(pkgJSONFile);
	});

	it("should load with defaults passed in", function(){
		config.load({a:1}).should.have.property('a',1);
	});

	it("should load with defaults from $HOME", function(){
		var homeFile = path.join(appc.fs.home(), '.hyperloop');
		fs.writeFileSync(homeFile,JSON.stringify({'a':1}),'utf8');
		config.load().should.have.property('a',1);
	});

	it("should be able to overwrite defaults from command line", function(){
		var homeFile = path.join(appc.fs.home(), '.hyperloop');
		fs.writeFileSync(homeFile,JSON.stringify({'a':1}),'utf8');
		config.load({a:2}).should.have.property('a',2);
	});

	it("should be able to overwrite defaults current working dir", function(){
		var homeFile = path.join(appc.fs.home(), '.hyperloop');
		fs.writeFileSync(homeFile,JSON.stringify({'a':1}),'utf8');
		fs.writeFileSync(cwdFile,JSON.stringify({'a':2}),'utf8');
		config.load().should.have.property('a',2);
	});

	it("should be able to overwrite defaults current project dir", function(){
		var homeFile = path.join(appc.fs.home(), '.hyperloop');
		fs.writeFileSync(homeFile,JSON.stringify({'a':1}),'utf8');
		fs.writeFileSync(cwdFile,JSON.stringify({'a':2}),'utf8');
		fs.writeFileSync(currentFile,JSON.stringify({'a':3}),'utf8');
		config.load(path.dirname(currentFile)).should.have.property('a',3);
	});

	it("should be able to overwrite files from command line", function(){
		var homeFile = path.join(appc.fs.home(), '.hyperloop');
		fs.writeFileSync(homeFile,JSON.stringify({'a':1}),'utf8');
		fs.writeFileSync(cwdFile,JSON.stringify({'a':2}),'utf8');
		fs.writeFileSync(currentFile,JSON.stringify({'a':3}),'utf8');
		config.load(path.dirname(currentFile),{a:4}).should.have.property('a',4);
	});

	it("should be able to overwrite files from package.json", function(){
		var homeFile = path.join(appc.fs.home(), '.hyperloop');
		fs.writeFileSync(homeFile,JSON.stringify({'a':1}),'utf8');
		fs.writeFileSync(cwdFile,JSON.stringify({'a':2}),'utf8');
		fs.writeFileSync(currentFile,JSON.stringify({'a':3}),'utf8');
		fs.writeFileSync(pkgJSONFile,JSON.stringify({'a':4}),'utf8');
		config.load(path.dirname(currentFile)).should.have.property('a',4);
	});

	it("should be able to load from command line even when in all files", function(){
		var homeFile = path.join(appc.fs.home(), '.hyperloop');
		fs.writeFileSync(homeFile,JSON.stringify({'a':1}),'utf8');
		fs.writeFileSync(cwdFile,JSON.stringify({'a':2}),'utf8');
		fs.writeFileSync(currentFile,JSON.stringify({'a':3}),'utf8');
		fs.writeFileSync(pkgJSONFile,JSON.stringify({'a':4}),'utf8');
		config.load(path.dirname(currentFile),{a:5}).should.have.property('a',5);
	});

});