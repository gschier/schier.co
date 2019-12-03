---
title: "JavaScript \"for-in\" Caveat With Arrays"
slug: "javascript-for-in-caveat-with-arrays"
date: "2013-01-24"
url: "blog/2013/01/24/javascript-for-in-caveat-with-arrays.html"
tags: ["tutorial", "javascript"]
---

Don't use `for (var i in myArray)` ever!

Apparently JavaScript `for-in` loops always convert the key to a `String` type. This has caused me troubles multiple times in the past and I would like to share my experiences with the world.

```javascript
var myArray = [ 'foo', 'bar' ];

for (var i in myArray) {
  if (i === 0) {
    console.log('First!');
  } else {
    console.log('Not first :(');
  }
}

/**
 * Output:
 *
 * Not first :(
 * Not first :(
 *
 */
```

Confusing right? "First!" is never outputted because `i` is always a `String`, which is never strictly equal (===) to a `Number`. So, in summary, whenever you want to iterate over an array, it's usually best to stick with the long form version:

```javascript
var myArray = [ 'foo', 'bar' ];

for (var i=0; i&lt;myArray.length; i++) {
  if (i === 0) {
    console.log('First!');
  } else {
    console.log('Not first :(');
  }
}

/**
 * Output:
 *
 * First!
 * Not first :(
 *
 */

```

This will always produce the correct result.



