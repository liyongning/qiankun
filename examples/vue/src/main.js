// 动态设置 __webpack_public_path__
import './public-path';
import ElementUI from 'element-ui';
import 'element-ui/lib/theme-chalk/index.css';
import Vue from 'vue';
import VueRouter from 'vue-router';
import App from './App.vue';
// 路由配置
import routes from './router';
import store from './store';

Vue.config.productionTip = false;

Vue.use(ElementUI);

let router = null;
let instance = null;

// 应用渲染函数
function render(props = {}) {
  const { container } = props;
  // 实例化 router，根据应用运行环境设置路由前缀
  router = new VueRouter({
    // 作为微应用运行，则设置 /vue 为前缀，否则设置 /
    base: window.__POWERED_BY_QIANKUN__ ? '/vue' : '/',
    mode: 'history',
    routes,
  });

  // 实例化 vue 实例
  instance = new Vue({
    router,
    store,
    render: h => h(App),
  }).$mount(container ? container.querySelector('#app') : '#app');
}

// 支持应用独立运行
if (!window.__POWERED_BY_QIANKUN__) {
  render();
}

/**
 * 从 props 中获取通信方法，监听全局状态的更改和设置全局状态，只能操作一级属性
 * @param {*} props 
 */
function storeTest(props) {
  props.onGlobalStateChange &&
    props.onGlobalStateChange(
      (value, prev) => console.log(`[onGlobalStateChange - ${props.name}]:`, value, prev),
      true,
    );
  props.setGlobalState &&
    props.setGlobalState({
      ignore: props.name,
      user: {
        name: props.name,
      },
    });
}

/**
 * 导出的三个生命周期函数
 */
// 初始化
export async function bootstrap() {
  console.log('[vue] vue app bootstraped');
}

// 挂载微应用
export async function mount(props) {
  console.log('[vue] props from main framework', props);
  storeTest(props);
  render(props);
}

// 卸载、销毁微应用
export async function unmount() {
  instance.$destroy();
  instance.$el.innerHTML = '';
  instance = null;
  router = null;
}
