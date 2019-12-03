---
title: "Pure HTML Share Buttons"
slug: "pure-html-share-buttons"
date: "2014-10-22"
url: "blog/2014/10/22/pure-html-share-buttons.html"
tags: ["tutorial", "webdev"]
categories: ["best of"]
---


<style>
/** Social Button CSS **/

.share-btn {
    display: inline-block;
    color: #ffffff;
    border: none;
    padding: 0.5em;
    width: 4em;
    box-shadow: 0 2px 0 0 rgba(0,0,0,0.2);
    outline: none;
    text-align: center;
}

.share-btn:hover {
  color: #eeeeee;
}

.share-btn:active {
  position: relative;
  top: 2px;
  box-shadow: none;
  color: #e2e2e2;
  outline: none;
}

.share-btn.twitter { background: #55acee; }
.share-btn.google-plus { background: #dd4b39; }
.share-btn.facebook { background: #3B5998; }
.share-btn.stumbleupon { background: #EB4823; }
.share-btn.reddit { background: #ff5700; }
.share-btn.linkedin    { background: #4875B4; }
.share-btn.email { background: #444444; }
</style>


Today we're going to be making some HTML-only share buttons
([view on Github](https://github.com/gschier/html-share-buttons)):


<div class="text-center">
<a class="share-btn twitter" href="https://twitter.com/share?url={{ encodeURIComponent(baseUrl + page.urlPath) }}&text={{ encodeURIComponent(page.title) }}&via=GregorySchier" target="_blank" class="btn bg-twitter"><i class="fa fa-twitter"></i></a>
<a class="share-btn google-plus" href="https://plus.google.com/share?url={{ encodeURIComponent(baseUrl + page.urlPath) }}" target="_blank" class="btn bg-google-plus"><i class="fa fa-google-plus"></i></a>
<a class="share-btn facebook" href="https://www.facebook.com/sharer/sharer.php?u={{ encodeURIComponent(baseUrl + page.urlPath) }}" target="_blank" class="btn bg-facebook"><i class="fa fa-facebook"></i></a>
<a class="share-btn stumbleupon" href="https://www.stumbleupon.com/submit?url={{ encodeURIComponent(baseUrl + page.urlPath) }}&title={{ encodeURIComponent(page.title) }}" target="_blank" class="btn bg-stumbleupon"><i class="fa fa-stumbleupon"></i></a>
<a class="share-btn reddit" href="https://reddit.com/submit?url={{ encodeURIComponent(baseUrl + page.urlPath) }}&title={{ encodeURIComponent(page.title) }}" target="_blank" class="btn bg-reddit"><i class="fa fa-reddit"></i></a>
<a class="share-btn linkedin" href="https://www.linkedin.com/shareArticle?url={{ encodeURIComponent(baseUrl + page.urlPath) }}&title={{ encodeURIComponent(page.title) }}" target="_blank" class="btn bg-linkedin"><i class="fa fa-linkedin"></i></a>
<a class="share-btn email" href="mailto:?subject={{ encodeURIComponent(page.title) }}&body={{ encodeURIComponent(baseUrl + page.urlPath) }}" target="_blank" class="btn bg-email"><i class="fa fa-envelope"></i></a>
</div>


Share buttons are a great way to drive more traffic to a website. Unfortunately, most share buttons
social networks provide are ugly and may even require loading of external scripts. __*Yuck*__. Luckily,
it is possible to create share links with a single anchor tag for some of the more popular social
networks. Social networks do this so users can add share links to HTML emails (email doesn't support
scripts).

The Basics
----------

Share links are very simple. Simply make an anchor tag that points to a sharing URL of the desired
social network and attach some [query params](https://en.wikipedia.org/wiki/Query_string) to tell the
network what to share.

Here is some basic markup for Twitter, Google Plus, Facebook, StumbleUpon, Reddit, LinkedIn, and
Email share links:

```html
<!-- Basic Share Links -->

<!-- Twitter (url, text, @mention) -->
<a href="https://twitter.com/share?url=<URL>&text=<TEXT>via=<USERNAME>">
    Twitter
</a>

<!-- Google Plus (url) -->
<a href="https://plus.google.com/share?url=<URL>">
    Google Plus
</a>

<!-- Facebook (url) -->
<a href="https://www.facebook.com/sharer/sharer.php?u=<URL>">
    Facebook
</a>

<!-- StumbleUpon (url, title) -->
<a href="https://www.stumbleupon.com/submit?url=<URL>&title=<TITLE>">
    StumbleUpon
</a>

<!-- Reddit (url, title) -->
<a href="https://reddit.com/submit?url=<URL>&title=<TITLE>">
    Reddit
</a>

<!-- LinkedIn (url, title, summary, source url) -->
<a href="https://www.linkedin.com/shareArticle?url=<URL>&title=<TITLE>&summary=<SUMMARY>&source=<SOURCE_URL>">
    LinkedIn
</a>

<!-- Email (subject, body) -->
<a href="mailto:?subject=<SUBJECT>&body=<BODY>">
    Email
</a>
```

Adding Some Style
-----------------

The share links above are just HTML anchor tags, which means we can style them however we want.
Below is a sample of the share buttons I made for this website. Just some simple CSS,
combined with some [Font Awesome Icons](https://fortawesome.github.io/Font-Awesome/icons/).

Here is the markup for these buttons:

```HTML
<!-- Social Button HTML -->

<!-- Twitter -->
<a href="https://twitter.com/share?url=<URL>&text=<TEXT>&via=<VIA>" target="_blank" class="share-btn twitter">
    <i class="fa fa-twitter"></i>
</a>

<!-- Google Plus -->
<a href="https://plus.google.com/share?url=<BTN>" target="_blank" class="share-btn google-plus">
    <i class="fa fa-google-plus"></i>
</a>

<!-- Facebook -->
<a href="https://www.facebook.com/sharer/sharer.php?u=<URL>" target="_blank" class="share-btn facebook">
    <i class="fa fa-facebook"></i>
</a>

<!-- StumbleUpon (url, title) -->
<a href="https://www.stumbleupon.com/submit?url=<URL>&title=<TITLE>" target="_blank" class="share-btn stumbleupon">
    <i class="fa fa-stumbleupon"></i>
</a>

<!-- Reddit (url, title) -->
<a href="https://reddit.com/submit?url=<URL>&title=<TITLE>" target="_blank" class="share-btn reddit">
    <i class="fa fa-reddit"></i>
</a>

<!-- LinkedIn -->
<a href="https://www.linkedin.com/shareArticle?url=<URL>&title=<TITLE>&summary=<SUMMARY>&source=<SOURCE_URL>" target="_blank" class="share-btn linkedin">
    <i class="fa fa-linkedin"></i>
</a>

<!-- Email -->
<a href="mailto:?subject=<SUBJECT&body=<BODY>" target="_blank" class="share-btn email">
    <i class="fa fa-envelope"></i>
</a>
```

And here is the CSS:

```CSS
/** Social Button CSS **/

.share-btn {
    display: inline-block;
    color: #ffffff;
    border: none;
    padding: 0.5em;
    width: 4em;
    box-shadow: 0 2px 0 0 rgba(0,0,0,0.2);
    outline: none;
    text-align: center;
}

.share-btn:hover {
  color: #eeeeee;
}

.share-btn:active {
  position: relative;
  top: 2px;
  box-shadow: none;
  color: #e2e2e2;
  outline: none;
}

.share-btn.twitter     { background: #55acee; }
.share-btn.google-plus { background: #dd4b39; }
.share-btn.facebook    { background: #3B5998; }
.share-btn.stumbleupon { background: #EB4823; }
.share-btn.reddit      { background: #ff5700; }
.share-btn.linkedin    { background: #4875B4; }
.share-btn.email       { background: #444444; }
```

Wrap Up
-------

In case you missed it above, I also put the code for these buttons on
[Github](https://github.com/gschier/html-share-buttons).

I hope you found this useful. Be sure to click on the share buttons below to see how they work ;)
