/**
 * Copyright (c) 2014 by Appcelerator, Inc. All Rights Reserved.
 * Licensed under the terms of the Apache Public License
 * Please see the LICENSE included with this distribution for details.
 *
 * This code and related technologies are covered by patents
 * or patents pending by Appcelerator, Inc.
 */
#include <hyperloop.h>
#include <list>
#include <vector>
#include <set>
#include <algorithm>

#ifndef REQUIRE_DEBUG
#define REQUIRE_DEBUG 0
#endif

static bool HyperloopLoadEmbedSourceExists (const char *filepath);
static JSValueRef HyperloopLoadEmbedSource(JSGlobalContextRef ctx, const JSObjectRef &object, const char *path, JSValueRef *exception);

namespace Appcelerator
{
    class Module
    {
    public:
        Module(const JSGlobalContextRef &ctx, const JSObjectRef &object, const std::string & filename, const std::string & dirname, const JSObjectRef & parent, const JSObjectRef & exports);
        ~Module();

        const std::string& getId() const { return filename; }
        const std::string& getDirname() const { return dirname; }
        const std::string& getFilename() const { return filename; }
        JSObjectRef getObject() const { return object; }
        JSObjectRef getParent() const { return parent; }
        JSObjectRef getChildren() const { return children; }
        JSObjectRef getExports() const { return exports; }
        void setExports(JSObjectRef newExports) 
        { 
            JSValueUnprotect(ctx, exports); 
            exports = newExports;
            JSValueProtect(ctx,exports);
        }
        void setLoaded() { loaded = true; }
        bool isLoaded() { return loaded; }
        void addChild(const JSObjectRef & child);

    private:
        std::string filename;
        std::string dirname;
        JSGlobalContextRef ctx;
        JSObjectRef object;
        JSObjectRef parent;
        JSObjectRef exports;
        JSObjectRef children;
        bool loaded;
    };
}

static Appcelerator::Module * JSObjectRefToModule(const JSContextRef & ctx, const JSObjectRef & object, JSValueRef *exception, bool force=true)
{
    if (object==nullptr)
    {
        return nullptr;
    }
    auto module = static_cast<Appcelerator::Module*>(JSObjectGetPrivate(object));
    if (module==nullptr && ctx!=nullptr && force)
    {
        auto p = JSStringCreateWithUTF8CString("module");
        auto v = JSObjectGetProperty(ctx,object,p,exception);
        if (v!=nullptr && JSValueIsObject(ctx,v))
        {
            auto o = JSValueToObject(ctx,v,exception);
            module = JSObjectRefToModule(ctx,o,exception);
        }
        JSStringRelease(p);
    }
    return module;
}

Appcelerator::Module::Module(const JSGlobalContextRef & ctx, const JSObjectRef & object, const std::string & filename, const std::string & dirname, const JSObjectRef & parent, const JSObjectRef & exports) : object{object},filename{filename},dirname{dirname},ctx{ctx},parent{parent},loaded{false},exports{exports},children{nullptr}
{
    JSGlobalContextRetain(ctx);
    JSValueProtect(ctx,object);
    if (parent!=nullptr)
    {
        JSValueProtect(ctx,parent);
    }
    JSValueProtect(ctx,exports);
}

Appcelerator::Module::~Module()
{
    if (parent!=nullptr)
    {
        JSValueUnprotect(ctx,parent);
    }
    if (children!=nullptr)
    {
        JSValueUnprotect(ctx,children);
    }
    JSValueUnprotect(ctx,exports);
    JSValueUnprotect(ctx,object);
    JSGlobalContextRelease(ctx);
}

/**
 * called to add a child to this module
 */
void Appcelerator::Module::addChild(const JSObjectRef & child)
{
    const JSValueRef elements[] = { child };
    if (children==nullptr)
    {
        children = JSObjectMakeArray(ctx,1,elements,0);
        JSValueProtect(ctx,children);
    }
    else 
    {
        auto prop = JSStringCreateWithUTF8CString("push");
        auto value = JSObjectGetProperty(ctx,children,prop,0);
        auto object = JSValueToObject(ctx,value,0);
        JSObjectCallAsFunction(ctx,nullptr,children,1,elements,0);
        JSStringRelease(prop);
    }
}

