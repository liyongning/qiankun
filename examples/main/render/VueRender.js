/**
 * 导出一个由 vue 实现的渲染函数，渲染了一个模版，模版里面包含一个 loading 状态节点和微应用容器节点
 */
import Vue from 'vue/dist/vue.esm';

// 返回一个 vue 实例
function vueRender({ loading }) {
  return new Vue({
    template: `
      <div id="subapp-container">
        <h4 v-if="loading" class="subapp-loading">Loading...</h4>
        <div id="subapp-viewport"></div>
      </div>
    `,
    el: '#subapp-container',
    data() {
      return {
        loading,
      };
    },
  });
}

// vue 实例
let app = null;

// 渲染函数
export default function render({ loading }) {
  // 单例，如果 vue 实例不存在则实例化主应用，存在则说明主应用已经渲染，需要更新主营应用的 loading 状态
  if (!app) {
    app = vueRender({ loading });
  } else {
    app.loading = loading;
  }
}
