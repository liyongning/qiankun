/**
 * @author Kuitos
 * @since 2020-04-01
 */

import { importEntry } from 'import-html-entry';
import { concat, mergeWith, forEach } from 'lodash';
import { LifeCycles, ParcelConfigObject } from 'single-spa';
import getAddOns from './addons';
import { getMicroAppStateActions } from './globalState';
import { FrameworkConfiguration, FrameworkLifeCycles, HTMLContentRender, LifeCycleFn, LoadableApp } from './interfaces';
import { createSandbox, css } from './sandbox';
import {
  Deferred,
  getDefaultTplWrapper,
  getWrapperId,
  performanceMark,
  performanceMeasure,
  toArray,
  validateExportLifecycle,
  isEnableScopedCSS,
} from './utils';

function assertElementExist(element: Element | null | undefined, msg?: string) {
  if (!element) {
    if (msg) {
      throw new Error(msg);
    }

    throw new Error('[qiankun] element not existed!');
  }
}

function execHooksChain<T extends object>(
  hooks: Array<LifeCycleFn<T>>,
  app: LoadableApp<T>,
  global = window,
): Promise<any> {
  if (hooks.length) {
    return hooks.reduce((chain, hook) => chain.then(() => hook(app, global)), Promise.resolve());
  }

  return Promise.resolve();
}

async function validateSingularMode<T extends object>(
  validate: FrameworkConfiguration['singular'],
  app: LoadableApp<T>,
): Promise<boolean> {
  return typeof validate === 'function' ? validate(app) : !!validate;
}

// @ts-ignore
const supportShadowDOM = document.head.attachShadow || document.head.createShadowRoot;
/**
 * 做了两件事
 *  1、将 appContent 由字符串模版转换成 html dom 元素
 *  2、如果需要开启严格样式隔离，则将 appContent 的子元素即微应用的入口模版用 shadow dom 包裹起来，达到样式严格隔离的目的
 * @param appContent = `<div id="__qiankun_microapp_wrapper_for_${appInstanceId}__" data-name="${appName}">${template}</div>`
 * @param strictStyleIsolation 是否开启严格样式隔离
 */
function createElement(appContent: string, strictStyleIsolation: boolean): HTMLElement {
  // 创建一个 div 元素
  const containerElement = document.createElement('div');
  // 将字符串模版 appContent 设置为 div 的子与阿苏
  containerElement.innerHTML = appContent;
  // appContent always wrapped with a singular div，appContent 由模版字符串变成了 DOM 元素
  const appElement = containerElement.firstChild as HTMLElement;
  // 如果开启了严格的样式隔离，则将 appContent 的子元素（微应用的入口模版）用 shadow dom 包裹，以达到微应用之间样式严格隔离的目的
  if (strictStyleIsolation) {
    if (!supportShadowDOM) {
      console.warn(
        '[qiankun]: As current browser not support shadow dom, your strictStyleIsolation configuration will be ignored!',
      );
    } else {
      const { innerHTML } = appElement;
      appElement.innerHTML = '';
      let shadow: ShadowRoot;

      if (appElement.attachShadow) {
        shadow = appElement.attachShadow({ mode: 'open' });
      } else {
        // createShadowRoot was proposed in initial spec, which has then been deprecated
        shadow = (appElement as any).createShadowRoot();
      }
      shadow.innerHTML = innerHTML;
    }
  }

  return appElement;
}

