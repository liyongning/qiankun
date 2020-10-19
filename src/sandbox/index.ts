/**
 * @author Kuitos
 * @since 2019-04-11
 */
import { Freer, Rebuilder, SandBox } from '../interfaces';
import LegacySandbox from './legacy/sandbox';
import { patchAtBootstrapping, patchAtMounting } from './patchers';
import ProxySandbox from './proxySandbox';
import SnapshotSandbox from './snapshotSandbox';

export { css } from './patchers';

/**
 * 生成运行时沙箱，这个沙箱其实由两部分组成 => JS 沙箱（执行上下文）、样式沙箱
 *
 * @param appName 微应用名称
 * @param elementGetter getter 函数，通过该函数可以获取 <div id="__qiankun_microapp_wrapper_for_${appInstanceId}__" data-name="${appName}">${template}</div>
 * @param singular 是否单例模式
 * @param scopedCSS
 * @param excludeAssetFilter 指定部分特殊的动态加载的微应用资源（css/js) 不被 qiankun 劫持处理
 */
export function createSandbox(
  appName: string,
  elementGetter: () => HTMLElement | ShadowRoot,
  singular: boolean,
  scopedCSS: boolean,
  excludeAssetFilter?: (url: string) => boolean,
) {
  /**
   * JS 沙箱，通过 proxy 代理 window 对象，记录 window 对象上属性的增删改查，区别在于：
   *  单例模式直接代理了原生 window 对象，记录原生 window 对象的增删改查，当 window 对象激活时恢复 window 对象到上次即将失活时的状态，
   * 失活时恢复 window 对象到初始初始状态
   *  多例模式代理了一个全新的对象，这个对象是复制的 window 对象的一部分不可配置属性，所有的更改都是基于这个 fakeWindow 对象，从而保证多个实例
   * 之间属性互不影响
   * 后面会将 sandbox.proxy 作为微应用的全局对象，所有的操作都在这个 proxy 对象上，这就是 JS 沙箱的原理
   */
  let sandbox: SandBox;
  if (window.Proxy) {
    sandbox = singular ? new LegacySandbox(appName) : new ProxySandbox(appName);
  } else {
    // 不支持 proxy 的浏览器，通过 diff 方式实现的沙箱
    sandbox = new SnapshotSandbox(appName);
  }

  /**
   * 样式沙箱
   * 
   * 增强多例模式下的 createElement 方法，负责创建元素并劫持 script、link、style 三个标签的创建动作
   * 增强 appendChild、insertBefore 方法，负责添加元素，并劫持 script、link、style 三个标签的添加动作，做一些特殊的处理 => 
   * 根据是否是主应用调用决定标签是插入到主应用还是微应用，并且将 proxy 对象传递给微应用，作为其全局对象，以达到 JS 隔离的目的
   * 初始化完成后返回 free 函数，会在微应用卸载时被调用，负责清除 patch、缓存动态添加的样式（因为微应用被卸载后所有的相关DOM元素都会被删掉）
   * free 函数执行完成后返回 rebuild 函数，在微应用重新挂载时会被调用，负责向微应用添加刚才缓存的动态样式
   * 
   * 其实严格来说这个样式沙箱有点名不副实，真正的样式隔离是之前说的 严格样式隔离模式 和 scoped css模式 提供的，当然如果开启了 scoped css，
   * 样式沙箱中动态添加的样式也会经过 scoped css 的处理；回到正题，样式沙箱实际做的事情其实很简单，将动态添加的 script、link、style 
   * 这三个元素插入到对的位置，属于主应用的插入主应用，属于微应用的插入到对应的微应用中，方便微应用卸载的时候一起删除，
   * 当然样式沙箱还额外做了两件事：一、在卸载之前为动态添加样式做缓存，在微应用重新挂载时再插入到微应用内，二、将 proxy 对象传递给 execScripts
   * 函数，将其设置为微应用的执行上下文
   */
  const bootstrappingFreers = patchAtBootstrapping(
    appName,
    elementGetter,
    sandbox,
    singular,
    scopedCSS,
    excludeAssetFilter,
  );
  // mounting freers are one-off and should be re-init at every mounting time
  // mounting freers 是一次性的，应该在每次挂载时重新初始化
  let mountingFreers: Freer[] = [];

  let sideEffectsRebuilders: Rebuilder[] = [];

  return {
    proxy: sandbox.proxy,

    /**
     * 沙箱被 mount
     * 可能是从 bootstrap 状态进入的 mount
     * 也可能是从 unmount 之后再次唤醒进入 mount
     * mount 时重建副作用(rebuild 函数），即微应用在被卸载时希望重新挂载时做的一些事情，比如重建缓存的动态样式
     */
    async mount() {
      /* ------------------------------------------ 因为有上下文依赖（window），以下代码执行顺序不能变 ------------------------------------------ */

      /* ------------------------------------------ 1. 启动/恢复 沙箱------------------------------------------ */
      sandbox.active();

      const sideEffectsRebuildersAtBootstrapping = sideEffectsRebuilders.slice(0, bootstrappingFreers.length);
      const sideEffectsRebuildersAtMounting = sideEffectsRebuilders.slice(bootstrappingFreers.length);

      // must rebuild the side effects which added at bootstrapping firstly to recovery to nature state
      if (sideEffectsRebuildersAtBootstrapping.length) {
        // 微应用再次挂载时重建刚才缓存的动态样式
        sideEffectsRebuildersAtBootstrapping.forEach(rebuild => rebuild());
      }

      /* ------------------------------------------ 2. 开启全局变量补丁 ------------------------------------------*/
      // render 沙箱启动时开始劫持各类全局监听，尽量不要在应用初始化阶段有 事件监听/定时器 等副作用
      mountingFreers = patchAtMounting(appName, elementGetter, sandbox, singular, scopedCSS, excludeAssetFilter);

      /* ------------------------------------------ 3. 重置一些初始化时的副作用 ------------------------------------------*/
      // 存在 rebuilder 则表明有些副作用需要重建
      // 现在只看到针对 umi 的那个 patchHistoryListener 有 rebuild 操作
      if (sideEffectsRebuildersAtMounting.length) {
        sideEffectsRebuildersAtMounting.forEach(rebuild => rebuild());
      }

      // clean up rebuilders，卸载时会再填充回来
      sideEffectsRebuilders = [];
    },

    /**
     * 恢复 global 状态，使其能回到应用加载之前的状态
     */
    // 撤销初始化和挂载阶段打的 patch；缓存微应用希望自己再次被挂载时需要做的一些事情（rebuild），比如重建动态样式表；失活微应用
    async unmount() {
      // record the rebuilders of window side effects (event listeners or timers)
      // note that the frees of mounting phase are one-off as it will be re-init at next mounting
      // 卸载时，执行 free 函数，释放初始化和挂载时打的 patch，存储所有的 rebuild 函数，在微应用再次挂载时重建通过 patch 做的事情（副作用）
      sideEffectsRebuilders = [...bootstrappingFreers, ...mountingFreers].map(free => free());

      sandbox.inactive();
    },
  };
}
