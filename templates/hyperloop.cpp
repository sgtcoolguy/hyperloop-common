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

typedef Hyperloop::NativeObject<void *> * NativeVoid;

/**
 * internal method to return NativeObject
 */
static NativeVoid ToNative(JSObjectRef object)
{
    auto p = JSObjectGetPrivate(object);
    return reinterpret_cast<NativeVoid>(p);
}

/**
 * internal method to return object
 */
static void * ToNativeObject(JSObjectRef object)
{
    auto o = ToNative(object);
    if (o == nullptr)
    {
        return nullptr;
    }
    return reinterpret_cast<void *>(o->getObject());
}

/**
 * internal
 *
 * called when our native object is garbarge collected by VM
 */
static void Initializer(JSContextRef context, JSObjectRef object)
{
    auto n = ToNativeObject(object);
    ToNative(object)->retain();
}

/**
 * internal
 *
 * called when our native object is garbarge collected by VM
 */
static void Finalizer(JSObjectRef object)
{
    auto n = ToNativeObject(object);
    ToNative(object)->release();
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
EXPORTAPI void HyperloopInitialize_Source();
#ifdef USE_TIJSCORE
static void InitializeHyperloopVM(JSGlobalContextRef ctx) 
#else
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
        def.initialize = Initializer;
        def.className = "void *";
        ref = JSClassCreate(&def);
    }
    return JSObjectMake(ctx, ref, new Hyperloop::NativeObject<void *>(pointer));
}

/**
 * return a void pointer from a JSValueRef or NULL of not a navite object
 */
EXPORTAPI void* HyperloopJSValueToVoidPointer(JSContextRef ctx, JSValueRef value, JSValueRef *exception)
{
    auto po1 = static_cast<Hyperloop::AbstractObject*>(JSObjectGetPrivate(JSValueToObject(ctx,value,exception)));
    if(po1 == nullptr) return nullptr;
    auto po2 = static_cast<Hyperloop::NativeObject<void *> *>(po1);
    if(po2 == nullptr) return nullptr;
    return po2->getObject();
}

/**
 * invoke a function callback
 */
