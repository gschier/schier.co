---
title: "Implementing A Blog Post Preview Feature By Reusing Code"
slug: "implementing-a-blog-post-preview-feature-by-reusing-code"
date: "2013-01-07"
url: "blog/2013/01/07/implementing-a-blog-post-preview-feature-by-reusing-code.html"
---

Today I implemented a new feature for this blog, which is the ability to preview new posts before submission. Posts are written in [Markdown](https://daringfireball.net/projects/markdown/) so seeing a preview of the fully formatted post is very useful. Implementation literally took less than thirty minutes because I was able to make use of existing functionality that already existed. I won't go over the actual code involved but here are the general steps.

1. Generate the frontend *post* object the same way it is during final submittion (reusing existing code)
2. Send an AJAX POST request to the server
 - The request data is the same as when creating a new *post* (more reuse)
3. Instantiate a *post* model on the server with the data, but don't save it
 - This converts the markdown to HTML and returns a fully formed *post*  object (again, reuse)
4. Send the *post* object to the *preview* view
 - This view uses the same code that the blog uses to display a single post (I love reusing code!)
5. Send the response
6. Set the *post* preview container HTML to the HTML that was returned from the AJAX request

This feature took very little time to write because of the modularity of the system. Modularity is essential to building maintainable and extendable systems so I always keep it in the back of my mind during development. One thing I've noticed about building modular systems is that over time new features actually become easier to implement even though the overall complexity of the system is increasing. I often use this realization to decide whether the system I'm working on is good enough (because it's never perfect), or whether it needs to be refactored or reorganized.

