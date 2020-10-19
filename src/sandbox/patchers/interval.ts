/* eslint-disable no-param-reassign */
/**
 * @author Kuitos
 * @since 2019-04-11
 */

import { noop } from 'lodash';

const rawWindowInterval = window.setInterval;
const rawWindowClearInterval = window.clearInterval;

/**
 * 定时器 patch，设置定时器时自动记录定时器 id，清除定时器时自动删除已清除的定时器 id，释放 patch 时自动清除所有未被清除的定时器，并恢复定时器方法
 * @param global = windowProxy
 */
export default function patch(global: Window) {
  let intervals: number[] = [];

  // 清除定时器，并从 intervals 中清除已经清除的 定时器 id
  global.clearInterval = (intervalId: number) => {
    intervals = intervals.filter(id => id !== intervalId);
    return rawWindowClearInterval(intervalId);
  };

  // 设置定时器，并记录定时器的 id
  global.setInterval = (handler: Function, timeout?: number, ...args: any[]) => {
    const intervalId = rawWindowInterval(handler, timeout, ...args);
    intervals = [...intervals, intervalId];
    return intervalId;
  };

  // 清除所有的定时器，并恢复定时器方法
  return function free() {
    intervals.forEach(id => global.clearInterval(id));
    global.setInterval = rawWindowInterval;
    global.clearInterval = rawWindowClearInterval;

    return noop;
  };
}
