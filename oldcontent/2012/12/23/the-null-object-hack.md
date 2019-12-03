---
title: "The NULL Object Hack"
slug: "the-null-object-hack"
date: "2012-12-23"
url: "blog/2012/12/23/the-null-object-hack.html"
tags: ["tip", "javascript"]
---

Have you ever seen this?

```javascript
foo.bar;

/** OUTPUT **/
//
// TypeError: Cannot read property 'bar' of null

```

Well, there is an easy solution:

```javascript
if (foo && foo.hasOwnProperty('bar')) {
  baz = foo.bar;
} else {
  // Do something else
}

```

However, this is long and stupid, especially when working with large nested objects. Sometimes if error handling isn't as important you can get away with this little one-liner.

```javascript
// Prevent null reference by making sure an object exists
baz = (foo || { }).bar;

// Or, using ternary operation (more robust but longer)
baz = foo && foo.hasOwnProperty('bar') ? foo.bar : 'default value';

```

The || means that the second option will be used if the first one is a falsy value (false, null, 0, etc). This method works well if you're expecting foo to be an object that may not exist, but I don't recommend using it in many other circumstances.