/** generate app wrapper dom getter */
function getAppWrapperGetter(
  appName: string,
  appInstanceId: string,
  useLegacyRender: boolean,
  strictStyleIsolation: boolean,
  enableScopedCSS: boolean,
  elementGetter: () => HTMLElement | null,
) {
  return () => {
    if (useLegacyRender) {
      if (strictStyleIsolation) throw new Error('[qiankun]: strictStyleIsolation can not be used with legacy render!');
      if (enableScopedCSS) throw new Error('[qiankun]: experimentalStyleIsolation can not be used with legacy render!');

      const appWrapper = document.getElementById(getWrapperId(appInstanceId));
      assertElementExist(
        appWrapper,
        `[qiankun] Wrapper element for ${appName} with instance ${appInstanceId} is not existed!`,
      );
      return appWrapper!;
    }

    const element = elementGetter();
    assertElementExist(
      element,
      `[qiankun] Wrapper element for ${appName} with instance ${appInstanceId} is not existed!`,
    );

    if (enableScopedCSS) {
      const attr = element!.getAttribute(css.QiankunCSSRewriteAttr);
      if (!attr) {
        element!.setAttribute(css.QiankunCSSRewriteAttr, appName);
      }
    }

    if (strictStyleIsolation) {
      return element!.shadowRoot!;
    }

    return element!;
  };
}

const rawAppendChild = HTMLElement.prototype.appendChild;
const rawRemoveChild = HTMLElement.prototype.removeChild;
type ElementRender = (
  props: { element: HTMLElement | null; loading: boolean },
  phase: 'loading' | 'mounting' | 'mounted' | 'unmounted',
) => any;

/**
 * Get the render function
 * If the legacy render function is provide, used as it, otherwise we will insert the app element to target container by qiankun
 * 返回一个 render 函数
 * 如果 legacyRender 存在，即用户提供了 render 函数，则使用这个 render 函数，否则将 element 元素插入到容器节点
 * @param appName
 * @param appContent
 * @param container
 * @param legacyRender
 */
function getRender(
  appName: string,
  appContent: string,
  container?: string | HTMLElement,
  legacyRender?: HTMLContentRender,
) {
  const render: ElementRender = ({ element, loading }, phase) => {
    // legacyRender 函数存在，则使用这个 render 函数
    if (legacyRender) {
      // 开发环境提示用户 render 函数这种方式已经被弃用，改用 container 的方式
      if (process.env.NODE_ENV === 'development') {
        console.warn(
          '[qiankun] Custom rendering function is deprecated, you can use the container element setting instead!',
        );
      }

      return legacyRender({ loading, appContent: element ? appContent : '' });
    }

    // 容器节点
    const containerElement = typeof container === 'string' ? document.querySelector(container) : container;

    // The container might have be removed after micro app unmounted.
    // Such as the micro app unmount lifecycle called by a react componentWillUnmount lifecycle, after micro app unmounted, the react component might also be removed
    // 也就是说容器节点可能有不存在（被删除）的情况，在非 unmounted 阶段断言容器节点存在，不存在则报错
    if (phase !== 'unmounted') {
      const errorMsg = (() => {
        switch (phase) {
          case 'loading':
          case 'mounting':
            return `[qiankun] Target container with ${container} not existed while ${appName} ${phase}!`;

          case 'mounted':
            return `[qiankun] Target container with ${container} not existed after ${appName} ${phase}!`;

          default:
            return `[qiankun] Target container with ${container} not existed while ${appName} rendering!`;
        }
      })();
      assertElementExist(containerElement, errorMsg);
    }

    // 将 element 整个放入容器节点
    if (containerElement && !containerElement.contains(element)) {
      // clear the container
      while (containerElement!.firstChild) {
        rawRemoveChild.call(containerElement, containerElement!.firstChild);
      }

      // append the element to container if it exist
      if (element) {
        rawAppendChild.call(containerElement, element);
      }
    }

    return undefined;
  };

  return render;
}

function getLifecyclesFromExports(scriptExports: LifeCycles<any>, appName: string, global: WindowProxy) {
  if (validateExportLifecycle(scriptExports)) {
    return scriptExports;
  }

  if (process.env.NODE_ENV === 'development') {
    console.warn(
      `[qiankun] lifecycle not found from ${appName} entry exports, fallback to get from window['${appName}']`,
    );
  }

  // fallback to global variable who named with ${appName} while module exports not found
  const globalVariableExports = (global as any)[appName];

  if (validateExportLifecycle(globalVariableExports)) {
    return globalVariableExports;
  }

  throw new Error(`[qiankun] You need to export lifecycle functions in ${appName} entry`);
}

