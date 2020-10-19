/**
 * @author Kuitos
 * @since 2019-02-26
 */

import { Entry, importEntry, ImportEntryOpts } from 'import-html-entry';
import { isFunction } from 'lodash';
import { getMountedApps } from 'single-spa';
import { AppMetadata, PrefetchStrategy } from './interfaces';

type RequestIdleCallbackHandle = any;
type RequestIdleCallbackOptions = {
  timeout: number;
};
type RequestIdleCallbackDeadline = {
  readonly didTimeout: boolean;
  timeRemaining: () => number;
};

declare global {
  interface Window {
    requestIdleCallback: (
      callback: (deadline: RequestIdleCallbackDeadline) => void,
      opts?: RequestIdleCallbackOptions,
    ) => RequestIdleCallbackHandle;
    cancelIdleCallback: (handle: RequestIdleCallbackHandle) => void;
  }

  interface Navigator {
    connection: {
      saveData: boolean;
      effectiveType: string;
      type: 'bluetooth' | 'cellular' | 'ethernet' | 'none' | 'wifi' | 'wimax' | 'other' | 'unknown';
    };
  }
}

// RIC and shim for browsers setTimeout() without it
const requestIdleCallback =
  window.requestIdleCallback ||
  function requestIdleCallback(cb: CallableFunction) {
    const start = Date.now();
    return setTimeout(() => {
      cb({
        didTimeout: false,
        timeRemaining() {
          return Math.max(0, 50 - (Date.now() - start));
        },
      });
    }, 1);
  };

// 判断是否为弱网环境
const isSlowNetwork = navigator.connection
  ? navigator.connection.saveData ||
    (navigator.connection.type !== 'wifi' &&
      navigator.connection.type !== 'ethernet' &&
      /(2|3)g/.test(navigator.connection.effectiveType))
  : false;

/**
 * prefetch assets, do nothing while in mobile network
 * 预加载静态资源，在移动网络下什么都不做
 * @param entry
 * @param opts
 */
function prefetch(entry: Entry, opts?: ImportEntryOpts): void {
  // 弱网环境下不执行预加载
  if (!navigator.onLine || isSlowNetwork) {
    // Don't prefetch if in a slow network or offline
    return;
  }

  // 通过时间切片的方式去加载静态资源，在浏览器空闲时去执行回调函数，避免浏览器卡顿
  requestIdleCallback(async () => {
    // 得到加载静态资源的函数
    const { getExternalScripts, getExternalStyleSheets } = await importEntry(entry, opts);
    // 样式
    requestIdleCallback(getExternalStyleSheets);
    // js 脚本
    requestIdleCallback(getExternalScripts);
  });
}

/**
 * 在第一个微应用挂载之后开始加载 apps 中指定的微应用的静态资源
 * 通过监听 single-spa 提供的 single-spa:first-mount 事件来实现，该事件在第一个微应用挂载以后会被触发
 * @param apps 需要被预加载静态资源的微应用列表，[{ name, entry }, ...]
 * @param opts = { fetch , getPublicPath, getTemplate }
 */
function prefetchAfterFirstMounted(apps: AppMetadata[], opts?: ImportEntryOpts): void {
  // 监听 single-spa:first-mount 事件
  window.addEventListener('single-spa:first-mount', function listener() {
    // 已挂载的微应用
    const mountedApps = getMountedApps();
    // 从预加载的微应用列表中过滤出未挂载的微应用
    const notMountedApps = apps.filter(app => mountedApps.indexOf(app.name) === -1);

    // 开发环境打印日志，已挂载的微应用和未挂载的微应用分别有哪些
    if (process.env.NODE_ENV === 'development') {
      console.log(`[qiankun] prefetch starting after ${mountedApps} mounted...`, notMountedApps);
    }

    // 循环加载微应用的静态资源
    notMountedApps.forEach(({ entry }) => prefetch(entry, opts));

    // 移除 single-spa:first-mount 事件
    window.removeEventListener('single-spa:first-mount', listener);
  });
}

/**
 * 在执行 start 启动 qiankun 之后立即预加载所有微应用的静态资源
 * @param apps 需要被预加载静态资源的微应用列表，[{ name, entry }, ...]
 * @param opts = { fetch , getPublicPath, getTemplate }
 */
export function prefetchImmediately(apps: AppMetadata[], opts?: ImportEntryOpts): void {
  // 开发环境打印日志
  if (process.env.NODE_ENV === 'development') {
    console.log('[qiankun] prefetch starting for apps...', apps);
  }

  // 加载所有微应用的静态资源
  apps.forEach(({ entry }) => prefetch(entry, opts));
}

/**
 * 执行预加载策略，qiankun 支持四种
 * @param apps 所有的微应用 
 * @param prefetchStrategy 预加载策略，四种 =》 
 *  1、true，第一个微应用挂载以后加载其它微应用的静态资源，利用的是 single-spa 提供的 single-spa:first-mount 事件来实现的
 *  2、string[]，微应用名称数组，在第一个微应用挂载以后加载指定的微应用的静态资源
 *  3、all，主应用执行 start 以后就直接开始预加载所有微应用的静态资源
 *  4、自定义函数，返回两个微应用组成的数组，一个是关键微应用组成的数组，需要马上就执行预加载的微应用，一个是普通的微应用组成的数组，在第一个微应用挂载以后预加载这些微应用的静态资源
 * @param importEntryOpts = { fetch, getPublicPath, getTemplate }
 */
export function doPrefetchStrategy(
  apps: AppMetadata[],
  prefetchStrategy: PrefetchStrategy,
  importEntryOpts?: ImportEntryOpts,
) {
  // 定义函数，函数接收一个微应用名称组成的数组，然后从微应用列表中返回这些名称所对应的微应用，最后得到一个数组[{name, entry}, ...]
  const appsName2Apps = (names: string[]): AppMetadata[] => apps.filter(app => names.includes(app.name));

  if (Array.isArray(prefetchStrategy)) {
    // 说明加载策略是一个数组，当第一个微应用挂载之后开始加载数组内由用户指定的微应用资源，数组内的每一项表示一个微应用的名称
    prefetchAfterFirstMounted(appsName2Apps(prefetchStrategy as string[]), importEntryOpts);
  } else if (isFunction(prefetchStrategy)) {
    // 加载策略是一个自定义的函数，可完全自定义应用资源的加载时机（首屏应用、次屏应用)
    (async () => {
      // critical rendering apps would be prefetch as earlier as possible，关键的应用程序应该尽可能早的预取
      // 执行加载策略函数，函数会返回两个数组，一个关键的应用程序数组，会立即执行预加载动作，另一个是在第一个微应用挂载以后执行微应用静态资源的预加载
      const { criticalAppNames = [], minorAppsName = [] } = await prefetchStrategy(apps);
      // 立即预加载这些关键微应用程序的静态资源
      prefetchImmediately(appsName2Apps(criticalAppNames), importEntryOpts);
      // 当第一个微应用挂载以后预加载这些微应用的静态资源
      prefetchAfterFirstMounted(appsName2Apps(minorAppsName), importEntryOpts);
    })();
  } else {
    // 加载策略是默认的 true 或者 all
    switch (prefetchStrategy) {
      case true:
        // 第一个微应用挂载之后开始加载其它微应用的静态资源
        prefetchAfterFirstMounted(apps, importEntryOpts);
        break;

      case 'all':
        // 在主应用执行 start 以后就开始加载所有微应用的静态资源
        prefetchImmediately(apps, importEntryOpts);
        break;

      default:
        break;
    }
  }
}
