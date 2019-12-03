---
title: "How JSONP Works"
slug: "how-jsonp-works"
date: "2013-09-30"
url: "blog/2013/09/30/how-jsonp-works.html"
tags: ["explanation", "javascript", "webdev"]
---

The Wikipedia Definition of JSONP is as follows:

*a communication technique used in JavaScript programs which run in Web browsers. It provides a method to request data from a server in a different domain, something prohibited by typical web browsers because of the same origin policy.*

## The Problem That JSONP Fixes

The typical AJAX request using the JQuery library looks like this:

<script src="https://codereplay.com/w/sample-jquery-ajax-request"></script>

The problem comes when you try to change the URL to point to a different domain such as `https://otherdomain.com/users/billy`. The reason this fails is because there are security implications that come with making requests to different origins. I won't bore you with specifics, but you can read more on the [same-origin policy](https://en.wikipedia.org/wiki/Same-origin_policy) Wikipedia page.

## How JSONP Works

While it is not possible to make a typical AJAX request to a different origin, it *is* possible to include a `<script>` from a different origin. Using this method, JSONP is able to work around the same-origin policy. The way a typical JSONP call works is like this:

- create a new `<script>` tag using `window.createElement()`
- set the `src` attribute to the desired JSONP endpoint
- add the `<script>` to the `<head>` of the DOM
- once loaded, the script passes data to a local callback function

The key difference between a JSON response and a JSONP response is the callback function. A regular AJAX endpoint would simply respond with a string of JSON like this:

<script src="https://codereplay.com/w/json-user-object"></script>

A JSON**P** response, on the other hand, is actually an executable script that calls a designated JSONP callback function, passing a JSON string as a parameter. The typical JSONP response looks something like this:

<script src="https://codereplay.com/w/jsonp-user-object"></script>

Notice that this is valid JavaScript code. The way this JSONP endpoint would be called would look like this:

<script src="https://codereplay.com/w/calling-a-jsonp-endpoint"></script>

So once the new script is appended to the DOM, loaded and executed, it will call the callback function that you defined with the data that you requested. Pretty easy right? It's only a couple more lines of code than a regular AJAX request. You probably thought that JSONP was some magical and complicated thing that JQuery abstracted away (I know I did).

## Limitations and Conclusions of JSONP

While JSONP seems like a perfect solution to get around the same-origin policy, there is one caveat. Since a JSONP call is made by the inclusion of a script tag, requests are restricted to the HTTP GET method. There is no way to do a PUT or POST request with JSONP, which is limiting to say the least.

So while JSONP is great for calling read-only services such as weather and news APIs, it can not be used for much else. There *are* a few ways to get around the same-origin policy but I'll save those for another tutorial.