/**
 * called when object is destroyed
 */
static void ModuleFinalizer(JSObjectRef object)
{
    auto module = JSObjectRefToModule(nullptr,object,nullptr);
    if (module!=nullptr)
    {
        delete module;
    }
}

std::vector<std::string> pathSplit(const std::string & path)
{
	std::vector<std::string> parts;
	size_t pos = 0;
	size_t len = path.length();
    
	while (pos <= len)
	{
		size_t idx = path.find("/",pos);
		if (idx == std::string::npos)
		{
			parts.push_back(path.substr(pos));
			break;
		}
		else
		{
            if (idx > 0)
            {
                parts.push_back(path.substr(pos,idx-pos));
            }
			pos = idx + 1;
		}
	}
    
    return parts;
}

std::string pathJoin(std::vector<std::string> newparts)
{
    std::string newpath = "/";

    for (std::vector<std::string>::iterator i = newparts.begin(); i!=newparts.end(); i++)
    {
        newpath+=*i;
        #if REQUIRE_DEBUG == 1
        	NSLog(@"pathJoin=%s",newpath.c_str());
        #endif
        i++;
        if (i!=newparts.end())
        {
            newpath+="/";
        }
        i--;
    }
    return newpath;
}

static std::string pathResolve(const std::string & path, std::string dir = "/")
{
    dir = dir.length()==1 || dir.rfind("/")==dir.length() ? dir : dir + "/";
    bool resolvedAbsolute = path.find("/")==0;
    
	std::vector<std::string> parts = pathSplit(path);
    
	size_t up = 0;
    bool allowAboveRoot = !resolvedAbsolute;
	std::vector<std::string> newparts;
	for (std::vector<std::string>::reverse_iterator rit=parts.rbegin(); rit!=parts.rend(); rit++)
	{
		std::string last = *rit;
		if (last == ".")
		{
			// skip
		}
		else if (last == "..")
		{
			// skip
			up++;
		}
		else if (up)
		{
			// skip
			up--;
		}
		else
		{
            std::vector<std::string>::iterator it = newparts.begin();
			newparts.insert(it, last);
		}
	}
    
    if (allowAboveRoot)
    {
        for (; up--;)
        {
            std::vector<std::string>::iterator it = newparts.begin();
            newparts.insert(it, "..");
        }
    }
    
    std::string newpath = pathJoin(newparts);

	return resolvedAbsolute ? newpath : dir + newpath;
}

std::vector<std::string> slice(const std::vector<std::string> & list, const size_t & begin, const size_t & end=std::string::npos)
{
    std::vector<std::string> newlist;
    for (size_t i=begin; i<end; i++)
    {
        newlist.push_back(list[i]);
    }
    return newlist;
}

std::vector<std::string> getRequirePaths(const std::string & dirname)
{
    std::vector<std::string> paths;
    
    if (dirname == "/")
    {
        paths.push_back("/node_modules");
    }
    else
    {
        auto parts = pathSplit(dirname);
#if REQUIRE_DEBUG == 1
    	NSLog(@"getRequirePaths::dirname=%s, size=%d",dirname.c_str(), (int)parts.size());
    	NSLog(@"getRequirePaths::parts=%s",pathJoin(parts).c_str());
#endif
        for (size_t i = 0, len = parts.size(); i < len; i++)
        {
            auto p = slice(parts, 0, len-i);
            auto path = pathJoin(p) + "/node_modules";
#if REQUIRE_DEBUG == 1
    		NSLog(@"getRequirePaths::p=%s, %d",pathJoin(p).c_str(), (int)len-i);
    		NSLog(@"getRequirePaths::path=%s",path.c_str());
#endif
            std::vector<std::string>::iterator it = paths.begin();
            paths.insert(it, path);
        }
    }
    return paths;
}

bool fileExists(const std::string & path)
{
    return HyperloopLoadEmbedSourceExists(path.c_str());
}

std::string loadAsFile(const JSObjectRef & parent, const std::string & path)
{
    std::list<std::string> checks;
    checks.push_back(path);
    checks.push_back(path+".js");
    checks.push_back(path+".json");
    
    for (std::list<std::string>::iterator i = checks.begin(); i!=checks.end(); i++)
    {
        auto check = *i;
        if (fileExists(check))
        {
        	return check;
        }
    }
    return std::string();
}

