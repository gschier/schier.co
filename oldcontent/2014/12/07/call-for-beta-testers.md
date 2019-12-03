---
title: "Call for Beta Testers"
slug: "call-for-beta-testers"
date: "2014-12-07"
url: "blog/2014/12/07/call-for-beta-testers.html"
tags: ["platform pixels", "announcement"]
---

*tl;dr* I'm building a Chrome app (currently called Bodybuilder) for managing API calls, similar to
[Postman](https://getpostman.com). If you want to join the beta,
[submit a request](https://groups.google.com/forum/#!forum/resterbeta) and I'll add you.

![Bobybuilder REST Client](/images/bodybuilder.png)

Motivations for Bodybuilder
---------------------------

A few months ago, a friend introduced me to [Postman](https://www.getpostman.com/). Postman is a
Chrome app that makes testing REST APIs super easy. As an engineer at
[sendwithus](https://www.sendwithus.com), I interact with HTTP-based APIs constantly. Whether I'm
working on a new feature, debugging, or simply using the product, having the ability to interact
with the API in an efficient way is a basic need.

Before Postman, my workflow consisted of copying cURL commands from a text file into my command
line. This got the job done, but it wasn't elegant or efficient. Postman allowed me to save all
API calls in a single place and access them in one click. It was great.

There were problems though. The more I used Postman the more frustrated I became. The create/save
workflow was confusing, the fact that I couldn't tie *environments* to *collections* annoyed me,
the amount of scrolling required to edit/view request/response bodies was frustrating, and the
overall UI was cluttered and unintuitive. The developer in me wanted to fix these things.


Introducing Bodybuilder
------------------------

Part of Postman's problem is that it has a lot of features – over 80. It's hard to keep a
simple and cohesive user experience with that many features. While designing Bodybuilder, I wanted
to prioritize user experience over features. I wanted to focus on the core problem I was trying to
solve, which was to move from my text file of cURL requests to something better. So far I
think I've done that.

Here are the features I want to be in Bodybuilder at launch:

- `[x]` create/edit/delete request groups
- `[x]` create/edit/delete requests
- `[x]` syntax highlighting/validation of JSON request bodies
- `[ ]` syntax highlighting/validation of formencoded data
- `[x]` import/export of data
- `[x]` no scrolling, unless absolutely needed
- `[x]` custom request headers
- `[x]` basic auth generator
- `[x]` basic request info: timing, error handling, etc
- `[x]` basic request info: timing, error handling, etc
- `[x]` basic templating for common {% raw %}`{{ variables }}`{% endraw %}

These might make it in, depending how ambitious I feel:

- `[ ]` basic helpers
    - `[ ]` form encoding/decoding text
    - `[ ]` base64 encoding/decoding text
    - `[ ]` timestamp generator


Wrap Up
-------

As mentioned above, if you want to be apart of the beta test group, you can
[submit a request](https://groups.google.com/forum/#!forum/resterbeta) and I'll add you.

Also, if you have any suggestions or comments, let me know.
