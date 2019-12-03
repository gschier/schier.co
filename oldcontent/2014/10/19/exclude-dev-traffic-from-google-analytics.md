---
title: "Exclude Dev Traffic from Google Analytics"
slug: "exclude-dev-traffic-from-google-analytics"
date: "2014-10-19"
url: "blog/2014/10/19/exclude-dev-traffic-from-google-analytics.html"
tags: ["tutorial", "webdev"]
---

Google Analytics is a great free tool for tracking your website. To avoid
compromising tracking data, it is important to not have tracking enabled while building,
testing, or fixing things.

Excluding Google Analytics tracking is best done at render-time on the server. However,
for static websites that don't have a server component, the same thing can be done on the frontend
using Javascript. Here's how:


```javascript
// Get the current hostname (ex: "localhost:8000" or "mydomain.com")
var host = window.location.host;

// Check if the host begins with "mydomain.com"
var isProduction = host.indexOf('mydomain.com') === 0;

// Run GA code if on production
if (isProduction) {
    (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
    (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
    m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
    })(window,document,'script','//www.google-analytics.com/analytics.js','ga');

    ga('create', 'MY-TRACKING-CODE', 'auto');
    ga('send', 'pageview');
}
```

Hope this helps.
