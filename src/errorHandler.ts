/**
 * @author Kuitos
 * @since 2020-02-21
 */

/**
 * 整个文件的逻辑一眼明了，整个框架提供了两种全局异常捕获，一个是 single-spa 提供的，另一个是 qiankun 自己的，你只需提供相应的回调函数即可
 */

// single-spa 的异常捕获
export { addErrorHandler, removeErrorHandler } from 'single-spa';

// qiankun 的异常捕获
// 监听了 error 和 unhandlerejection 事件
export function addGlobalUncaughtErrorHandler(errorHandler: OnErrorEventHandlerNonNull): void {
  window.addEventListener('error', errorHandler);
  window.addEventListener('unhandledrejection', errorHandler);
}

// 移除 error 和 unhandlerejection 事件监听
export function removeGlobalUncaughtErrorHandler(errorHandler: (...args: any[]) => any) {
  window.removeEventListener('error', errorHandler);
  window.removeEventListener('unhandledrejection', errorHandler);
}
