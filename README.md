# 微前端框架 之 qiankun 从入门到精通

文章发布于 [掘金](https://juejin.im/post/6885211340999229454)，通过对比 single-spa，详细分析了 qiankun 框架的源码实现

# qiankun（乾坤）

[![npm version](https://img.shields.io/npm/v/qiankun.svg?style=flat-square)](https://www.npmjs.com/package/qiankun) [![coverage](https://img.shields.io/codecov/c/github/umijs/qiankun.svg?style=flat-square)](https://codecov.io/gh/umijs/qiankun) [![npm downloads](https://img.shields.io/npm/dt/qiankun.svg?style=flat-square)](https://www.npmjs.com/package/qiankun) [![Build Status](https://img.shields.io/travis/umijs/qiankun.svg?style=flat-square)](https://travis-ci.org/umijs/qiankun)

> In Chinese traditional culture `qian` means heaven and `kun` stands for earth, so `qiankun` is the universe.

An implementation of [Micro Frontends](https://micro-frontends.org/), based on [single-spa](https://github.com/CanopyTax/single-spa), but made it production-ready.

## 📦 Installation

```shell
$ yarn add qiankun  # or npm i qiankun -S
```

## 📖 Documentation

https://qiankun.umijs.org/

## 💿 Getting started

This repo contains an `examples` folder with a sample Shell app and multiple mounted Micro FE apps. To run this app, first clone `qiankun`:

```shell
$ git clone https://github.com/umijs/qiankun.git
$ cd qiankun
```

Now run the yarn scripts to install and run the examples project:

```shell
$ yarn install
$ yarn examples:install
$ yarn examples:start
```

Visit `http://localhost:7099`.

![](./examples/example.gif)

## :sparkles: Features

- 📦 **Based On [single-spa](https://github.com/CanopyTax/single-spa)**
- 📱 **Technology Agnostic**
- 💪 **HTML Entry Access Mode**
- 🛡 **Style Isolation**
- 🧳 **JS Sandbox**
- ⚡ **Prefetch Assets**
- 🔌 **[Umi Plugin](https://github.com/umijs/plugins/tree/master/packages/plugin-qiankun) Integration**


## 🎁 Acknowledgements

- [single-spa](https://github.com/liyongning/micro-frontend) What an awesome meta-framework for micro-frontends!
- [import-html-entry](https://github.com/liyongning/import-html-entry) An assets loader which supports html entry.
