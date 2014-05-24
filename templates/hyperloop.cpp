/**
 * Copyright (c) 2014 by Appcelerator, Inc. All Rights Reserved.
 * Licensed under the terms of the Apache Public License
 * Please see the LICENSE included with this distribution for details.
 *
 * This code and related technologies are covered by patents
 * or patents pending by Appcelerator, Inc.
 */

#include <hyperloop.h>
#include <ostream>
#include <sstream>
#include <memory>
#include <string>

//-----------------------------------------------------------------------------//
//                                 PRIVATE                                     //
//-----------------------------------------------------------------------------//

/**
 * global context
 */
static JSGlobalContextRef globalContextRef = nullptr;
static JSContextGroupRef globalContextGroupRef = nullptr;

/**
 * internal
 *
 * called when our native object is garbarge collected by VM
 */
static void Finalizer(JSObjectRef object)
{
    auto po = reinterpret_cast<Hyperloop::NativeObject<void *> *>(object);
    po->release();
}

/**
 * internal
 * 
 * implementation of console.log 
 */
static JSValueRef HyperloopLogger (JSContextRef ctx, JSObjectRef function, JSObjectRef thisObject, size_t argumentCount, const JSValueRef arguments[], JSValueRef* exception)
{
    if (argumentCount>0) 
    {
        std::ostringstream stream;
        for (size_t c=0;c<argumentCount;c++)
        {
            if (JSValueIsObject(ctx,arguments[c]) || JSValueIsString(ctx,arguments[c])) 
            {
                std::string str(HyperloopJSValueToStringCopy(ctx,arguments[c],exception));
                stream << str;
            }
            else if (JSValueIsNumber(ctx,arguments[c]))
            {
                double num = JSValueToNumber(ctx,arguments[c],exception);
                double intpart;
                if (modf(num, &intpart) == 0.0)
                {
                    stream << intpart;
                }
                else 
                {
                    stream << num;
                }
            }
            else if (JSValueIsBoolean(ctx,arguments[c]))
            {
                bool b = JSValueToBoolean(ctx,arguments[c]);
                stream << (b ? "true":"false");
            }
            else if (JSValueIsNull(ctx,arguments[c]))
            {
                stream << "null";
            }
            else if (JSValueIsUndefined(ctx,arguments[c]))
            {
                stream << "undefined";
            }
            if (c+1 < argumentCount) 
            {
                stream << " ";
            }
        }
        // call the platform adapter
        HyperloopNativeLogger(stream.str().c_str());
    }
    return JSValueMakeUndefined(ctx);
}

/**
 * run JS in a new context and return result
 */
static JSValueRef RunInNewContext(JSContextRef ctx, JSObjectRef function, JSObjectRef thisObject, size_t argumentCount, const JSValueRef arguments[], JSValueRef* exception)
{
    if (argumentCount > 0) 
    {
        std::ostringstream stream;
        std::string js(HyperloopJSValueToStringCopy(ctx,arguments[0],exception));
        stream << "(function(){" << js << "})";
        auto newCtx = JSGlobalContextCreateInGroup(globalContextGroupRef,nullptr);
        auto scriptRef = JSStringCreateWithUTF8CString(stream.str().c_str());
        auto thisObjectRef = argumentCount > 1 ? JSValueToObject(ctx,arguments[1],exception) : thisObject;
        auto functionRef = JSEvaluateScript(newCtx,scriptRef,thisObjectRef,nullptr,0,exception);
        auto functionObj = JSValueToObject(newCtx,functionRef,exception);
        auto resultRef = JSObjectCallAsFunction(newCtx,functionObj,thisObjectRef,0,nullptr,exception);
        JSStringRelease(scriptRef);
        JSGlobalContextRelease(newCtx);
        return resultRef;
    } 
    return JSValueMakeUndefined(ctx);   
}

/**
 * internal 
 *
 * setup a context after created
 */
