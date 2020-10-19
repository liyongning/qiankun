/**
 * @author Kuitos
 * @since 2020-05-15
 */

import { FrameworkLifeCycles } from '../interfaces';

// 返回三个生命周期方法，这三个方法负责在 global 对象上设置或删除 __POWERED_BY_QIANKUN__ 属性，微应用可以用该属性来验证自己是独立运行还是在 qiankun 框架上运行
export default function getAddOn(global: Window): FrameworkLifeCycles<any> {
  return {
    async beforeLoad() {
      // eslint-disable-next-line no-param-reassign
      global.__POWERED_BY_QIANKUN__ = true;
    },

    async beforeMount() {
      // eslint-disable-next-line no-param-reassign
      global.__POWERED_BY_QIANKUN__ = true;
    },

    async beforeUnmount() {
      // eslint-disable-next-line no-param-reassign
      delete global.__POWERED_BY_QIANKUN__;
    },
  };
}
