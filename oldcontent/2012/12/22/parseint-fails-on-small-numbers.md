---
title: "ParseInt Fails on Small Numbers"
slug: "parseint-fails-on-small-numbers"
date: "2012-12-22"
url: "blog/2012/12/22/parseint-fails-on-small-numbers.html"
tags: ["tip", "javascript"]
---

A while ago I was trying to get the floor of a number using `parseInt()` in a Node.js app. The specific use case was expected to return 0, but a larger integer was returned instead. I opened up the node REPL to test out the behaviour of `parseInt()` and it turns out that when working with very small or very large numbers `parseInt()` breaks. Check out the sample below.

```javascript
// Define very small number
var small = 5/1000000000; // 5e-9

// parseInt() with radix of 10
var parseIntResult = parseInt(small, 10);

// Math.floor() to compare with
var floorResult = Math.floor(small);

console.log("parseInt:   " + parseIntResult);
console.log("Math.floor: " + floorResult);

// Some more examples
console.log("3e-9:       " + parseInt(3e-9, 10));
console.log("7e-9:       " + parseInt(7e-9, 10));


/** OUTPUT **/
//
// parseInt:   5
// Math.floor: 0
// 3e-9:       3
// 7e-9:       7
```

As you can see from this result, `parseInt()` is operating on the scientific notation version of the number rather than the actual value. However, `Math.floor()` produces the correct result. So, be careful using `parseInt()` as it can lead to very unexpected bugs.