EXPORTAPI JSValueRef HyperloopInvokeFunctionCallback (JSContextRef ctx, void * callbackPointer, size_t argumentCount, const JSValueRef arguments[], JSValueRef *exception)
{
    JSValueRef callback = *(JSValueRef*)callbackPointer;
    if (!JSValueIsObject(ctx, callback) || !JSObjectIsFunction(ctx, JSValueToObject(ctx,callback,exception))) {
        *exception = HyperloopMakeException(ctx,"Function callback is not a JS function object");
        return JSValueMakeUndefined(ctx);
    }
    JSObjectRef callbackObj = JSValueToObject(ctx,callback,exception);
    return JSObjectCallAsFunction(HyperloopGlobalContext(), callbackObj, NULL, argumentCount, arguments, exception);
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

#define MEMORY_SIZE_OF_FUNCTION_DEF(type) \
EXPORTAPI JSValueRef Hyperloop_Memory_Get_SizeOf_##type (JSContextRef ctx, JSObjectRef object, JSStringRef propertyName, JSValueRef* exception)\
{\
    return JSValueMakeNumber(ctx,sizeof(type));\
}

MEMORY_SIZE_OF_FUNCTION_DEF(float)
MEMORY_SIZE_OF_FUNCTION_DEF(int)
MEMORY_SIZE_OF_FUNCTION_DEF(char)
MEMORY_SIZE_OF_FUNCTION_DEF(bool)
MEMORY_SIZE_OF_FUNCTION_DEF(double)
MEMORY_SIZE_OF_FUNCTION_DEF(long)
MEMORY_SIZE_OF_FUNCTION_DEF(short)

#define MEMORY_GET_FUNCTION_DEF(name, type) \
EXPORTAPI JSValueRef Hyperloop_Memory_Get_##name (JSContextRef ctx, JSObjectRef function, JSObjectRef thisObject, size_t argumentCount, const JSValueRef arguments[], JSValueRef* exception)\
{\
    if (argumentCount < 2 || !JSValueIsObject(ctx, arguments[0]) || !JSValueIsNumber(ctx, arguments[1])) {\
        *exception = HyperloopMakeException(ctx, "Wrong arguments passed to memory");\
        return JSValueMakeUndefined(ctx);\
    }\
    auto pointer = static_cast<type*>(HyperloopJSValueToVoidPointer(ctx, arguments[0], exception));\
    if (pointer == nullptr) {\
        *exception = HyperloopMakeException(ctx, "Can't convert memory");\
        return JSValueMakeUndefined(ctx);\
    }\
    auto index = static_cast<size_t>(JSValueToNumber(ctx, arguments[1], exception));\
    auto size = sizeof(type);\
    return JSValueMakeNumber(ctx, static_cast<double>(pointer[index]));\
}

MEMORY_GET_FUNCTION_DEF(float, float)
MEMORY_GET_FUNCTION_DEF(int, int)
MEMORY_GET_FUNCTION_DEF(uint, unsigned int)
MEMORY_GET_FUNCTION_DEF(char, char)
MEMORY_GET_FUNCTION_DEF(bool, bool)
MEMORY_GET_FUNCTION_DEF(double, double)
MEMORY_GET_FUNCTION_DEF(long, long)
MEMORY_GET_FUNCTION_DEF(short, short)
MEMORY_GET_FUNCTION_DEF(ushort, unsigned short)

#define MEMORY_SET_FUNCTION_DEF(name, type) \
EXPORTAPI JSValueRef Hyperloop_Memory_Set_##name (JSContextRef ctx, JSObjectRef function, JSObjectRef thisObject, size_t argumentCount, const JSValueRef arguments[], JSValueRef* exception)\
{\
    if (argumentCount < 3 || !JSValueIsObject(ctx, arguments[0]) || !JSValueIsNumber(ctx, arguments[1])) {\
        *exception = HyperloopMakeException(ctx, "Wrong arguments passed to memory");\
        return JSValueMakeUndefined(ctx);\
    }\
    auto pointer = static_cast<type*>(HyperloopJSValueToVoidPointer(ctx, arguments[0], exception));\
    auto index = static_cast<size_t>(JSValueToNumber(ctx, arguments[1], exception));\
    auto size = sizeof(type);\
    if (JSValueIsNumber(ctx, arguments[2])) {\
        auto value = static_cast<type>(JSValueToNumber(ctx, arguments[2], exception));\
        pointer[index] = value;\
    } else if (JSValueIsString(ctx, arguments[2])) {\
        auto str = JSValueToStringCopy(ctx,arguments[2],exception);\
        auto size = JSStringGetMaximumUTF8CStringSize(str);\
        auto buf = new char[size];\
        JSStringGetUTF8CString(str,buf,size);\
        JSStringRelease(str);\
        pointer+=index;\
        memcpy(pointer, buf, size);\
        delete[] buf;\
    } else if (HyperloopJSValueIsArray(ctx, arguments[2])) {\
        auto jobj = JSValueToObject(ctx, arguments[2], exception);\
        auto jstr = JSStringCreateWithUTF8CString("length");\
        auto jlen = JSObjectGetProperty(ctx, jobj, jstr, exception);\
        JSStringRelease(jstr);\
        if (JSValueIsNumber(ctx, jlen)) {\
            auto len = static_cast<size_t>(JSValueToNumber(ctx, jlen, exception));\
            for (size_t i = 0; i < len; i++) {\
                auto jvalue = JSObjectGetPropertyAtIndex(ctx, jobj, i, exception);\
                auto value = static_cast<type>(JSValueToNumber(ctx, jvalue, exception));\
                pointer[index+i] = value;\
            }\
        }\
    } else if (JSValueIsObject(ctx, arguments[2])) {\
        auto otherPointer = HyperloopJSValueToVoidPointer(ctx, arguments[2], exception);\
        if (otherPointer == nullptr) {\
            *exception = HyperloopMakeException(ctx, "Wrong arguments passed to memory");\
            return JSValueMakeUndefined(ctx);\
        }\
        pointer[index] = reinterpret_cast<size_t>(otherPointer);\
    } else {\
        *exception = HyperloopMakeException(ctx, "Wrong arguments passed to memory");\
        return JSValueMakeUndefined(ctx);\
    }\
    return JSValueMakeNull(ctx);\
}

MEMORY_SET_FUNCTION_DEF(float, float)
MEMORY_SET_FUNCTION_DEF(int, int)
MEMORY_SET_FUNCTION_DEF(uint, unsigned int)
MEMORY_SET_FUNCTION_DEF(char, char)
MEMORY_SET_FUNCTION_DEF(bool, bool)
MEMORY_SET_FUNCTION_DEF(double, double)
MEMORY_SET_FUNCTION_DEF(long, long)
MEMORY_SET_FUNCTION_DEF(short, short)
MEMORY_SET_FUNCTION_DEF(ushort, unsigned short)

EXPORTAPI JSValueRef Hyperloop_Binary_IsStrictEqual(JSContextRef ctx, JSObjectRef function, JSObjectRef thisObject, size_t argumentCount, const JSValueRef arguments[], JSValueRef* exception) {
    if (argumentCount < 2)
    {
        *exception = HyperloopMakeException(ctx, "Wrong arguments passed to IsEqual");
        return JSValueMakeUndefined(ctx);
    }

    auto isObject_a = JSValueIsObject(ctx, arguments[0]);
    auto isObject_b = JSValueIsObject(ctx, arguments[1]);

    if (isObject_a && isObject_b)
    {
        auto obj_a = HyperloopJSValueToVoidPointer(ctx, arguments[0], exception);
        auto obj_b = HyperloopJSValueToVoidPointer(ctx, arguments[1], exception);

        // nullptr means both objects are not a native object
        if (obj_a == nullptr && obj_b == nullptr) {
            return JSValueMakeBoolean(ctx, JSValueIsEqual(ctx, arguments[0], arguments[1], exception));
        }

        return JSValueMakeBoolean(ctx, (obj_a == obj_b));
    }
    else if (!isObject_a && !isObject_b) {
        return JSValueMakeBoolean(ctx, JSValueIsEqual(ctx, arguments[0], arguments[1], exception));
    }

    return JSValueMakeBoolean(ctx, false);
}

EXPORTAPI JSValueRef Hyperloop_Binary_IsEqual(JSContextRef ctx, JSObjectRef function, JSObjectRef thisObject, size_t argumentCount, const JSValueRef arguments[], JSValueRef* exception) {
    if (argumentCount < 2)
    {
        *exception = HyperloopMakeException(ctx, "Wrong arguments passed to IsEqual");
        return JSValueMakeUndefined(ctx);
    }

    auto isObject_a = JSValueIsObject(ctx, arguments[0]);
    auto isObject_b = JSValueIsObject(ctx, arguments[1]);

    if (isObject_a && isObject_b)
    {
        auto obj_a = HyperloopJSValueToVoidPointer(ctx, arguments[0], exception);
        auto obj_b = HyperloopJSValueToVoidPointer(ctx, arguments[1], exception);

        // nullptr means both objects are not a native object
        if (obj_a == nullptr && obj_b == nullptr) {
            return JSValueMakeBoolean(ctx, JSValueIsStrictEqual(ctx, arguments[0], arguments[1]));
        }

        return JSValueMakeBoolean(ctx, (obj_a == obj_b));
    }
    else if (!isObject_a && !isObject_b) {
        return JSValueMakeBoolean(ctx, JSValueIsStrictEqual(ctx, arguments[0], arguments[1]));
    }

    return JSValueMakeBoolean(ctx, false);
}

