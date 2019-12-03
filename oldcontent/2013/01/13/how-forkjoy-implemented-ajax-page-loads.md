---
title: "How ForkJoy Implemented AJAX Page Loads"
slug: "how-forkjoy-implemented-ajax-page-loads"
date: "2013-01-13"
url: "blog/2013/01/13/how-forkjoy-implemented-ajax-page-loads.html"
tags: ["tutorial", "webdev", "nodejs", "forkjoy"]
---

This article will provide a fairly high level overview of how [ForkJoy](https://forkjoy.com) implemented its AJAX page loading system. ForkJoy uses [Node.js](https://nodejs.org) and [Express](https://expressjs.com/) for its backend, [Jade](https://jade-lang.com/) for templating, and [JQuery](https://jquery.com/) on the frontend.

**Disclaimer**<br>
*The sample code used in this article is based on the ForkJoy codebase, but is heavily simplified to reduce complexity. The purpose of the sample code is not to provide a working demo, but to provide a starting point for implementation and help the readers' understanding.*

## The Requirements
In order for a simple AJAX system to work, we enforce a strict template structure on every page:

```html
<!-- ForkJoy page template structure -->

<HEADER>  <!-- Static -->
<CONTENT> <!-- Dynamic -->
<FOOTER>  <!-- Static -->

```

This structure makes it so that when fetching a new page, the only component that needs to be replaced is `<CONTENT>`.

## The Backend Strategy 

Now that we know the only *new* content on every page is the main content, we need a way of sending a special request to tell the server to return *only* the main content without the `<HEADER>` and `<FOOTER>` wrapper. Once we can do this, we will then be able to fetch just the main content of a new page and replace the old content with it. To accomplish this, every page on ForkJoy can be accessed in two ways.

**Regular Page Request:**<br>
[forkjoy.com/search/](https://forkjoy.com/search/)

**AJAX Page Request (No Wrapper):**<br>
[forkjoy.com/ajax/search/](https://forkjoy.com/ajax/search/)

If you visit these links you will see that the second one returns only the main content of the page. This is achieved on the server by defining a separate AJAX route for every regular route.

```javascript
/**
 *  Defining AJAX application routes with Express.js
 */

// DEFINE APP ROUTES
app.get('/search', routes.search);
app.get('/ajax/search', routes.search);

app.get('/foo', routes.foo);
app.get('/ajax/foo', routes.foo);

```

Now that AJAX-specific routes exist we need a way of telling the page template not to use the wrapper. This can be done with Express' middleware concept.

```javascript
/**
 *  Detecting an AJAX route
 */

// Intercept all routes beginning with "/ajax/"
app.get('/ajax/?*', function(req, res, next) {
  // Set flag that the route controller can use
  req.fjAjax = true;

  next();
});

```

The purpose of this middleware function is to intercept every request and set the flag that the Jade template will use to decide whether or not to use the page wrapper. Then, from within the route controller, this flag is passed to the Jade template.

```javascript
/**
 *  Route controller
 */

exports.search = function(req, res) {
  var data = {
    title: 'Search',

    // Default to false if undefined
    isAjax: req.fjAjax || false
  };
  res.render('search', data);
};

// ...

```

Jade templates use a construct called *blocks*. In the sample code below, we named the main content block *"body"*, and gave its container div an id of `page-body` which will be used later.

```javascript
//-
//- Jade layout file
//- 

doctype 5
html
  head
  body
    if (isAjax)
      //- Just return main content for AJAX
    else
      header
        h1 #{title}
      div(id='page-body')
        //- Include main content inside wrapper
        block body
      
```

Now to define a basic sample page.

```javascript
//-
//- Sample Jade page
//- 

extends layout
block body
  //- The page content goes here
  p This is the page content!

```

Now we have all that we need to request both regular pages and AJAX pages, the only thing left is to build the frontend code to fetch it.

## The Frontend Strategy

The basic frontend solution for this is very simple. We simply need to intercept all link clicks, fetch the AJAX content, and replace the page body. The finer JQuery details of this will be left out for simplicity, but the main idea is shown below.

```javascript
/**
 *  Fetch AJAX content with JQuery
 */

$( function() {
  // Cache the page container element
  // for maximum efficiency!
  var $pageBody = $('#page-body');

  // Helper function to grab new HTML
  // and replace the content
  var replacePage = function(url) {
    $.ajax({
      type: 'GET',
      url: url,
      cache: false,
      dataType: 'html'
    })
    .done( function(html) {
      $pageBody.html(html);
    });
  };

  // Intercept all link clicks
  $('body').delegate('a', 'click', function(e) {
    
    // Grab the url from the anchor tag
    var url = $(this).attr('href');

    // Detect if internal link (no https://...)
    if (url && url.indexOf('/') === 0) {
      e.preventDefault();
      var newUrl = '/ajax'+url;

      // Replace the page
      replacePage(newUrl);
    } else {
      // Don't intercept external links
    }
  });
});

```

And that's it for the frontend. Pretty easy eh?

## What If You Don't Have Javascript?!?!

The beauty of this solution is that we use JQuery to intercept clicks, generate AJAX urls, and swap content, so clicks made by users who don't have Javascript won't be intercepted and links will function as they would normally. 

## The Missing Details

This article covered the basics of how ForkJoy implements AJAX page loads, but there are a few things that have been left out to keep this article *short*.

### Error Handling

The details of error handling have been left out to keep the sample code clean, short, and readable.

### Browser History Writing

The problem with AJAX loading is that new pages are not added to the users' browser history which creates a bad experience. Now that the History API is gaining some traction, we were able to use the [History.js](https://github.com/balupton/History.js/) library to make sure the users' back and forward buttons worked as if it was a regular website. The implementation details of this requires a tutorial of its own so they have been left out of this article.

ForkJoy also disables AJAX page loads for browsers that don't support the History API so that all users get a good experience.

### Changing Page Titles

Since the page `<HEAD>` is not returned with AJAX content, neither is the page title. We solve this by adding a special `<div>` element to the response that contains the new page title (and some other things). This page title is extracted from this element with JQuery and removed before the main page content is replaced.

### Convenience Functionality

To make ForkJoy more modular we wrote a few things to make this process better.

- Route generator that automatically generates AJAX routes
- JQuery plugin to handle link interception and browser history change
- A bunch of small stuff to reduce code duplication...

## The Result

Although a lot of the implementation details of this article were left out to keep it short I hope you will be able to take what you learned here and apply it to your own website. If you have any questions or suggestions please feel free to leave a comment.