std::string loadAsDirectory(const JSObjectRef & parent, const std::string & path)
{
	auto packageJSONFile = path + "/package.json";
#if REQUIRE_DEBUG == 1
	NSLog(@"loadAsDirectory::path=%s, packageJSONFile=%s",path.c_str(),packageJSONFile.c_str());
#endif
	if (fileExists(packageJSONFile))
	{
		JSGlobalContextRef ctx = HyperloopGlobalContext();
    	JSValueRef result = HyperloopLoadEmbedSource(ctx,parent,packageJSONFile.c_str(),0);
    	if (result!=nullptr && JSValueIsObject(ctx,result))
    	{
    		JSStringRef prop = JSStringCreateWithUTF8CString("main");
    		JSObjectRef json = JSValueToObject(ctx,result,0);
    		if (json!=nullptr) 
    		{
	    		JSValueRef mainValue = JSObjectGetProperty(ctx,json,prop,0);
	    		if (JSValueIsString(ctx,mainValue)) 
	    		{
	    			std::string fp(HyperloopJSValueToStringCopy(ctx,mainValue,0));
		    		JSStringRelease(prop);
	    			return pathResolve(path+"/"+fp);
	    		}
    		}
    		JSStringRelease(prop);
    	}
	}

	auto indexFile = path + "/index.js";
#if REQUIRE_DEBUG == 1
	NSLog(@"loadAsDirectory::path=%s, indexFile=%s",path.c_str(),indexFile.c_str());
#endif
	if (fileExists(indexFile))
	{
		return indexFile;
	}

    return std::string();
}

std::string loadAsModule (const JSObjectRef & parent, std::string resolvedPath, std::string dirname)
{
#if REQUIRE_DEBUG == 1
    NSLog(@"loadAsModule resolvedPath=%s,dirname=%s",resolvedPath.c_str(),dirname.c_str());
#endif
    auto reqPaths = getRequirePaths(dirname);
    std::string modulePath;
    if (resolvedPath.find("/")!=0)
    {
    	resolvedPath = "/" + resolvedPath;
    }
    for (size_t i=0, len=reqPaths.size(); i<len; i++)
    {
        auto newResolvedPath = reqPaths[i] + resolvedPath;
#if REQUIRE_DEBUG == 1
        NSLog(@"loadAsModule::[%d] newResolvedPath=%s",(int)i,newResolvedPath.c_str());
#endif
        modulePath = loadAsFile(parent,newResolvedPath);
        if (!modulePath.empty())
        {
            break;
        }
        modulePath = loadAsDirectory(parent,newResolvedPath);
        if (!modulePath.empty())
        {
            break;
        }
    }
    return modulePath;
}

std::string requestResolve(const JSObjectRef & parent, std::string p, std::string dirname = "/")
{
    auto isNodeModule = false;
    std::string rawPath;
    
    if (p.find("/")==0)
    {
        rawPath = p;
    }
    else if (p.find("../")==0 || p.find("./")==0)
    {
        rawPath = dirname + (dirname=="/" ? "" : "/") + p;
    }
    else
    {
        isNodeModule = true;
        rawPath = p;
    }
    
    auto resolvedPath = pathResolve(rawPath,dirname);
    std::string modulePath;

#if REQUIRE_DEBUG == 1
    NSLog(@"requestResolve::rawPath=%s,resolvedPath=%s,dirname=%s,isNodeModule=%d",rawPath.c_str(),resolvedPath.c_str(),dirname.c_str(),(int)isNodeModule);
#endif

    if (isNodeModule)
    {
    	modulePath = loadAsModule(parent,resolvedPath,dirname);
    	if (modulePath.empty()) 
    	{
	    	modulePath = loadAsModule(parent,p,dirname);
    	}
    }
    else
    {
        // load as file or load as directory
        modulePath = loadAsFile(parent,resolvedPath);
        if (modulePath.empty())
        {
            modulePath = loadAsDirectory(parent,resolvedPath);
        }
    }
    
    return modulePath;
}

