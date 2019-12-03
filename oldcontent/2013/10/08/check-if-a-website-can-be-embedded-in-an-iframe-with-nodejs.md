---
title: "Check If a Website Can Be Embedded in an IFrame with Node.js"
slug: "check-if-a-website-can-be-embedded-in-an-iframe-with-nodejs"
date: "2013-10-08"
url: "blog/2013/10/08/check-if-a-website-can-be-embedded-in-an-iframe-with-nodejs.html"
tags: ["tutorial", "nodejs"]
---

I've been working on a new project recently that requires previewing external web pages in an iframe. This feature is not always possible though because websites can prevent themselves from showing in iframes by setting the [x-frame-options](https://developer.mozilla.org/en-US/docs/HTTP/X-Frame-Options) header. Since there is no way to get around this rule, the only option is to detect whether the website sets this rule and show the user something else. The following snippet shows how to check this header from Node.js using the [request](https://github.com/mikeal/request) module: 

```javascript
var request = require('request');

request(url, function(err, response) {
  var isBlocked = 'No';

  // If the page was found...
  if (!err && response.statusCode == 200) {

    // Grab the headers
    var headers = response.headers;

    // Grab the x-frame-options header if it exists
    var xFrameOptions = headers['x-frame-options'] || '';

    // Normalize the header to lowercase
    xFrameOptions = xFrameOptions.toLowerCase();

    // Check if it's set to a blocking option
    if (
      xFrameOptions === 'sameorigin' ||
      xFrameOptions === 'deny'
    ) {
      isBlocked = 'Yes';
    }
  }

  // Print the result
  console.log(isBlocked + ', this page is blocked');
});
```

While this example uses the request module for brevity, any method of making an external HTTP request could have been used.

Happy coding.



