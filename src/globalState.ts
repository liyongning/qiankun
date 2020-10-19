/**
 * @author dbkillerf6
 * @since 2020-04-10
 */

import { cloneDeep } from 'lodash';
import { OnGlobalStateChangeCallback, MicroAppStateActions } from './interfaces';

let globalState: Record<string, any> = {};

const deps: Record<string, OnGlobalStateChangeCallback> = {};

// 触发全局监听，执行所有应用注册的回调函数
function emitGlobal(state: Record<string, any>, prevState: Record<string, any>) {
  // 循环遍历，执行所有应用注册的回调函数
  Object.keys(deps).forEach((id: string) => {
    if (deps[id] instanceof Function) {
      deps[id](cloneDeep(state), cloneDeep(prevState));
    }
  });
}

/**
 * 定义全局状态，并返回通信方法，一般由主应用调用，微应用通过 props 获取通信方法。 
 * @param state 全局状态，{ key: value }
 */
export function initGlobalState(state: Record<string, any> = {}) {
  if (state === globalState) {
    console.warn('[qiankun] state has not changed！');
  } else {
    // 方法有可能被重复调用，将已有的全局状态克隆一份，为空则是第一次调用 initGlobalState 方法，不为空则非第一次次调用
    const prevGlobalState = cloneDeep(globalState);
    // 将传递的状态克隆一份赋值为 globalState
    globalState = cloneDeep(state);
    // 触发全局监听，当然在这个位置调用，正常情况下没啥反应，因为现在还没有应用注册回调函数
    emitGlobal(globalState, prevGlobalState);
  }
  // 返回通信方法，参数表示应用 id，true 表示自己是主应用调用
  return getMicroAppStateActions(`global-${+new Date()}`, true);
}

/**
 * 返回通信方法 
 * @param id 应用 id
 * @param isMaster 表明调用的应用是否为主应用，在主应用初始化全局状态时，initGlobalState 内部调用该方法时会传递 true，其它都为 false
 */
export function getMicroAppStateActions(id: string, isMaster?: boolean): MicroAppStateActions {
  return {
    /**
     * 全局依赖监听，为指定应用（id = 应用id）注册回调函数
     * 依赖数据结构为：
     * {
     *   {id}: callback
     * }
     *
     * @param callback 注册的回调函数
     * @param fireImmediately 是否立即执行回调
     */
    onGlobalStateChange(callback: OnGlobalStateChangeCallback, fireImmediately?: boolean) {
      // 回调函数必须为 function
      if (!(callback instanceof Function)) {
        console.error('[qiankun] callback must be function!');
        return;
      }
      // 如果回调函数已经存在，重复注册时给出覆盖提示信息
      if (deps[id]) {
        console.warn(`[qiankun] '${id}' global listener already exists before this, new listener will overwrite it.`);
      }
      // id 为一个应用 id，一个应用对应一个回调
      deps[id] = callback;
      // 克隆全局状态
      const cloneState = cloneDeep(globalState);
      // 如果需要，立即出发回调执行
      if (fireImmediately) {
        callback(cloneState, cloneState);
      }
    },

    /**
     * setGlobalState 更新 store 数据
     *
     * 1. 对新输入 state 的第一层属性做校验，如果是主应用则可以添加新的一级属性进来，也可以更新已存在的一级属性，
     *    如果是微应用，则只能更新已存在的一级属性，不可以新增一级属性
     * 2. 触发全局监听，执行所有应用注册的回调函数，以达到应用间通信的目的
     *
     * @param state 新的全局状态
     */
    setGlobalState(state: Record<string, any> = {}) {
      if (state === globalState) {
        console.warn('[qiankun] state has not changed！');
        return false;
      }

      // 记录旧的全局状态中被改变的 key
      const changeKeys: string[] = [];
      // 旧的全局状态
      const prevGlobalState = cloneDeep(globalState);
      globalState = cloneDeep(
        // 循环遍历新状态中的所有 key
        Object.keys(state).reduce((_globalState, changeKey) => {
          if (isMaster || _globalState.hasOwnProperty(changeKey)) {
            // 主应用 或者 旧的全局状态存在该 key 时才进来，说明只有主应用才可以新增属性，微应用只可以更新已存在的属性值，且不论主应用微应用只能更新一级属性
            // 记录被改变的key
            changeKeys.push(changeKey);
            // 更新旧状态中对应的 key value
            return Object.assign(_globalState, { [changeKey]: state[changeKey] });
          }
          console.warn(`[qiankun] '${changeKey}' not declared when init state！`);
          return _globalState;
        }, globalState),
      );
      if (changeKeys.length === 0) {
        console.warn('[qiankun] state has not changed！');
        return false;
      }
      // 触发全局监听
      emitGlobal(globalState, prevGlobalState);
      return true;
    },

    // 注销该应用下的依赖
    offGlobalStateChange() {
      delete deps[id];
      return true;
    },
  };
}
