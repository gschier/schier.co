---
title: "Google Analytics in Chrome Packaged Apps"
slug: "google-analytics-in-chrome-packaged-apps"
date: "2014-12-13"
url: "blog/2014/12/13/google-analytics-in-chrome-packaged-apps.html"
tags: ["tutorial", "chrome app"]
---

*tl;dr use the
[Chrome Platform Analytics Library](https://github.com/GoogleChrome/chrome-platform-analytics/wiki).*

Today I released my first [Chrome Packaged App](https://insomnia.rest). When I first set out to
build a packaged app I didn't know how restrictive it would be. For security reasons, Google
disallows a lot of behavior that is usually acceptable in regular web development. One of these
behaviors is the execution of external scripts, such as
[Google Analytics](https://www.google.com/analytics/).

After spending a while on Google, I figured out how to properly use Google Analytics in a Chrome
Packaged App. Here's how...

Google has a Github repository called
[Chrome Platform Analytics](https://github.com/GoogleChrome/chrome-platform-analytics). This repo
contains a JavaScript library that can be downloaded and included as a local script in any
packaged app. This gets around the external script restriction.

The [wiki](https://github.com/GoogleChrome/chrome-platform-analytics/wiki) provides all the
instructions needed to get started.