let prevAppUnmountedDeferred: Deferred<void>;

/**
 * 完成了以下几件事：
 *  1、通过 HTML Entry 的方式远程加载微应用，得到微应用的 html 模版（首屏内容）、JS 脚本执行器、静态经资源路径
 *  2、样式隔离，shadow DOM 或者 scoped css 两种方式
 *  3、渲染微应用
 *  4、运行时沙箱，JS 沙箱、样式沙箱
 *  5、合并沙箱传递出来的 生命周期方法、用户传递的生命周期方法、框架内置的生命周期方法，将这些生命周期方法统一整理，导出一个生命周期对象，
 * 供 single-spa 的 registerApplication 方法使用，这个对象就相当于使用 single-spa 时你的微应用导出的那些生命周期方法，只不过 qiankun
 * 额外填了一些生命周期方法，做了一些事情
 *  6、给微应用注册通信方法并返回通信方法，然后会将通信方法通过 props 注入到微应用
 * @param app 微应用配置对象
 * @param configuration start 方法执行时设置的配置对象 
 * @param lifeCycles 注册微应用时提供的全局生命周期对象
 */
export async function loadApp<T extends object>(
  app: LoadableApp<T>,
  configuration: FrameworkConfiguration = {},
  lifeCycles?: FrameworkLifeCycles<T>,
): Promise<ParcelConfigObject> {
  // 微应用的入口和名称
  const { entry, name: appName } = app;
  // 实例 id
  const appInstanceId = `${appName}_${+new Date()}_${Math.floor(Math.random() * 1000)}`;

  // 下面这个不用管，就是生成一个标记名称，然后使用该名称在浏览器性能缓冲器中设置一个时间戳，可以用来度量程序的执行时间，performance.mark、performance.measure
  const markName = `[qiankun] App ${appInstanceId} Loading`;
  if (process.env.NODE_ENV === 'development') {
    performanceMark(markName);
  }

  // 配置信息
  const { singular = false, sandbox = true, excludeAssetFilter, ...importEntryOpts } = configuration;

  /**
   * 获取微应用的入口 html 内容和脚本执行器
   * template 是 link 替换为 style 后的 template
   * execScript 是 让 JS 代码(scripts)在指定 上下文 中运行
   * assetPublicPath 是静态资源地址
   */
  const { template, execScripts, assetPublicPath } = await importEntry(entry, importEntryOpts);

  // single-spa 的限制，加载、初始化和卸载不能同时进行，必须等卸载完成以后才可以进行加载，这个 promise 会在微应用卸载完成后被 resolve，在后面可以看到
  if (await validateSingularMode(singular, app)) {
    await (prevAppUnmountedDeferred && prevAppUnmountedDeferred.promise);
  }

  // --------------- 样式隔离 ---------------
  // 是否严格样式隔离
  const strictStyleIsolation = typeof sandbox === 'object' && !!sandbox.strictStyleIsolation;
  // 实验性的样式隔离，后面就叫 scoped css，和严格样式隔离不能同时开启，如果开启了严格样式隔离，则 scoped css 就为 false，强制关闭
  const enableScopedCSS = isEnableScopedCSS(configuration);

  // 用一个容器元素包裹微应用入口 html 模版, appContent = `<div id="__qiankun_microapp_wrapper_for_${appInstanceId}__" data-name="${appName}">${template}</div>`
  const appContent = getDefaultTplWrapper(appInstanceId, appName)(template);
  // 将 appContent 有字符串模版转换为 html dom 元素，如果需要开启样式严格隔离，则将 appContent 的子元素即微应用入口模版用 shadow dom 包裹起来，以达到样式严格隔离的目的
  let element: HTMLElement | null = createElement(appContent, strictStyleIsolation);
  // 通过 scoped css 的方式隔离样式，从这里也就能看出官方为什么说：
  // 在目前的阶段，该功能还不支持动态的、使用 <link />标签来插入外联的样式，但考虑在未来支持这部分场景
  // 在现阶段只处理 style 这种内联标签的情况 
  if (element && isEnableScopedCSS(configuration)) {
    const styleNodes = element.querySelectorAll('style') || [];
    forEach(styleNodes, (stylesheetElement: HTMLStyleElement) => {
      css.process(element!, stylesheetElement, appName);
    });
  }

  // --------------- 渲染微应用 ---------------
  // 主应用装载微应用的容器节点
  const container = 'container' in app ? app.container : undefined;
  // 这个是 1.x 版本遗留下来的实现，如果提供了 render 函数，当微应用需要被激活时就执行 render 函数渲染微应用，新版本用的 container，弃了 render
  // 而且 legacyRender 和 strictStyleIsolation、scoped css 不兼容
  const legacyRender = 'render' in app ? app.render : undefined;

  // 返回一个 render 函数，这个 render 函数要不使用用户传递的 render 函数，要不将 element 插入到 container
  const render = getRender(appName, appContent, container, legacyRender);

  // 渲染微应用到容器节点，并显示 loading 状态
  render({ element, loading: true }, 'loading');

  // 得到一个 getter 函数，通过该函数可以获取 <div id="__qiankun_microapp_wrapper_for_${appInstanceId}__" data-name="${appName}">${template}</div>
  const containerGetter = getAppWrapperGetter(
    appName,
    appInstanceId,
    !!legacyRender,
    strictStyleIsolation,
    enableScopedCSS,
    () => element,
  );

  // --------------- 运行时沙箱 ---------------
  // 保证每一个微应用运行在一个干净的环境中（JS 执行上下文独立、应用间不会发生样式污染）
  let global = window;
  let mountSandbox = () => Promise.resolve();
  let unmountSandbox = () => Promise.resolve();
  if (sandbox) {
    /**
     * 生成运行时沙箱，这个沙箱其实由两部分组成 => JS 沙箱（执行上下文）、样式沙箱
     * 
     * 沙箱返回 window 的代理对象 proxy 和 mount、unmount 两个方法
     * unmount 方法会让微应用失活，恢复被增强的原生方法，并记录一堆 rebuild 函数，这个函数是微应用卸载时希望自己被重新挂载时要做的一些事情，比如动态样式表重建（卸载时会缓存）
     * mount 方法会执行一些一些 patch 动作，恢复原生方法的增强功能，并执行 rebuild 函数，将微应用恢复到卸载时的状态，当然从初始化状态进入挂载状态就没有恢复一说了
     */
    const sandboxInstance = createSandbox(
      appName,
      containerGetter,
      Boolean(singular),
      enableScopedCSS,
      excludeAssetFilter,
    );
    // 用沙箱的代理对象作为接下来使用的全局对象
    global = sandboxInstance.proxy as typeof window;
    mountSandbox = sandboxInstance.mount;
    unmountSandbox = sandboxInstance.unmount;
  }

  // 合并用户传递的生命周期对象和 qiankun 框架内置的生命周期对象
  const { beforeUnmount = [], afterUnmount = [], afterMount = [], beforeMount = [], beforeLoad = [] } = mergeWith(
    {},
    // 返回内置生命周期对象，global.__POWERED_BY_QIANKUN__ 和 global.__INJECTED_PUBLIC_PATH_BY_QIANKUN__ 的设置就是在内置的生命周期对象中设置的
    getAddOns(global, assetPublicPath),
    lifeCycles,
    (v1, v2) => concat(v1 ?? [], v2 ?? []),
  );

  await execHooksChain(toArray(beforeLoad), app, global);

  // get the lifecycle hooks from module exports，获取微应用暴露出来的生命周期函数
  const scriptExports: any = await execScripts(global, !singular);
  const { bootstrap, mount, unmount, update } = getLifecyclesFromExports(scriptExports, appName, global);

  // 给微应用注册通信方法并返回通信方法，然后会将通信方法通过 props 注入到微应用
  const {
    onGlobalStateChange,
    setGlobalState,
    offGlobalStateChange,
  }: Record<string, Function> = getMicroAppStateActions(appInstanceId);

  const parcelConfig: ParcelConfigObject = {
    name: appInstanceId,
    bootstrap,
    // 挂载阶段需要执行的一系列方法
    mount: [
      // 性能度量，不用管
      async () => {
        if (process.env.NODE_ENV === 'development') {
          const marks = performance.getEntriesByName(markName, 'mark');
          // mark length is zero means the app is remounting
          if (!marks.length) {
            performanceMark(markName);
          }
        }
      },
      // 单例模式需要等微应用卸载完成以后才能执行挂载任务，promise 会在微应用卸载完以后 resolve
      async () => {
        if ((await validateSingularMode(singular, app)) && prevAppUnmountedDeferred) {
          return prevAppUnmountedDeferred.promise;
        }

        return undefined;
      },
      // 添加 mount hook, 确保每次应用加载前容器 dom 结构已经设置完毕
      async () => {
        // element would be destroyed after unmounted, we need to recreate it if it not exist
        // unmount 阶段会置空，这里重新生成
        element = element || createElement(appContent, strictStyleIsolation);
        // 渲染微应用到容器节点，并显示 loading 状态
        render({ element, loading: true }, 'mounting');
      },
      // 运行时沙箱导出的 mount
      mountSandbox,
      // exec the chain after rendering to keep the behavior with beforeLoad
      async () => execHooksChain(toArray(beforeMount), app, global),
      // 向微应用的 mount 生命周期函数传递参数，比如微应用中使用的 props.onGlobalStateChange 方法
      async props => mount({ ...props, container: containerGetter(), setGlobalState, onGlobalStateChange }),
      // 应用 mount 完成后结束 loading
      async () => render({ element, loading: false }, 'mounted'),
      async () => execHooksChain(toArray(afterMount), app, global),
      // initialize the unmount defer after app mounted and resolve the defer after it unmounted
      // 微应用挂载完成以后初始化这个 promise，并且在微应用卸载以后 resolve 这个 promise
      async () => {
        if (await validateSingularMode(singular, app)) {
          prevAppUnmountedDeferred = new Deferred<void>();
        }
      },
      // 性能度量，不用管
      async () => {
        if (process.env.NODE_ENV === 'development') {
          const measureName = `[qiankun] App ${appInstanceId} Loading Consuming`;
          performanceMeasure(measureName, markName);
        }
      },
    ],
    // 卸载微应用
    unmount: [
      async () => execHooksChain(toArray(beforeUnmount), app, global),
      // 执行微应用的 unmount 生命周期函数
      async props => unmount({ ...props, container: containerGetter() }),
      // 沙箱导出的 unmount 方法
      unmountSandbox,
      async () => execHooksChain(toArray(afterUnmount), app, global),
      // 显示 loading 状态、移除微应用的状态监听、置空 element
      async () => {
        render({ element: null, loading: false }, 'unmounted');
        offGlobalStateChange(appInstanceId);
        // for gc
        element = null;
      },
      // 微应用卸载以后 resolve 这个 promise，框架就可以进行后续的工作，比如加载或者挂载其它微应用
      async () => {
        if ((await validateSingularMode(singular, app)) && prevAppUnmountedDeferred) {
          prevAppUnmountedDeferred.resolve();
        }
      },
    ],
  };

  // 微应用有可能定义 update 方法
  if (typeof update === 'function') {
    parcelConfig.update = update;
  }

  return parcelConfig;
}
