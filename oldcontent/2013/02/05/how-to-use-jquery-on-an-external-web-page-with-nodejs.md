---
title: "How To Use JQuery On An External Web Page With NodeJS"
slug: "how-to-use-jquery-on-an-external-web-page-with-nodejs"
date: "2013-02-05"
url: "blog/2013/02/05/how-to-use-jquery-on-an-external-web-page-with-nodejs.html"
---

I recently started a new project that scrapes certain web pages looking for content changes. There are a few Node modules designed for this purpose, and for my first attempt I chose to use [jsdom](https://github.com/tmpvar/jsdom). *Jsdom* worked great, but it needed a certain version of Python to be installed, which caused problems when running on [Nodejitsu](https://nodejitsu.com/). I ended up switching to a combination of [domino](https://github.com/fgnass/domino) (which got rid of the Python dependancy) paired with [zepto-node](https://github.com/fgnass/zepto-node) (JQuery-like library). Here is a quick snippet to get you started: 

```javascript
var request = require('request');
var domino = require('domino');
var Zepto = require('zepto-node');

var params = {
  url: 'https://google.com'
};

request(params, function(err, response, body) {
  if(err || response.statusCode !== 200) {
    console.warn('Failed to fetch url '+url);
  }

  var window = domino.createWindow(body);
  var $ = Zepto(window);
  
  var pageTitle = $('title').text();
  console.log('Page Title: '+pageTitle);
});

/**
 * OUTPUT
 *
 * Page Title: Google
 *
 */

```

Pretty easy right? Since *domino* is implemented in 100% Javascript, the app can safely be run inside of any Node environment.


