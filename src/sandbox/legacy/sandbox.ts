/**
 * @author Kuitos
 * @since 2019-04-11
 */
import { SandBox, SandBoxType } from '../../interfaces';
import { getTargetValue } from '../common';

function isPropConfigurable(target: object, prop: PropertyKey) {
  const descriptor = Object.getOwnPropertyDescriptor(target, prop);
  return descriptor ? descriptor.configurable : true;
}

/**
 * 在 window 对象上设置 key value 或 删除指定属性(key)
 * @param prop key
 * @param value value
 * @param toDelete 是否删除
 */
function setWindowProp(prop: PropertyKey, value: any, toDelete?: boolean) {
  if (value === undefined && toDelete) {
    // 删除 window[key]
    delete (window as any)[prop];
  } else if (isPropConfigurable(window, prop) && typeof prop !== 'symbol') {
    // window[key] = value
    Object.defineProperty(window, prop, { writable: true, configurable: true });
    (window as any)[prop] = value;
  }
}

/**
 * 基于 Proxy 实现的单例模式下的沙箱，直接操作原生 window 对象，并记录 window 对象的增删改查，在每次微应用切换时初始化 window 对象；
 * 激活时：将 window 对象恢复到上次即将失活时的状态
 * 失活时：将 window 对象恢复为初始状态
 * 
 * TODO: 为了兼容性 singular 模式下依旧使用该沙箱，等新沙箱稳定之后再切换
 */
export default class SingularProxySandbox implements SandBox {
  // 沙箱期间新增的全局变量
  private addedPropsMapInSandbox = new Map<PropertyKey, any>();

  // 沙箱期间更新的全局变量，key 为被更新的属性，value 为被更新的值
  private modifiedPropsOriginalValueMapInSandbox = new Map<PropertyKey, any>();

  // 持续记录更新的(新增和修改的)全局变量的 map，用于在任意时刻做 snapshot
  private currentUpdatedPropsValueMap = new Map<PropertyKey, any>();

  name: string;

  proxy: WindowProxy;

  type: SandBoxType;

  sandboxRunning = true;

  // 激活沙箱
  active() {
    // 如果沙箱由失活 -> 激活，则恢复 window 对象到上次失活时的状态
    if (!this.sandboxRunning) {
      this.currentUpdatedPropsValueMap.forEach((v, p) => setWindowProp(p, v));
    }

    // 切换沙箱状态为 激活
    this.sandboxRunning = true;
  }

  // 失活沙箱
  inactive() {
    // 开发环境，打印被改变的全局属性
    if (process.env.NODE_ENV === 'development') {
      console.info(`[qiankun:sandbox] ${this.name} modified global properties restore...`, [
        ...this.addedPropsMapInSandbox.keys(),
        ...this.modifiedPropsOriginalValueMapInSandbox.keys(),
      ]);
    }

    // restore global props to initial snapshot
    // 将被更改的全局属性再改回去
    this.modifiedPropsOriginalValueMapInSandbox.forEach((v, p) => setWindowProp(p, v));
    // 新增的属性删掉
    this.addedPropsMapInSandbox.forEach((_, p) => setWindowProp(p, undefined, true));

    // 切换沙箱状态为 失活
    this.sandboxRunning = false;
  }

  constructor(name: string) {
    this.name = name;
    this.type = SandBoxType.LegacyProxy;
    const { addedPropsMapInSandbox, modifiedPropsOriginalValueMapInSandbox, currentUpdatedPropsValueMap } = this;

    const self = this;
    const rawWindow = window;
    const fakeWindow = Object.create(null) as Window;

    const proxy = new Proxy(fakeWindow, {
      set(_: Window, p: PropertyKey, value: any): boolean {
        if (self.sandboxRunning) {
          if (!rawWindow.hasOwnProperty(p)) {
            // 属性不存在，则添加
            addedPropsMapInSandbox.set(p, value);
          } else if (!modifiedPropsOriginalValueMapInSandbox.has(p)) {
            // 如果当前 window 对象存在该属性，且 record map 中未记录过，则记录该属性初始值，说明是更改已存在的属性
            const originalValue = (rawWindow as any)[p];
            modifiedPropsOriginalValueMapInSandbox.set(p, originalValue);
          }

          currentUpdatedPropsValueMap.set(p, value);
          // 直接设置原生 window 对象，因为是单例模式，不会有其它的影响
          // eslint-disable-next-line no-param-reassign
          (rawWindow as any)[p] = value;

          return true;
        }

        if (process.env.NODE_ENV === 'development') {
          console.warn(`[qiankun] Set window.${p.toString()} while sandbox destroyed or inactive in ${name}!`);
        }

        // 在 strict-mode 下，Proxy 的 handler.set 返回 false 会抛出 TypeError，在沙箱卸载的情况下应该忽略错误
        return true;
      },

      get(_: Window, p: PropertyKey): any {
        // avoid who using window.window or window.self to escape the sandbox environment to touch the really window
        // or use window.top to check if an iframe context
        // see https://github.com/eligrey/FileSaver.js/blob/master/src/FileSaver.js#L13
        if (p === 'top' || p === 'parent' || p === 'window' || p === 'self') {
          return proxy;
        }

        // 直接从原生 window 对象拿数据
        const value = (rawWindow as any)[p];
        return getTargetValue(rawWindow, value);
      },

      // trap in operator
      // see https://github.com/styled-components/styled-components/blob/master/packages/styled-components/src/constants.js#L12
      has(_: Window, p: string | number | symbol): boolean {
        return p in rawWindow;
      },
    });

    this.proxy = proxy;
  }
}
