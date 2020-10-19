/* eslint-disable no-param-reassign */
/**
 * @author Kuitos
 * @since 2019-04-11
 */

import { noop } from 'lodash';

const rawAddEventListener = window.addEventListener;
const rawRemoveEventListener = window.removeEventListener;

/**
 * 监听器 patch，添加事件监听时自动记录事件的回调函数，移除时自动删除事件的回调函数，释放 patch 时自动删除所有的事件监听，并恢复监听函数
 * @param global windowProxy
 */
export default function patch(global: WindowProxy) {
  // 记录各个事件的回调函数
  const listenerMap = new Map<string, EventListenerOrEventListenerObject[]>();

  // 设置监听器
  global.addEventListener = (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) => {
    // 从 listenerMap 中获取已经存在的该事件的回调函数
    const listeners = listenerMap.get(type) || [];
    // 保存该事件的所有回调函数
    listenerMap.set(type, [...listeners, listener]);
    // 设置监听
    return rawAddEventListener.call(window, type, listener, options);
  };

  // 移除监听器
  global.removeEventListener = (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) => {
    // 从 listenerMap 中移除该事件的指定回调函数
    const storedTypeListeners = listenerMap.get(type);
    if (storedTypeListeners && storedTypeListeners.length && storedTypeListeners.indexOf(listener) !== -1) {
      storedTypeListeners.splice(storedTypeListeners.indexOf(listener), 1);
    }
    // 移除事件监听
    return rawRemoveEventListener.call(window, type, listener, options);
  };

  // 释放 patch，移除所有的事件监听
  return function free() {
    // 移除所有的事件监听
    listenerMap.forEach((listeners, type) =>
      [...listeners].forEach(listener => global.removeEventListener(type, listener)),
    );
    // 恢复监听函数
    global.addEventListener = rawAddEventListener;
    global.removeEventListener = rawRemoveEventListener;

    return noop;
  };
}