#ifndef USE_TIJSCORE
EXPORTAPI void HyperloopInitialize_Source();
#endif
/**
 * called to load the main app
 */
EXPORTAPI JSValueRef HyperloopAppRequire(JSValueRef *exception)
{
#ifdef USE_TIJSCORE
    auto resolvedPath = requestResolve(nullptr,"/app.js");
    return HyperloopLoadEmbedSource(InitializeHyperloop(HyperloopGlobalContext()),nullptr,resolvedPath.c_str(),exception);
#else
    HyperloopInitialize_Source();
    auto resolvedPath = requestResolve(nullptr,"/app.js");
    return HyperloopLoadEmbedSource(InitializeHyperloop(),nullptr,resolvedPath.c_str(),exception);
#endif
}

#ifdef USE_TIJSCORE
/**
 * called to load the main app for a specific module with moduleid
 */
EXPORTAPI JSValueRef HyperloopModuleRequire(JSGlobalContextRef ctx, JSValueRef *exception, const char *moduleid)
{
    auto path = std::string("/");
    path+=moduleid;
    path+="/app.js";
    auto resolvedPath = requestResolve(nullptr,path.c_str());
    return HyperloopLoadEmbedSource(ctx,nullptr,resolvedPath.c_str(),exception);
}
#endif

/**
 * implement the require which is relative to this module
 */
static JSValueRef ModuleRequire(JSContextRef ctx, JSObjectRef function, JSObjectRef object, size_t argumentCount, const JSValueRef arguments[], JSValueRef* exception)
{
    if (argumentCount == 0)
    {
#if REQUIRE_DEBUG == 1
    NSLog(@"ModuleRequire - no arguments passed in require");
#endif
        *exception = HyperloopMakeException(ctx,"invalid module path passed to require");
        return JSValueMakeUndefined(ctx);
    }
    auto module = JSObjectRefToModule(ctx,object,exception);
    if (module==nullptr)
    {
#if REQUIRE_DEBUG == 1
    NSLog(@"ModuleRequire - JSObjectRefToModule return null, trying in scope");
#endif
    }
    std::string resolvedPath = "";
    JSObjectRef parent = nullptr;
    if (module!=nullptr) 
    {
        auto path = std::string(HyperloopJSValueToStringCopy(ctx,arguments[0],exception));
        auto dirname = module->getDirname();
        parent = module->getObject();
        if (dirname==".")
        {
            dirname="/";
        }
#if REQUIRE_DEBUG == 1
    NSLog(@"ModuleRequire path=%s, dirname=%s",path.c_str(),dirname.c_str());
#endif
        resolvedPath = requestResolve(parent,path,dirname);
        if (resolvedPath.empty())
        {
            // we pass along so that we can get the right error thrown but 
            // since resolvedPath is empty, we want to pass the original path
            // request so that the error message is correct
            resolvedPath = path;
        }
#if REQUIRE_DEBUG == 1
    NSLog(@"ModuleRequire::resolvedPath=%s, path=%s, dirname=%s",resolvedPath.c_str(),path.c_str(),dirname.c_str());
#endif
    }
    else 
    {
        *exception = HyperloopMakeException(ctx,"invalid module in require (this is usually a bind problem)");
        return JSValueMakeUndefined(ctx);
    }
    // NSLog(@"ModuleRequire PARENT %p => %s",parent,resolvedPath.c_str());
    return HyperloopLoadEmbedSource(HyperloopGlobalContext(),parent,resolvedPath.c_str(),exception);
}

/**
 * return the modules id property
 */
JSValueRef ModuleId (JSContextRef ctx, JSObjectRef object, JSStringRef propertyName, JSValueRef* exception)
{
    auto module = JSObjectRefToModule(ctx,object,exception);
    return HyperloopMakeString(ctx,module->getId().c_str(),exception);
}

/**
 * return the modules filename property
 */
JSValueRef ModuleFilename (JSContextRef ctx, JSObjectRef object, JSStringRef propertyName, JSValueRef* exception)
{
    auto module = JSObjectRefToModule(ctx,object,exception);
    return HyperloopMakeString(ctx,module->getFilename().c_str(),exception);
}

/**
 * return the modules parent property
 */
