---
title: "Method Chaining in JavaScript"
slug: "method-chaining-in-javascript"
date: "2013-11-14"
url: "blog/2013/11/14/method-chaining-in-javascript.html"
tags: ["explanation", "javascript"]
categories: ["best of"]
---

Method chaining is a common pattern in the JavaScript world. This tutorial will provide a brief explanation of what method chaining is, give a real world example of how jQuery uses method chaining, and teach you how to add method chaining to your own classes. Let's get started.

## What is Method Chaining?

Method chaining is a technique that can be used to simplify code in scenarios that involve calling multiple functions on the same object consecutively. This is an example of how you can use method chaining when using jQuery.

```javascript
/** Example of method chaining in jQuery */


//////////////////////////
// WITHOUT METHOD CHAINING

var $div = $('#my-div');         // assign to var

$div.css('background', 'blue');  // set BG
$div.height(100);                // set height
$div.fadeIn(200);                // show element


///////////////////////
// WITH METHOD CHAINING

$('#my-div').css('background', 'blue').height(100).fadeIn(200);

// often broken to multiple lines:
$('#my-div')
  .css('background', 'blue')
  .height(100)
  .fadeIn(200);
```

As you can see, using method chaining can tidy up code quite a bit, however some developers dislike the visual style of method chaining and choose not to use it.


## Understanding Method Chaining

For our example, we will define a custom class with a few methods to call. Let's create a `Kitten` class:

```javascript

// define the class
var Kitten = function() {
  this.name = 'Garfield';
  this.color = 'brown';
  this.gender = 'male';
};

Kitten.prototype.setName = function(name) {
  this.name = name;
};

Kitten.prototype.setColor = function(color) {
  this.color = color;
};

Kitten.prototype.setGender = function(gender) {
  this.gender = gender;
};

Kitten.prototype.save = function() {
  console.log(
    'saving ' + this.name + ', the ' +
    this.color + ' ' + this.gender + ' kitten...'
  );

  // save to database here...
};
```

Now, let's instantiate a kitten object from our class and call its methods.

```javascript
var bob = new Kitten();

bob.setName('Bob');
bob.setColor('black');
bob.setGender('male');

bob.save();

// OUTPUT:
// > saving Bob, the black male kitten...
```

Wouldn't it be better if we could get rid of some of this repetition? Method chaining would be perfect for this. The only problem is that currently this won't work. Here is why:

```javascript
var bob = new Kitten();

bob.setName('Bob').setColor('black');

// ERROR:
// > Uncaught TypeError: Cannot call method 'setColor' of undefined
```

To better understand why this doesn't work, we will rearrange the code above slightly.

```javascript
var bob = new Kitten();

var tmp = bob.setName('Bob');
tmp.setColor('black');

// ERROR:
// > Uncaught TypeError: Cannot call method 'setColor' of undefined
```

This returns the same error. This is because the `setName()` function doesn't return a value, so `tmp` is assigned the value of `undefined`. The typical way to enable method chaining is to return the current object at the end of every function.

## Implementing Method Chaining

Let's rewrite the `Kitten` class with the ability to chain methods.

```javascript
// define the class
var Kitten = function() {
  this.name = 'Garfield';
  this.color = 'brown';
  this.gender = 'male';
};

Kitten.prototype.setName = function(name) {
  this.name = name;
  return this;
};

Kitten.prototype.setColor = function(color) {
  this.color = color;
  return this;
};

Kitten.prototype.setGender = function(gender) {
  this.gender = gender;
  return this;
};

Kitten.prototype.save = function() {
  console.log(
    'saving ' + this.name + ', the ' +
    this.color + ' ' + this.gender + ' kitten...'
  );

  // save to database here...

  return this;
};
```

Now, if we rerun the previous snippet, the variable `tmp` will reference the same object as the variable `bob`, like so: 

```javascript
var bob = new Kitten();

var tmp = bob.setName('Bob');
tmp.setColor('black');

console.log(tmp === bob);

// OUTPUT:
// > true
```

To shorten this even more, we do not even need to create the variable `bob`. Here are two examples with and without method chaining on our new class:


```javascript
///////////////////
// WITHOUT CHAINING

var bob = new Kitten();

bob.setName('Bob');
bob.setColor('black');
bob.setGender('male');

bob.save();

// OUTPUT:
// > saving Bob, the black male kitten...


///////////////////
// WITH CHAINING

new Kitten()
  .setName('Bob')
  .setColor('black')
  .setGender('male')
  .save();

// OUTPUT:
// > saving Bob, the black male kitten...
```

By using method chaining we end up with much cleaner code that is easier to understand.


## Conclusion

That's it! Method chaining can be a very useful technique to have in your bag of programming tools. If you have any questions, let me know in the comments below.

-----------------------

*[Martin Mauchauffée](https://plus.google.com/116591626596369246536/posts) and [Manu Delgado Diaz](https://plus.google.com/u/0/105471318664923408342) pointed out that this is also known as the [Fluent Interface](https://en.wikipedia.org/wiki/Fluent_interface) pattern.*

*[Юрий Тарабанько](https://plus.google.com/u/0/+%D0%AE%D1%80%D0%B8%D0%B9%D0%A2%D0%B0%D1%80%D0%B0%D0%B1%D0%B0%D0%BD%D1%8C%D0%BA%D0%BE/posts) came up with a great way to automate the addition of `return this;`. Check out his `chainify()` function in this [Fiddle](https://jsfiddle.net/tarabyte/4C4Lu/)*







