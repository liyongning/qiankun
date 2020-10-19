// qiankun api 引入
import { registerMicroApps, runAfterFirstMounted, setDefaultMountApp, start, initGlobalState } from '../../es';
// 全局样式
import './index.less';

// 专门针对 angular 微应用引入的一个库
import 'zone.js';

/**
 * 主应用可以使用任何技术栈，这里提供了 react 和 vue 两种，可以随意切换
 * 最终都导出了一个 render 函数，负责渲染主应用
 */
// import render from './render/ReactRender';
import render from './render/VueRender';

// 初始化主应用，其实就是渲染主应用
render({ loading: true });

// 定义 loader 函数，切换微应用时由 qiankun 框架负责调用显示一个 loading 状态
const loader = loading => render({ loading });

// 注册微应用
registerMicroApps(
  // 微应用配置列表
  [
    {
      // 应用名称
      name: 'react16',
      // 应用的入口地址
      entry: '//localhost:7100',
      // 应用的挂载点，这个挂载点在上面渲染函数中的模版里面提供的
      container: '#subapp-viewport',
      // 微应用切换时调用的方法，显示一个 loading 状态
      loader,
      // 当路由前缀为 /react16 时激活当前应用
      activeRule: '/react16',
    },
    {
      name: 'react15',
      entry: '//localhost:7102',
      container: '#subapp-viewport',
      loader,
      activeRule: '/react15',
    },
    {
      name: 'vue',
      entry: '//localhost:7101',
      container: '#subapp-viewport',
      loader,
      activeRule: '/vue',
    },
    {
      name: 'angular9',
      entry: '//localhost:7103',
      container: '#subapp-viewport',
      loader,
      activeRule: '/angular9',
    },
    {
      name: 'purehtml',
      entry: '//localhost:7104',
      container: '#subapp-viewport',
      loader,
      activeRule: '/purehtml',
    },
  ],
  // 全局生命周期钩子，切换微应用时框架负责调用
  {
    beforeLoad: [
      app => {
        // 这个打印日志的方法可以学习一下，第三个参数会替换掉第一个参数中的 %c%s，并且第三个参数的颜色由第二个参数决定
        console.log('[LifeCycle] before load %c%s', 'color: green;', app.name);
      },
    ],
    beforeMount: [
      app => {
        console.log('[LifeCycle] before mount %c%s', 'color: green;', app.name);
      },
    ],
    afterUnmount: [
      app => {
        console.log('[LifeCycle] after unmount %c%s', 'color: green;', app.name);
      },
    ],
  },
);

// 定义全局状态，并返回两个通信方法
const { onGlobalStateChange, setGlobalState } = initGlobalState({
  user: 'qiankun',
});

// 监听全局状态的更改，当状态发生改变时执行回调函数
onGlobalStateChange((value, prev) => console.log('[onGlobalStateChange - master]:', value, prev));

// 设置新的全局状态，只能设置一级属性，微应用只能修改已存在的一级属性
setGlobalState({
  ignore: 'master',
  user: {
    name: 'master',
  },
});

// 设置默认进入的子应用，当主应用启动以后默认进入指定微应用
setDefaultMountApp('/react16');

// 启动应用
start();

// 当第一个微应用挂载以后，执行回调函数，在这里可以做一些特殊的事情，比如开启一监控或者买点脚本
runAfterFirstMounted(() => {
  console.log('[MainApp] first app mounted');
});
