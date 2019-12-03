---
title: "How To Re-Run Prism.js On AJAX Content"
slug: "how-to-re-run-prismjs-on-ajax-content"
date: "2013-01-07"
url: "blog/2013/01/07/how-to-re-run-prismjs-on-ajax-content.html"
tags: ["tutorial", "webdev"]
---

[Prism.js](https://prismjs.com/) is a great library to handle syntax highlighting for code blocks on a web page. However, since Prism runs automatically after being embedded (hence why you need to include it at the bottom of the HTML) content that is loaded later is not highlighted. After console logging the Prism object in Chrome developer tools I discovered a method called `highlightAll()` which can be used to force Prism to rerun on the current page.

```javascript
// Rerun Prism syntax highlighting on the current page
Prism.highlightAll();
```

If you don't want Prism rescanning the entire DOM you can selectively highlight elements with the `highlightElement()` function.

```javascript
// Say you have a code block like this
/**
  <pre>
    <code id="some-code" class="language-javascript">
      // This is some random code
      var foo = "bar"
    </code>
  </pre>
*/

// Be sure to select the inner <code> and not the <pre>

// Using plain Javascript
var block = document.getElementById('some-code')
Prism.highlightElement(block);

// Using JQuery
Prism.highlightElement($('#some-code')[0]);

```

It's as simple as that! I'm not sure why Prism doesn't include this tip on the website.

**_Edit:_** The Prism guys tweeted me a link to the documentation on this: [prismjs.com/extending.html#api](https://prismjs.com/extending.html#api)


