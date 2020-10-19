import { noop } from 'lodash';
import { mountRootParcel, registerApplication, start as startSingleSpa } from 'single-spa';
import { FrameworkConfiguration, FrameworkLifeCycles, LoadableApp, MicroApp, RegistrableApp } from './interfaces';
import { loadApp } from './loader';
import { doPrefetchStrategy } from './prefetch';
import { Deferred, toArray } from './utils';

// 存放所有的微应用
let microApps: RegistrableApp[] = [];

// eslint-disable-next-line import/no-mutable-exports
export let frameworkConfiguration: FrameworkConfiguration = {};
const frameworkStartedDefer = new Deferred<void>();

/**
 * 注册微应用，基于路由配置
 * @param apps = [
 *  {
 *    name: 'react16',
 *    entry: '//localhost:7100',
 *    container: '#subapp-viewport',
 *    loader,
 *    activeRule: '/react16'
 *  },
 *  ...
 * ]
 * @param lifeCycles = { ...各个生命周期方法对象 }
 */
export function registerMicroApps<T extends object = {}>(
  apps: Array<RegistrableApp<T>>,
  lifeCycles?: FrameworkLifeCycles<T>,
) {
  // 防止微应用重复注册，得到所有没有被注册的微应用列表
  const unregisteredApps = apps.filter(app => !microApps.some(registeredApp => registeredApp.name === app.name));

  // 所有的微应用 = 已注册 + 未注册的(将要被注册的)
  microApps = [...microApps, ...unregisteredApps];

  // 注册每一个微应用
  unregisteredApps.forEach(app => {
    // 注册时提供的微应用基本信息
    const { name, activeRule, loader = noop, props, ...appConfig } = app;

    // 调用 single-spa 的 registerApplication 方法注册微应用
    registerApplication({
      // 微应用名称
      name,
      // 微应用的加载方法，Promise<生命周期方法组成的对象>
      app: async () => {
        // 加载微应用时主应用显示 loading 状态
        loader(true);
        // 这句可以忽略，目的是在 single-spa 执行这个加载方法时让出线程，让其它微应用的加载方法都开始执行
        await frameworkStartedDefer.promise;

        // 核心、精髓、难点所在，负责加载微应用，然后一大堆处理，返回 bootstrap、mount、unmount、update 这个几个生命周期
        const { mount, ...otherMicroAppConfigs } = await loadApp(
          // 微应用的配置信息
          { name, props, ...appConfig },
          // start 方法执行时设置的配置对象
          frameworkConfiguration,
          // 注册微应用时提供的全局生命周期对象
          lifeCycles,
        );

        return {
          mount: [async () => loader(true), ...toArray(mount), async () => loader(false)],
          ...otherMicroAppConfigs,
        };
      },
      // 微应用的激活条件
      activeWhen: activeRule,
      // 传递给微应用的 props
      customProps: props,
    });
  });
}

/**
 * 手动加载一个微应用，是通过 single-spa 的 mountRootParcel api 实现的，返回微应用实例
 * @param app = { name, entry, container, props }
 * @param configuration 配置对象
 * @param lifeCycles 还支持一个全局生命周期配置对象，这个参数官方文档没提到
 */
export function loadMicroApp<T extends object = {}>(
  app: LoadableApp<T>,
  configuration?: FrameworkConfiguration,
  lifeCycles?: FrameworkLifeCycles<T>,
): MicroApp {
  const { props } = app;
  // single-spa 的 mountRootParcel api
  return mountRootParcel(() => loadApp(app, configuration ?? frameworkConfiguration, lifeCycles), {
    domElement: document.createElement('div'),
    ...props,
  });
}

/**
 * 启动 qiankun
 * @param opts start 方法的配置对象 
 */
export function start(opts: FrameworkConfiguration = {}) {
  // qiankun 框架默认开启预加载、单例模式、样式沙箱
  frameworkConfiguration = { prefetch: true, singular: true, sandbox: true, ...opts };
  // 从这里可以看出 start 方法支持的参数不止官网文档说的那些，比如 urlRerouteOnly，这个是 single-spa 的 start 方法支持的
  const { prefetch, sandbox, singular, urlRerouteOnly, ...importEntryOpts } = frameworkConfiguration;

  // 预加载
  if (prefetch) {
    // 执行预加载策略，参数分别为微应用列表、预加载策略、{ fetch、getPublicPath、getTemplate }
    doPrefetchStrategy(microApps, prefetch, importEntryOpts);
  }

  // 样式沙箱
  if (sandbox) {
    if (!window.Proxy) {
      console.warn('[qiankun] Miss window.Proxy, proxySandbox will degenerate into snapshotSandbox');
      // 快照沙箱不支持非 singular 模式
      if (!singular) {
        console.error('[qiankun] singular is forced to be true when sandbox enable but proxySandbox unavailable');
        // 如果开启沙箱，会强制使用单例模式
        frameworkConfiguration.singular = true;
      }
    }
  }

  // 执行 single-spa 的 start 方法，启动 single-spa
  startSingleSpa({ urlRerouteOnly });

  frameworkStartedDefer.resolve();
}
