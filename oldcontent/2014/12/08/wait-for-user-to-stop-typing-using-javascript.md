---
title: "Wait for User to Stop Typing, Using JavaScript"
slug: "wait-for-user-to-stop-typing-using-javascript"
date: "2014-12-08"
url: "blog/2014/12/08/wait-for-user-to-stop-typing-using-javascript.html"
tags: ["tutorial", "javascript"]
---

Here's the scenario. You have a search feature on your website that you want to live-update while
the user types. The naive solution would be to execute a search query on every keystroke. This
falls apart, however, because the user can usually type faster your server can respond. This makes
for a poor user experience and an overloaded server.

The solution to this is to execute the search only after the user stops typing. I'm going to show
you how to implement this in just a few lines of code.


Listen For User Input
---------------------

Here is some HTML and JavaScript to log the current value of an `input` whenever the user presses
a key. In the real world, this log could just as easily be a function call to execute a search
query.

```html
<!-- a simple input box -->
<input type="text" id="test-input" />
```

```javascript
// Get the input box
var textInput = document.getElementById('test-input');

// Listen for keystroke events
textInput.onkeydown = function (e) {
    console.log('Input Value:', textInput.value);
};
```

<div class="text-center" style="background: #f5f5f5;padding:1em;">
    <h3>Demo 1 – Output on Every Keystroke</h3>
    <input type="text"
        id="test-input"
        style="padding: 0.3em 0.7em; margin: 2em 0 1em 0;"
        placeholder="start typing..." />
    <pre>Input Value: "<span id="test-output"></span>"</pre>
</div>

<script>
(function () {
    var textInput = document.getElementById('test-input');
    var el = document.getElementById('test-output');
    textInput.onkeyup = function (e) {
        el.innerHTML = textInput.value;
    };
})();
</script>

As you can see, there's nothing wrong with printing a log on every keystroke. It works just fine.
However, if that log message was replaced by a network call to make a search query, it would start
making too many requests. This would both slow down the UI and potentially overload the server.
So how do we fix this?


Wait for Typing to Stop
-----------------------

In order to execute a chunk of code after the user stops typing we need to know about a few things:

`setTimeout(callback, milliseconds)` and `clearTimeout(timeout)`

`setTimeout` is a JavaScript function that executes a function (`callback`) after a given amount
of time has elapsed (`milliseconds`). `clearTimeout` is another function that you can
use to cancel a timeout if it hasn't executed yet.

So how do we use these things to detect when a user stops typing? Here's some code to show you.
Hopefully I've added enough comments to make it clear what's going on.

```javascript
// Get the input box
var textInput = document.getElementById('test-input');

// Init a timeout variable to be used below
var timeout = null;

// Listen for keystroke events
textInput.onkeyup = function (e) {

    // Clear the timeout if it has already been set.
    // This will prevent the previous task from executing
    // if it has been less than <MILLISECONDS>
    clearTimeout(timeout);

    // Make a new timeout set to go off in 800ms
    timeout = setTimeout(function () {
        console.log('Input Value:', textInput.value);
    }, 500);
};
```

<div class="text-center" style="background: #f5f5f5;padding:1em;">
    <h3>Demo 2 – Output when Typing Stops</h3>
    <input type="text"
        id="test-input-2"
        style="padding: 0.3em 0.7em; margin: 2em 0 1em 0;"
        placeholder="start typing..." />
    <pre>Input Value: "<span id="test-output-2"></span>"</pre>
</div>

<script>
(function () {
    var textInput = document.getElementById('test-input-2');
    var el = document.getElementById('test-output-2');
    var timeout = null;

    textInput.onkeyup = function (e) {
        clearTimeout(timeout);
        timeout = setTimeout(function () { el.innerHTML = textInput.value; }, 500);
    };
})();
</script>

As you can see in the demo above, nothing is outputted until no key presses have happened for 500
milliseconds. Exactly what we wanted.


Wrap-Up
-------

That's it. All it takes to delay execution while typing is 5 lines of code. Feel free to ask
questions on [Twitter](https://twitter.com/gregoryschier) or
[Google Plus](https://plus.google.com/102509209246537377732) if you have any.
