---
title: "Dynamically Pluralize Like(s)"
slug: "dynamically-pluralize-likes"
date: "2012-12-23"
url: "blog/2012/12/23/dynamically-pluralize-likes.html"
tags: ["tip", "javascript"]
---

I just wanted to share a snippet we use at [ForkJoy](https://forkjoy.com/ "ForkJoy Restaurant Menus") for pluralizing the various "like" counters on the website. Every menu item has one of these counters and the text can read "no likes", "1 like", "2 likes", etc. Originally we were using an if statement to do this until we realized it can be fit on one line instead.

```javascript
var str;

// Prepend with "no" if 0 likes and add
// an "s" if number of likes is not 1
str = (item.likes || 'no') + ' like' + ((item.likes === 1) ? '' : 's');

// The way we first wrote it
if (item.likes === 0) {
  str = item.likes + 'likes'
} else if (item.likes === 1) {
  str = item.likes + 'like'
} else {
  str = 'no likes';
}
```

In the first snippet we take advantage of the fact that the word "like" only appears when there is only one. We also know that the word "no" only prepends the number when there aren't any likes so we can get away with putting this all on one line without having it look messy.