JSValueRef ModuleParent (JSContextRef ctx, JSObjectRef object, JSStringRef propertyName, JSValueRef* exception)
{
    auto module = JSObjectRefToModule(ctx,object,exception);
    auto parent = module->getParent();
    if (parent!=nullptr)
    {   
        return parent;
    }
    return JSValueMakeUndefined(ctx);
}

/**
 * return the modules loaded property
 */
JSValueRef ModuleLoaded (JSContextRef ctx, JSObjectRef object, JSStringRef propertyName, JSValueRef* exception)
{
    auto module = JSObjectRefToModule(ctx,object,exception);
    return JSValueMakeBoolean(ctx, module->isLoaded());
}

/**
 * return the modules dirname property
 */
JSValueRef ModuleDirname (JSContextRef ctx, JSObjectRef object, JSStringRef propertyName, JSValueRef* exception)
{
    auto module = JSObjectRefToModule(ctx,object,exception);
    return HyperloopMakeString(ctx,module->getDirname().c_str(),exception);
}

/**
 * return the modules exports property
 */
JSValueRef ModuleExportsGet (JSContextRef ctx, JSObjectRef object, JSStringRef propertyName, JSValueRef* exception)
{
    auto module = JSObjectRefToModule(ctx,object,exception);
    return module->getExports();
}

/**
 * set the modules exports property
 */
bool ModuleExportsSet (JSContextRef ctx, JSObjectRef object, JSStringRef propertyName, JSValueRef value, JSValueRef* exception)
{
    auto module = JSObjectRefToModule(ctx,object,exception);
    module->setExports(JSValueToObject(ctx,value,exception));
    return true;
}

/**
 * return the modules children property
 */
JSValueRef ModuleChildren (JSContextRef ctx, JSObjectRef object, JSStringRef propertyName, JSValueRef* exception)
{
    auto module = JSObjectRefToModule(ctx,object,exception);
    return module->getChildren();
}

/**
 * return the modules global property
 */
JSValueRef ModuleGlobal (JSContextRef ctx, JSObjectRef object, JSStringRef propertyName, JSValueRef* exception)
{
    auto globalCtx = HyperloopGlobalContext();
    return JSContextGetGlobalObject(globalCtx);
}

static JSStaticFunction StaticModuleFunctions[] = {
    { "require", ModuleRequire, kJSPropertyAttributeReadOnly | kJSPropertyAttributeDontEnum | kJSPropertyAttributeDontDelete },
    { 0, 0, 0 }
};

static JSStaticValue StaticModuleProperties [] = {
    { "id", ModuleId, 0, kJSPropertyAttributeReadOnly|kJSPropertyAttributeDontEnum},
    { "exports", ModuleExportsGet, ModuleExportsSet, kJSPropertyAttributeDontEnum},
    { "filename", ModuleFilename, 0, kJSPropertyAttributeReadOnly|kJSPropertyAttributeDontEnum},
    { "parent", ModuleParent, 0, kJSPropertyAttributeReadOnly|kJSPropertyAttributeDontEnum},
    { "children", ModuleChildren, 0, kJSPropertyAttributeReadOnly|kJSPropertyAttributeDontEnum},
    { "loaded", ModuleLoaded, 0, kJSPropertyAttributeReadOnly|kJSPropertyAttributeDontEnum},
    { "__dirname", ModuleDirname, 0, kJSPropertyAttributeReadOnly|kJSPropertyAttributeDontEnum},
    { "__filename", ModuleFilename, 0, kJSPropertyAttributeReadOnly|kJSPropertyAttributeDontEnum},
    { "global", ModuleGlobal, 0, kJSPropertyAttributeReadOnly|kJSPropertyAttributeDontEnum},
    { 0, 0, 0, 0 }
};

/**
 * called to register this class into the JS engine
 */
static JSClassRef RegisterModuleClass()
{
    static JSClassRef jsClass;
    if (!jsClass)
    {
        JSClassDefinition def = kJSClassDefinitionEmpty;
        def.className = "Module";
        def.finalize = ModuleFinalizer;
        def.staticFunctions = StaticModuleFunctions;
        def.staticValues = StaticModuleProperties;
        jsClass = JSClassCreate(&def);
    }
    return jsClass;
}

