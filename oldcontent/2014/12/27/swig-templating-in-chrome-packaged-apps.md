---
title: "Swig Templating in Chrome Packaged Apps"
slug: "swig-templating-in-chrome-packaged-apps"
date: "2014-12-27"
url: "blog/2014/12/27/swig-templating-in-chrome-packaged-apps.html"
tags: ["tutorial", "chrome app"]
---

_tl;dr Check out the [sample code](https://github.com/gschier/swig-templating-chrome-packaged-apps)
on github_

I've been working on a Chrome Packaged App
([Insomnia REST Client](https://insomnia.rest)) for the past couple months and
have leaned a lot. One of the biggest challenges about Packaged Apps
is working around the
[Content Security Policy](https://developer.chrome.com/apps/contentSecurityPolicy)
(CSP).

The CSP makes it difficult to do common tasks such as accessing remote resources,
embedding `iframes`, or using templating libraries.

Today, I'm going to demonstrate how to use a
[sandboxed](https://developer.chrome.com/apps/app_external#sandboxing) iframe
and message passing to achieve template rendering with the
[Swig](https://paularmstrong.github.io/swig/) templating engine.

**Note:** if you don't need to live-render templates in-app then it is better
to precompile your templates and include them in your app source. The following
sandboxing workaround is only necessary if you need to render dynamic content
or user-generated templates in-app.


Overview
--------

Due to the CSP, most templating engines are not allowed to execute in a Chrome
Packaged App because of the use of `eval()`. Sandboxed pages, however, *are*
allowed to use `eval()`. This means that rendering is possible, and we just
need an easy way to communicate back and forth with the sandbox.
Luckily this isn't that hard.

Packaged Apps are allowed to communicate with sandboxes via message passing.
Message passing allows the sending objects from one environment to another.
We're going to leverage this feature to create a two-way rendering helper
that works as follows:

- app passes content to render to the iframe (as a message)
- iframe script receives message, renders content
- iframe script passes new message to parent with rendered content

These steps are shown in the illustration below:

![Swig Chrome Packaged App](/images/sandbox.png)

Alright, let's get coding! Remember, you can view the full sample code
[on Github](https://github.com/gschier/swig-templating-chrome-packaged-apps).


1. Specify the Sandboxed Page
-----------------------------

`manifest.json` is a metadata file that defines the properties of a Chrome
Packaged App (or extension). The only specific thing we need to include
here is the `sandbox` attribute.

```javascript
/** manifest.json */

"sandbox": {
    // define render.html as a sandboxed page
    "pages": [ "render.html" ]
}
```


2. Include Sandboxed `iframe`
-----------------------------

In our app's main HTML page (`index.html`), we need to include the sandboxed
page as an invisible iframe. We can then use the iframe to execute the *unsafe*
Swig template code.


```html
<!-- index.html -->

<!-- Use an iframe as a sandbox. This is what we'll use to render -->
<iframe src="render.html" id="sandbox" style="display:none"></iframe>

<!-- Include some sample JS to communicate with the sandbox -->
<script src="index.js"></script>
```


3. Render Swig Template from Sandbox
------------------------------------

Now lets jump over to our sandboxed environment. The script below shows the
code needed to listen for messages from the parent, and render a template.


```html
<!-- render.html -->

<script src="swig.js"></script>

<script>
    // Listen for messages from within the iframe
    window.addEventListener('message', function (event) {

        // Render the content with the passed context
        var content = swig.render(event.data.template, {
            locals: event.data.context
        });

        // Send a message back to the parent that sent it
        event.source.postMessage({
            content: content,
        }, event.origin);
    });
</script>
```

Pretty simple right?


3. Call the Sandboxed Code
--------------------------

Now that we have sandboxed code to handle and render a message, lets call the
code from our app.

```javascript
/** index.js */

window.onload = function () {
    // Store current callback where it can be referenced
    var globalCallback;

    /**
     * Handy helper function that we can call to render.
     * This wraps the clunky two-way message passing into a
     * friendly callback interface.
     */
    function render (template, context, callback) {
        globalCallback = callback;

        // Grab the iframe sandbox
        var iframe = document.getElementById('sandbox');

        // Put together a message to pass
        var message = { template: template, context: context };

        // Send a message to sandbox with content to render
        iframe.contentWindow.postMessage(message, '*');
    }

    // Listen for messages that come back after rendering done
    window.addEventListener('message', function (event) {
        globalCallback(event.data.content);
    });
};
```

4. Test it Out!
---------------

Now lets try out our `render()` method.

```javascript
/** Call our render() function */

render('foo --> {{ foo }}', { foo: 'bar' }, function (content) {
    document.body.innerHTML = content;
});
```


5. Load it Into Chrome
----------------------

That's it. You can download and run the
[sample code](https://github.com/gschier/swig-templating-chrome-packaged-apps) in Chrome by
following these steps:

- navigate to `chrome://extensions/`
- enable *delevoper mode*
- open project with *Load unpacked extension*


Final Thoughts
--------------

This post covered a basic implementation of using message passing to render
a Swig template. The implementation that I use for
[Insomnia](https://insomnia.rest) is a bit more robust, but uses the same
principles.

If you want me to go more in depth on improving this code let me know on
[Twitter](https://twitter.com/GregorySchier).

Thanks for reading!
