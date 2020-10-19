/**
 * 在入口文件中使用 ES6 模块导入，则在导入后对 __webpack_public_path__ 进行赋值。
 * 在这种情况下，必须将公共路径(public path)赋值移至专属模块，然后将其在最前面导入
 */

// qiankun 设置的全局变量，表示应用作为微应用在运行
if (window.__POWERED_BY_QIANKUN__) {
  // eslint-disable-next-line no-undef
  __webpack_public_path__ = window.__INJECTED_PUBLIC_PATH_BY_QIANKUN__;
}