static void InitializeContext (JSGlobalContextRef ctx)
{
    auto global = JSContextGetGlobalObject(ctx);
    auto setterProps = kJSPropertyAttributeReadOnly | kJSPropertyAttributeDontEnum | kJSPropertyAttributeDontDelete;

    // inject a simple console logger
    auto logProperty = JSStringCreateWithUTF8CString("log");
    auto consoleProperty = JSStringCreateWithUTF8CString("console");
    auto consoleObject = JSObjectMake(ctx, 0, 0);
    auto logFunction = JSObjectMakeFunctionWithCallback(ctx, logProperty, HyperloopLogger);
    JSObjectSetProperty(ctx, consoleObject, logProperty, logFunction, setterProps, 0);
    JSObjectSetProperty(ctx, global, consoleProperty, consoleObject, setterProps, 0);
    JSStringRelease(logProperty);
    JSStringRelease(consoleProperty);

    // bind some internal cross-platform methods
    auto vmBindingProperty = JSStringCreateWithUTF8CString("hyperloop$vm");
    auto vmrunInNewContextProperty = JSStringCreateWithUTF8CString("runInNewContext");
    auto vmBindingObject = JSObjectMake(ctx, 0, 0);
    auto vmrunInNewContextFunction = JSObjectMakeFunctionWithCallback(ctx, vmrunInNewContextProperty, RunInNewContext);
    JSObjectSetProperty(ctx, vmBindingObject, vmrunInNewContextProperty, vmrunInNewContextFunction, setterProps, 0);
    JSObjectSetProperty(ctx, global, vmBindingProperty, vmBindingObject, setterProps, 0);
    JSStringRelease(vmBindingProperty);
    JSStringRelease(vmrunInNewContextProperty);

    // create a hook into our global context
    auto prop = JSStringCreateWithUTF8CString("hyperloop$global");
    JSObjectSetProperty(ctx, global, prop, global, setterProps, 0);
    JSStringRelease(prop);

    // setup our globals object -- should point to the real root global object if a new context (not the root ctx)
    auto globalProperty = JSStringCreateWithUTF8CString("global");
    JSObjectSetProperty(ctx, global, globalProperty, global, setterProps, 0);
    JSStringRelease(globalProperty);
}

/**
 * internal
 * 
 * called to create the hyperloop VM
 */
#ifdef USE_TIJSCORE
static void InitializeHyperloopVM(JSGlobalContextRef ctx) 
#else
EXPORTAPI void HyperloopInitialize_Source();
static void InitializeHyperloopVM() 
#endif
{
    globalContextGroupRef = JSContextGroupCreate();
#ifdef USE_TIJSCORE
    globalContextRef = ctx;
#else
    JSContextGroupRetain(globalContextGroupRef);
    globalContextRef = JSGlobalContextCreateInGroup(globalContextGroupRef,nullptr);
#endif

    // initialize
    InitializeContext(globalContextRef);

    // retain it
    JSGlobalContextRetain(globalContextRef);
}

//-----------------------------------------------------------------------------//
//                                 PUBLIC                                      //
//-----------------------------------------------------------------------------//

/**
 * external
 *
 * called to create hyperloop
 */
#ifdef USE_TIJSCORE
EXPORTAPI JSGlobalContextRef InitializeHyperloop(JSGlobalContextRef ctx) 
#else
EXPORTAPI JSGlobalContextRef InitializeHyperloop() 
#endif
{
    // this is a singleton, hyperloop currently only supports on VM per process
    if (!globalContextRef) 
    {
#ifdef USE_TIJSCORE
        InitializeHyperloopVM(ctx);
#else
        InitializeHyperloopVM();
#endif
    }
    return globalContextRef;
}

/**
 * external
 *
 * called to destroy hyperloop
 */
EXPORTAPI void DestroyHyperloop()
{
    if (globalContextRef) 
    {
        JSGlobalContextRelease(globalContextRef);
        globalContextRef = nullptr;
    }
    if (globalContextGroupRef)
    {
        JSContextGroupRelease(globalContextGroupRef);
        globalContextGroupRef = nullptr;
    }
}

/**
 * return the global context for hyperloop
 */
EXPORTAPI JSGlobalContextRef HyperloopGlobalContext()
{
    return globalContextRef;
}

/**
 * return a new global context initialized with Hyperloop global objects
 */
EXPORTAPI JSGlobalContextRef HyperloopNewGlobalContext()
{
    auto ctx = JSGlobalContextCreate(nullptr);
    InitializeContext(ctx);
    return ctx;
}

/**
 * create an Error object using message
 */
