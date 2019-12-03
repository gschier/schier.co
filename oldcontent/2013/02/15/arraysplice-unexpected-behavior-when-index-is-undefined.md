---
title: "Array.splice() Unexpected Behavior when Index is Undefined"
slug: "arraysplice-unexpected-behavior-when-index-is-undefined"
date: "2013-02-15"
url: "blog/2013/02/15/arraysplice-unexpected-behavior-when-index-is-undefined.html"
tags: ["javascript", "tip"]
---

Today I discovered something you should know about `Array.splice()` in Javascript. According to [this page](https://www.w3schools.com/jsref/jsref_splice.asp) `splice()` has a first parameter of `index` which is supposed to be a number representing the index of the array you wish to splice at. Well, apparently when this `index` is undefined it acts as though you passed `0` instead.

```javascript
// Create a sample array
var array = [ 'a', 'b', 'c' ];

console.log(array);

// Remove 1 element from index undefined
array.splice(undefined, 1);

console.log(array);

/**
 * OUTPUT
 *
 * [ 'a', 'b', 'c' ]
 * [ 'b', 'c' ]
 */

```

Keep this in mind next time you're using `Array.splice()` as it is very unexpected behaviour.


