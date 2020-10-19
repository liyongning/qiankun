/**
 * 在示例或者官网提到的所有 API 都在这里统一导出
 */
// 最关键的三个，手动加载微应用、基于路由配置、启动 qiankun
export { loadMicroApp, registerMicroApps, start } from './apis';
// 全局状态
export { initGlobalState } from './globalState';
// 全局的未捕获异常处理器
export * from './errorHandler';
// setDefaultMountApp 设置主应用启动后默认进入哪个微应用、runAfterFirstMounted 设置当第一个微应用挂载以后需要调用的一些方法
export * from './effects';
// 类型定义
export * from './interfaces';
// prefetch
export { prefetchImmediately as prefetchApps } from './prefetch';
