---
title: "Get Module Version in Node.js"
slug: "get-module-version-in-nodejs"
date: "2013-03-24"
url: "blog/2013/03/24/get-module-version-in-nodejs.html"
tags: ["nodejs", "tip"]
---

Here's how to extract the version number from your `package.json` file. I use this to quickly verify that my current [Nodejitsu](https://www.nodejitsu.com/) snapshot is up to date.

```javascript
// Require package.json like a regular module
var packageInfo = require('./package.json');

// Do something with the version
console.log('VERSION: ' + packageInfo.version);

```

Happy coding.