/**
 * create a module instance
 */
EXPORTAPI JSObjectRef HyperloopCreateModule(JSGlobalContextRef ctx, JSObjectRef parent, const char *filename, const char *dirname, JSValueRef *exception)
{
    auto exports = JSObjectMake(ctx,0,0);
    auto source = JSObjectMake(ctx,RegisterModuleClass(),0);
    auto privateObj = new Appcelerator::Module(ctx, source, std::string(filename), std::string(dirname), parent, exports);
    JSObjectSetPrivate(source, static_cast<void *>(privateObj));
    if (parent!=nullptr) 
    {
        auto pm = JSObjectRefToModule(ctx,parent,nullptr);
        // NSLog(@"PM = %s, FILENAME = %s", pm->getId().c_str(),filename);
        // NSLog(@"create module (%s) - parent=%p (%s), source=%p (%s)",filename,parent,pm->getId().c_str(),source,privateObj->getId().c_str());
        pm->addChild(source);
    }
    // NSLog(@"creating module -> parent = %p, source = %p",parent,source);
    return source;
}

/**
 * called when the module has completed loading
 */
EXPORTAPI JSObjectRef HyperloopModuleLoaded(JSGlobalContextRef ctx, JSObjectRef object)
{
    auto module = JSObjectRefToModule(ctx,object,nullptr);
    module->setLoaded();
    return module->getExports();
}

namespace Appcelerator 
{
    class TranslationUnit 
    {
        public:
            TranslationUnit(const HyperloopTranslationUnitCallback & callback, const std::set<std::string> & sourcemap) : callback{callback},sourcemap{sourcemap}
            {
            }
            inline bool sourceExists(const std::string & name) const 
            {
                return sourcemap.find(name)!=sourcemap.end();
            }
            JSValueRef call(JSGlobalContextRef ctx, const JSObjectRef & parent, const char *path, JSValueRef *exception) const
            {
                return callback(ctx,parent,path,exception);
            }

        private:
            HyperloopTranslationUnitCallback callback;
            std::set<std::string> sourcemap;
    };
}

typedef std::vector<Appcelerator::TranslationUnit> TranslationUnitList;
static TranslationUnitList translationUnits;

/**
 * called by a translation unit to register its compiled code
 */
EXPORTAPI bool HyperloopRegisterTranslationUnit(HyperloopTranslationUnitCallback callback, size_t count, ...)
{
    std::set<std::string> map;
    va_list vl;
    va_start(vl,count);
    for (size_t c = 0; c < count; c++) 
    {
        auto fn = std::string(va_arg(vl,const char*));
        map.insert(fn);
    }
    va_end(vl);
    translationUnits.push_back(Appcelerator::TranslationUnit(callback,map));
    return true;
}

static TranslationUnitList::const_iterator findTranslationUnit (const char *filepath) 
{
    std::string path(filepath);
    return find_if(translationUnits.begin(), translationUnits.end(), [&path] (typename TranslationUnitList::const_reference tu)
    {
        if (tu.sourceExists(path))
        {
            return true;
        }
        return false;
    });
}

static JSValueRef HyperloopLoadEmbedSource(JSGlobalContextRef ctx, const JSObjectRef & object, const char *path, JSValueRef *exception)
{
    auto found = findTranslationUnit(path);
    if (found!=translationUnits.end())
    {
        return found->call(ctx,object,path,exception);
    }

    auto msg = std::string("Cannot find module '");
    msg+=path;
    msg+=std::string("'");
    auto result = HyperloopMakeException(ctx,msg.c_str());
    auto msgStr = HyperloopMakeString(ctx,"MODULE_NOT_FOUND",0);
    auto code = JSStringCreateWithUTF8CString("code");
    auto obj = JSValueToObject(ctx,result,0);
    JSObjectSetProperty(ctx, obj, code, msgStr, 0, 0);
    JSStringRelease(code);
    *exception = result;

    return JSValueMakeUndefined(ctx);
}

static bool HyperloopLoadEmbedSourceExists (const char *filepath)
{
    auto found = findTranslationUnit(filepath);
    return found!=translationUnits.end();
}
