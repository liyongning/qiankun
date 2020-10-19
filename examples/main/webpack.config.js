const HtmlWebpackPlugin = require('html-webpack-plugin');
const { name } = require('./package');

module.exports = {
  entry: process.env.MODE === 'multiple' ? './multiple.js' : './index.js',
  devtool: 'source-map',
  devServer: {
    // 从 package.json 中可以看出，启动示例项目时，主应用执行了两条命令，其实就是启动了两个主应用，但是却只配置了一个端口，浏览器打开 localhost:7099 和你预想的有一些出入，这时显示的是 loadMicroApp(手动加载微应用) 方式的主应用，基于路由配置的主应用没起来，因为端口被占用了
    // port: '7099'
		// 这样配置，手动加载微应用的主应用在 7099 端口，基于路由配置的主应用在 7088 端口
    port: process.env.MODE === 'multiple' ? '7099' : '7088',
    clientLogLevel: 'warning',
    disableHostCheck: true,
    compress: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    historyApiFallback: true,
    overlay: { warnings: false, errors: true },
  },
  output: {
    publicPath: '/',
  },
  mode: 'development',
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
            plugins: ['@babel/plugin-transform-react-jsx'],
          },
        },
      },
      {
        test: /\.(le|c)ss$/,
        use: ['style-loader', 'css-loader', 'less-loader'],
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      filename: 'index.html',
      template: process.env.MODE === 'multiple' ? './multiple.html' : './index.html',
      minify: {
        removeComments: true,
        collapseWhitespace: true,
      },
    }),
  ],
};