EXPORTAPI JSValueRef HyperloopMakeException(JSContextRef ctx, const char *error)
{
    auto string = JSStringCreateWithUTF8CString(error);
    auto message = JSValueMakeString(ctx, string);
    JSStringRelease(string);
    return JSObjectMakeError(ctx, 1, &message, 0);
}

/**
 * return a char* from a JSValueRef as string which must be delete when finished
 */
EXPORTAPI char * HyperloopJSValueToStringCopy(JSContextRef ctx, JSValueRef value, JSValueRef *exception)
{
    auto str = JSValueToStringCopy(ctx,value,exception);
    auto size = JSStringGetMaximumUTF8CStringSize(str);
    auto buf = new char[size];
    JSStringGetUTF8CString(str,buf,size);
    JSStringRelease(str);
    return buf;
}

/**
 * return a char* from a JSStringRef as string which must be delete when finished
 */
EXPORTAPI char * HyperloopJSStringToStringCopy(JSContextRef ctx, JSStringRef str, JSValueRef *exception)
{
    auto size = JSStringGetMaximumUTF8CStringSize(str);
    auto buf = new char[size];
    JSStringGetUTF8CString(str,buf,size);
    return buf;
}

/**
 * return a JS string from a const char *
 */
EXPORTAPI JSValueRef HyperloopMakeString(JSContextRef ctx, const char *string, JSValueRef *exception)
{
    auto stringRef = JSStringCreateWithUTF8CString(string);
    auto result = JSValueMakeString(ctx,stringRef);
    JSStringRelease(stringRef);
    return result;
}

/**
 * return a void pointer
 */
EXPORTAPI JSObjectRef HyperloopVoidPointerToJSValue(JSContextRef ctx, void *pointer, JSValueRef *exception)
{
    static JSClassRef ref = nullptr;
    if (ref==nullptr)
    {
        JSClassDefinition def = kJSClassDefinitionEmpty;
        def.finalize = Finalizer;
        def.className = "void *";
        ref = JSClassCreate(&def);
    }
    return JSObjectMake(ctx, ref, new Hyperloop::NativeObject<void *>(pointer));
}

/**
 * return a void pointer from a JSValueRef
 */
EXPORTAPI void* HyperloopJSValueToVoidPointer(JSContextRef ctx, JSValueRef value, JSValueRef *exception)
{
    auto object = JSValueToObject(ctx,value,exception);
    auto po = reinterpret_cast<Hyperloop::NativeObject<void *> *>(object);
    return po->getObject();
}

/**
 * invoke a function callback
 */
EXPORTAPI JSValueRef HyperloopInvokeFunctionCallback (void * callbackPointer, size_t argumentCount, const JSValueRef arguments[], JSValueRef *exception)
{
    //FIXME
    return JSValueMakeUndefined(HyperloopGlobalContext());
    //JSObjectRef callback = (JSObjectRef)HyperloopFunctionCallbackFunctionPointer(callbackPointer);
    //return JSObjectCallAsFunction(HyperloopGlobalContext(), callback, NULL, argumentCount, arguments, exception);
}

/*
 * Tests whether a JavaScript value is an array object
 * 
 * This invokes Array.isArray(value) and returns its result
 */
EXPORTAPI bool HyperloopJSValueIsArray(JSContextRef ctx, JSValueRef value) 
{
    if (JSValueIsObject(ctx, value)) 
    {
        JSObjectRef global = JSContextGetGlobalObject(ctx);
        JSValueRef exception = JSValueMakeNull(ctx);
        JSStringRef string = JSStringCreateWithUTF8CString("Array");
        JSObjectRef array = JSValueToObject(ctx, JSObjectGetProperty(ctx, global, string, &exception), &exception);
        JSStringRelease(string);
        if (!JSValueIsNull(ctx, exception)) 
        {
            return false;
        }

        string = JSStringCreateWithUTF8CString("isArray");
        JSObjectRef isArray = JSValueToObject(ctx, JSObjectGetProperty(ctx, array, string, &exception), &exception);
        JSStringRelease(string);
        if (!JSValueIsNull(ctx, exception))
        {
            return false;
        }

        JSValueRef result = JSObjectCallAsFunction(ctx, isArray, global, 1, &value, &exception);

        if (JSValueIsNull(ctx, exception) && JSValueIsBoolean(ctx, result)) 
        {
            return JSValueToBoolean(ctx, result);
        }
    }
    return false;
}
