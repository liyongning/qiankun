/**
 * 调用 loadMicroApp 方法注册了两个微应用
 */
import { loadMicroApp } from '../../es';

const app1 = loadMicroApp(
  // 应用配置，名称、入口地址、容器节点
  { name: 'react15', entry: '//localhost:7102', container: '#react15' },
  // 可以添加一些其它的配置，比如：沙箱、样式隔离等
  {
    sandbox: {
      // strictStyleIsolation: true,
    },
  },
);

const app2 = loadMicroApp(
  { name: 'vue', entry: '//localhost:7101', container: '#vue' },
  {
    sandbox: {
      // strictStyleIsolation: true,
    },
  },
);
