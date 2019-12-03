---
title: "Generating Random Colours"
slug: "generating-random-colours"
date: "2013-03-03"
url: "blog/2013/03/03/generating-random-colours.html"
tags: ["tutorial", "colors", "javascript"]
---

I've been playing around with `<canvas>` lately and have had a frequent need to generate random colours. I have written my own functions for doing this, which I now use all the time. The first function below generates a simple array of `RGB` values, while the second snippet generates a hexadecimal string.

## Generating RGB Values

The snippet for generating `RGB` values is quite simple. We use the `Math.random()` function to generate a 3-element `Array` of whole numbers between `0` and `255`. It can be tricky to wrap your head around how to get a random integer between `0` and `255` using the `Math.random()` function so here is an expanded version of the process.

```
// Decimal value between 0 and 1
var rand = Math.random();

// Decimal value between 0 and 256 exclusive
var randFloat = rand*256;

// Whole number between 0 and 255 inclusive
var randInt = Math.floor(randFloat);

```

We can now use this technique in our colour generation snippet.

```
/**
 * Returns an RGB colour of the
 * form [ 255, 255, 255 ]
 */
var randomColor = function() {
  var c = [ ];

  for (var i=0; i<3; i++) {
    // Push random integer between 0 and 255
    c.push(Math.floor(Math.random()*256));
  }

  return c;
};

```

As you can see, we multiply the random number by `256` to transform its range from `(0, 1)` to `(0, 256)`. We then make use of `Math.floor()` which rounds the number down to the nearest integer, leaving a whole number with a range of `[0, 255]`.

## Generating a HEX Value

Hexadecimal colour strings are made up of six hexadecimal digits. Each digit can be one of fifteen possible values ranging from `0-9` or `A-F`. The following snippet is similar to the first one except instead of picking a random integer between `0` and `255` it generates a random integer between `0` and `15` which is then used as an array index that maps to one of the fifteen digits.

```
/**
 * Returns a HEX colour of the
 * form "#AAAAAA"
 */
var randomColor = function() {

  // Define possible hex digits
  var chars = [
    '0', '1', '2', '3',
    '4', '5', '6', '7',
    '8', '9', 'a', 'b',
    'c', 'd', 'e', 'f'
  ];

  var c = [ ];

  for (var i=0; i<6; i++) {
    // Choose random digit
    var index = Math.floor(Math.random()*chars.length);

    // Push random digit to array
    c.push(chars[index]);
  }

  // Transform the array to the form "#AAAAAA"
  return '#'+c.join('');
};

```

## Wrap Up

And that's it. Feel free to take these snippets and use them in your own work. If you have any questions, feel free to leave a comment below.

Happy Coding :)




