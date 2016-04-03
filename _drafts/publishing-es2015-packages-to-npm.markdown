---
layout: post
title:  Dos and don'ts for publishing ES2015 to npm
date:   2016-04-03
categories: npm javascript
comments: false
---

## Do: transpile to ES5

* Babel + `babel-preset-2015`
* package.json pre-publish script
* npm ignore source
* git ignore output

## Don't: include big polyfills or mess with the global environment

* Don't include entire `babel-polyfill`
* Import single polyfills from `core-js`

## Do: ensure compatibility with `require()`

* Use  `babel-plugin-add-module-exports`

## Don't: assume everyone's using ES2015

* Provide usage examples using ES5
