---
title: "Generalize Routes in Express Using Closures"
slug: "generalize-routes-in-express-using-closures"
date: "2013-09-06"
url: "blog/2013/09/06/generalize-routes-in-express-using-closures.html"
tags: ["tutorial", "nodejs"]
---

If you've ever built a website using Node.js and Express then you've probably had to do something similar to the following snippet:

```javascript
//////////////////////
// ROUTE DEFINITIONS

app.get('/', routes.index);
app.get('/landing', routes.landing);
app.get('/signin', routes.signin);
app.get('/join', routes.join);


//////////////////////////////////////
// MULTIPLE FUNCTIONS IN ROUTES FILE

exports.index = function(req, res) {
  res.render('index');
}

exports.landing = function(req, res) {
  res.render('landing');
}

exports.signin = function(req, res) {
  res.render('signin');
}

exports.join = function(req, res) {
  res.render('join');
}
```

So what's wrong with this code? Too much repetition! With this method, every time a new static page is needed you have to add it in two places. Luckily, this problem can easily be solved using closures. A closure is simply a function combined with a reference environment (ie. scope).

```javascript
//////////////////////
// ROUTE DEFINITIONS

app.get('/', routes.generalPage('index'));
app.get('/landing', routes.generalPage('landing'));
app.get('/signin', routes.generalPage('signin'));
app.get('/join', routes.generalPage('join'));


//////////////////////////////////////
// SINGLE FUNCTION IN ROUTES FILE

module.exports.generalPage = function(viewName) {

  // Return closure containing viewName in its scope
  return function(req, res) {
    res.render(viewName);
  };
};
```

The magic lies within `generalPage()`. When called, `generalPage()` returns a function that keeps reference to `viewName` which then can be used to render the appropriate view file. So next time you have a repetition problem in your code base, don't forget about closures!



