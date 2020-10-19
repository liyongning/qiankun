/* eslint-disable no-param-reassign */
/**
 * @author Kuitos
 * @since 2020-3-31
 */
import { SandBox, SandBoxType } from '../interfaces';
import { nextTick, uniq } from '../utils';
import { attachDocProxySymbol, getTargetValue } from './common';
import { clearSystemJsProps, interceptSystemJsProps } from './noise/systemjs';

// zone.js will overwrite Object.defineProperty
const rawObjectDefineProperty = Object.defineProperty;

/*
 variables who are impossible to be overwrite need to be escaped from proxy sandbox for performance reasons
 */
const unscopables = {
  undefined: true,
  Array: true,
  Object: true,
  String: true,
  Boolean: true,
  Math: true,
  eval: true,
  Number: true,
  Symbol: true,
  parseFloat: true,
  Float32Array: true,
};

type SymbolTarget = 'target' | 'rawWindow';

type FakeWindow = Window & Record<PropertyKey, any>;

/**
 * 拷贝全局对象上所有不可配置属性到 fakeWindow 对象，并将这些属性的属性描述符改为可配置的然后冻结
 * 将启动具有 getter 属性的属性再存入 propertiesWithGetter map 中
 * @param global 全局对象 => window
 */
function createFakeWindow(global: Window) {
  // 记录 window 对象上的 getter 属性，原生的有：window、document、location、top，比如：Object.getOwnPropertyDescriptor(window, 'window') => {set: undefined, enumerable: true, configurable: false, get: ƒ}
  // propertiesWithGetter = {"window" => true, "document" => true, "location" => true, "top" => true, "__VUE_DEVTOOLS_GLOBAL_HOOK__" => true}
  const propertiesWithGetter = new Map<PropertyKey, boolean>();
  // 存储 window 对象中所有不可配置的属性和值
  const fakeWindow = {} as FakeWindow;

  /*
   copy the non-configurable property of global to fakeWindow
   see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/handler/getOwnPropertyDescriptor
   > A property cannot be reported as non-configurable, if it does not exists as an own property of the target object or if it exists as a configurable own property of the target object.
   */
  Object.getOwnPropertyNames(global)
    // 遍历出 window 对象所有不可配置属性
    .filter(p => {
      const descriptor = Object.getOwnPropertyDescriptor(global, p);
      return !descriptor?.configurable;
    })
    .forEach(p => {
      // 得到属性描述符
      const descriptor = Object.getOwnPropertyDescriptor(global, p);
      if (descriptor) {
        // 获取其 get 属性
        const hasGetter = Object.prototype.hasOwnProperty.call(descriptor, 'get');

        /*
         make top/self/window property configurable and writable, otherwise it will cause TypeError while get trap return.
         see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/handler/get
         > The value reported for a property must be the same as the value of the corresponding target object property if the target object property is a non-writable, non-configurable data property.
         */
        if (
          p === 'top' ||
          p === 'parent' ||
          p === 'self' ||
          p === 'window' ||
          (process.env.NODE_ENV === 'test' && (p === 'mockTop' || p === 'mockSafariTop'))
        ) {
          // 将 top、parent、self、window 这几个属性由不可配置改为可配置
          descriptor.configurable = true;
          /*
           The descriptor of window.window/window.top/window.self in Safari/FF are accessor descriptors, we need to avoid adding a data descriptor while it was
           Example:
            Safari/FF: Object.getOwnPropertyDescriptor(window, 'top') -> {get: function, set: undefined, enumerable: true, configurable: false}
            Chrome: Object.getOwnPropertyDescriptor(window, 'top') -> {value: Window, writable: false, enumerable: true, configurable: false}
           */
          if (!hasGetter) {
            // 如果这几个属性没有 getter，则说明由 writeable 属性，将其设置为可写
            descriptor.writable = true;
          }
        }

        // 如果存在 getter，则以该属性为 key，true 为 value 存入 propertiesWithGetter map
        if (hasGetter) propertiesWithGetter.set(p, true);

        // 将属性和描述设置到 fakeWindow 对象，并且冻结属性描述符，不然有可能会被更改，比如 zone.js
        // freeze the descriptor to avoid being modified by zone.js
        // see https://github.com/angular/zone.js/blob/a5fe09b0fac27ac5df1fa746042f96f05ccb6a00/lib/browser/define-property.ts#L71
        rawObjectDefineProperty(fakeWindow, p, Object.freeze(descriptor));
      }
    });

  return {
    fakeWindow,
    propertiesWithGetter,
  };
}

// 记录被激活的沙箱的数量
let activeSandboxCount = 0;

/**
 * 基于 Proxy 实现的多例模式下的沙箱
 * 通过 proxy 代理 fakeWindow 对象，所有的更改都是基于 fakeWindow，这点和单例不一样（很重要），
 * 从而保证每个 ProxySandbox 实例之间属性互不影响
 */
export default class ProxySandbox implements SandBox {
  /** window 值变更记录 */
  private updatedValueSet = new Set<PropertyKey>();

  name: string;

  type: SandBoxType;

  proxy: WindowProxy;

  sandboxRunning = true;

  // 激活
  active() {
    // 被激活的沙箱数 + 1
    if (!this.sandboxRunning) activeSandboxCount++;
    this.sandboxRunning = true;
  }

  // 失活
  inactive() {
    if (process.env.NODE_ENV === 'development') {
      console.info(`[qiankun:sandbox] ${this.name} modified global properties restore...`, [
        ...this.updatedValueSet.keys(),
      ]);
    }

    // 被激活的沙箱数 - 1
    clearSystemJsProps(this.proxy, --activeSandboxCount === 0);

    this.sandboxRunning = false;
  }

