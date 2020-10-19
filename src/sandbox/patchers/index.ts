/**
 * @author Kuitos
 * @since 2019-04-11
 */

import { Freer, SandBox, SandBoxType } from '../../interfaces';
import patchDynamicAppend from './dynamicAppend';
import patchHistoryListener from './historyListener';
import patchInterval from './interval';
import patchWindowListener from './windowListener';

import * as css from './css';

export function patchAtMounting(
  appName: string,
  elementGetter: () => HTMLElement | ShadowRoot,
  sandbox: SandBox,
  singular: boolean,
  scopedCSS: boolean,
  excludeAssetFilter?: Function,
): Freer[] {
  const basePatchers = [
    // 定时器 patch
    () => patchInterval(sandbox.proxy),
    // 事件监听 patch
    () => patchWindowListener(sandbox.proxy),
    // fix umi bug
    () => patchHistoryListener(),
    // 初始化阶段时的那个 patch
    () => patchDynamicAppend(appName, elementGetter, sandbox.proxy, true, singular, scopedCSS, excludeAssetFilter),
  ];

  const patchersInSandbox = {
    [SandBoxType.LegacyProxy]: [...basePatchers],
    [SandBoxType.Proxy]: [...basePatchers],
    [SandBoxType.Snapshot]: basePatchers,
  };

  return patchersInSandbox[sandbox.type]?.map(patch => patch());
}

/**
 * 初始化阶段给 createElement、appendChild、insertBefore 三个方法打一个 patch
 * @param appName 
 * @param elementGetter 
 * @param sandbox 
 * @param singular 
 * @param scopedCSS 
 * @param excludeAssetFilter 
 */
export function patchAtBootstrapping(
  appName: string,
  elementGetter: () => HTMLElement | ShadowRoot,
  sandbox: SandBox,
  singular: boolean,
  scopedCSS: boolean,
  excludeAssetFilter?: Function,
): Freer[] {
  // 基础 patch，增强 createElement、appendChild、insertBefore 三个方法
  const basePatchers = [
    () => patchDynamicAppend(appName, elementGetter, sandbox.proxy, false, singular, scopedCSS, excludeAssetFilter),
  ];

  // 每一种沙箱都需要打基础 patch
  const patchersInSandbox = {
    [SandBoxType.LegacyProxy]: basePatchers,
    [SandBoxType.Proxy]: basePatchers,
    [SandBoxType.Snapshot]: basePatchers,
  };

  // 返回一个数组，数组元素是 patch 的执行结果 => free 函数
  return patchersInSandbox[sandbox.type]?.map(patch => patch());
}

export { css };
