/**
 * @author Kuitos
 * @since 2020-03-02
 */

import { concat, mergeWith } from 'lodash';
import { FrameworkLifeCycles } from '../interfaces';

import getRuntimePublicPathAddOn from './runtimePublicPath';
import getEngineFlagAddon from './engineFlag';

// 在生命周期函数中设置和管理 global.__POWERED_BY_QIANKUN__ 和 global.__INJECTED_PUBLIC_PATH_BY_QIANKUN__
export default function getAddOns<T extends object>(global: Window, publicPath: string): FrameworkLifeCycles<T> {
  return mergeWith({}, getEngineFlagAddon(global), getRuntimePublicPathAddOn(global, publicPath), (v1, v2) =>
    concat(v1 ?? [], v2 ?? []),
  );
}