  constructor(name: string) {
    this.name = name;
    this.type = SandBoxType.Proxy;
    const { updatedValueSet } = this;

    const self = this;
    const rawWindow = window;
    // 全局对象上所有不可配置属性都在 fakeWindow 中，且其中具有 getter 属性的属性还存在 propertesWithGetter map 中，value 为 true
    const { fakeWindow, propertiesWithGetter } = createFakeWindow(rawWindow);

    const descriptorTargetMap = new Map<PropertyKey, SymbolTarget>();
    // 判断全局对象是否存在指定属性
    const hasOwnProperty = (key: PropertyKey) => fakeWindow.hasOwnProperty(key) || rawWindow.hasOwnProperty(key);

    const proxy = new Proxy(fakeWindow, {
      set(target: FakeWindow, p: PropertyKey, value: any): boolean {
        // 如果沙箱在运行，则更新属性值并记录被更改的属性
        if (self.sandboxRunning) {
          // 设置属性值
          // @ts-ignore
          target[p] = value;
          // 记录被更改的属性
          updatedValueSet.add(p);

          // 不用管，和 systemJs 有关
          interceptSystemJsProps(p, value);

          return true;
        }

        if (process.env.NODE_ENV === 'development') {
          console.warn(`[qiankun] Set window.${p.toString()} while sandbox destroyed or inactive in ${name}!`);
        }

        // 在 strict-mode 下，Proxy 的 handler.set 返回 false 会抛出 TypeError，在沙箱卸载的情况下应该忽略错误
        return true;
      },

      // 获取执行属性的值
      get(target: FakeWindow, p: PropertyKey): any {
        if (p === Symbol.unscopables) return unscopables;

        // avoid who using window.window or window.self to escape the sandbox environment to touch the really window
        // see https://github.com/eligrey/FileSaver.js/blob/master/src/FileSaver.js#L13
        if (p === 'window' || p === 'self') {
          return proxy;
        }

        if (
          p === 'top' ||
          p === 'parent' ||
          (process.env.NODE_ENV === 'test' && (p === 'mockTop' || p === 'mockSafariTop'))
        ) {
          // if your master app in an iframe context, allow these props escape the sandbox
          if (rawWindow === rawWindow.parent) {
            return proxy;
          }
          return (rawWindow as any)[p];
        }

        // proxy.hasOwnProperty would invoke getter firstly, then its value represented as rawWindow.hasOwnProperty
        if (p === 'hasOwnProperty') {
          return hasOwnProperty;
        }

        // mark the symbol to document while accessing as document.createElement could know is invoked by which sandbox for dynamic append patcher
        if (p === 'document') {
          document[attachDocProxySymbol] = proxy;
          // remove the mark in next tick, thus we can identify whether it in micro app or not
          // this approach is just a workaround, it could not cover all the complex scenarios, such as the micro app runs in the same task context with master in som case
          // fixme if you have any other good ideas
          nextTick(() => delete document[attachDocProxySymbol]);
          return document;
        }
        // 以上内容都是一些特殊属性的处理

        // 获取特定属性，如果属性具有 getter，说明是原生对象的那几个属性，否则是 fakeWindow 对象上的属性（原生的或者用户设置的)
        // eslint-disable-next-line no-bitwise
        const value = propertiesWithGetter.has(p) ? (rawWindow as any)[p] : (target as any)[p] || (rawWindow as any)[p];
        return getTargetValue(rawWindow, value);
      },

      // 判断是否存在指定属性
      // see https://github.com/styled-components/styled-components/blob/master/packages/styled-components/src/constants.js#L12
      has(target: FakeWindow, p: string | number | symbol): boolean {
        return p in unscopables || p in target || p in rawWindow;
      },

      getOwnPropertyDescriptor(target: FakeWindow, p: string | number | symbol): PropertyDescriptor | undefined {
        /*
         as the descriptor of top/self/window/mockTop in raw window are configurable but not in proxy target, we need to get it from target to avoid TypeError
         see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/handler/getOwnPropertyDescriptor
         > A property cannot be reported as non-configurable, if it does not exists as an own property of the target object or if it exists as a configurable own property of the target object.
         */
        if (target.hasOwnProperty(p)) {
          const descriptor = Object.getOwnPropertyDescriptor(target, p);
          descriptorTargetMap.set(p, 'target');
          return descriptor;
        }

        if (rawWindow.hasOwnProperty(p)) {
          const descriptor = Object.getOwnPropertyDescriptor(rawWindow, p);
          descriptorTargetMap.set(p, 'rawWindow');
          // A property cannot be reported as non-configurable, if it does not exists as an own property of the target object
          if (descriptor && !descriptor.configurable) {
            descriptor.configurable = true;
          }
          return descriptor;
        }

        return undefined;
      },

      // trap to support iterator with sandbox
      ownKeys(target: FakeWindow): PropertyKey[] {
        return uniq(Reflect.ownKeys(rawWindow).concat(Reflect.ownKeys(target)));
      },

      defineProperty(target: Window, p: PropertyKey, attributes: PropertyDescriptor): boolean {
        const from = descriptorTargetMap.get(p);
        /*
         Descriptor must be defined to native window while it comes from native window via Object.getOwnPropertyDescriptor(window, p),
         otherwise it would cause a TypeError with illegal invocation.
         */
        switch (from) {
          case 'rawWindow':
            return Reflect.defineProperty(rawWindow, p, attributes);
          default:
            return Reflect.defineProperty(target, p, attributes);
        }
      },

      deleteProperty(target: FakeWindow, p: string | number | symbol): boolean {
        if (target.hasOwnProperty(p)) {
          // @ts-ignore
          delete target[p];
          updatedValueSet.delete(p);

          return true;
        }

        return true;
      },
    });

    this.proxy = proxy;
  }
}
