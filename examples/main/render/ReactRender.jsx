/**
 * 同 vue 实现的渲染函数，这里通过 react 实现了一个一样的渲染函数
 */
import React from 'react';
import ReactDOM from 'react-dom';

// 渲染主应用
function Render(props) {
  const { loading } = props;

  return (
    <>
      {loading && <h4 className="subapp-loading">Loading...</h4>}
      <div id="subapp-viewport" />
    </>
  );
}

// 将主应用渲染到指定节点下
export default function render({ loading }) {
  const container = document.getElementById('subapp-container');
  ReactDOM.render(<Render loading={loading} />, container);
}
