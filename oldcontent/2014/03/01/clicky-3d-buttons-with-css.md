---
title: "\"Clicky\" 3D Buttons with CSS"
slug: "clicky-3d-buttons-with-css"
date: "2014-03-01"
url: "blog/2014/03/01/clicky-3d-buttons-with-css.html"
tags: ["tutorial", "webdev"]
categories: ["best of"]
---

I wanted to challenge myself to come up with some really tactile 3D CSS buttons and ended up with
the result shown below. This is a short tutorial on how I used CSS to make this possible:

<style>
button.clicky {
  position: relative;
  margin-top: 0;
  margin-bottom: 10px;
  box-shadow: 0 10px 0 0 #6B2A4A;
  display: block;
  background: #a47;
  color: #eee;
  padding: 1em 2em;
  border: 0;
  cursor: pointer;
  font-size: 1.2em;
  opacity: 0.9;
  border-radius: 10px;
}
button.clicky:active {
  box-shadow: none;
  top: 10px;
  margin-bottom: 0;
}
button.clicky:hover {
  opacity: 1;
}
button.clicky:active,
button.clicky:focus {
  outline: 0;
  border: 0;
}
</style>

<button class="clicky" style="margin:auto">Click Me!</button>

There are two main components to creating these buttons. The first component is creating the bottom
edge, and the second component is making the button move without disrupting its surroundings.


## 1. Creating The 3D Edge

There are two possible way of *drawing* the button's bottom edge. The method I chose was to use an
offset `box-shadow` with no blur radius. The other possible option is to create the bottom edge
using a thick `border-bottom` style. This option, however, is more limiting as it prevents the use
of additional border style but is a bit more browser-friendly.


## 2. Making it Move

Making the button move down on click is simple. We just need to set a relative top position to the
thickness of the box shadow, then make the box shadow disappear. In CSS, on-click styles are added
with the `:active` selector. Take a look at the CSS below; I've commented the important parts to
make it easy to understand.

```css
/** CSS **/

.clicky {
  /** Offset the Position **/
  position: relative;
  top: 0;
  margin-top: 0;
  margin-bottom: 10px;

  /** 3D Block Effect **/
  box-shadow: 0 10px 0 0 #6B2A4A;

  /** Make it look pretty **/
  display: block;
  background: #a47;
  color: #eee;
  padding: 1em 2em;
  border: 0;
  cursor: pointer;
  font-size: 1.2em;
  opacity: 0.9;
  border-radius: 10px;
}

.clicky:active {
  /** Remove 3D Block Effect on Click **/
  box-shadow: none;
  top: 10px;
  margin-bottom: 0;
}

.clicky:hover {
  opacity: 1;
}

.clicky:active,
.clicky:focus {
  /** Remove Chrome's Ugly Yellow Outline **/
  outline: 0;
}
```

```html
<!-- HTML -->

<button class="clicky">CLICK ME!</button>
```


## Final Worlds

That's It! Now you can have the most bad-ass buttons on the block. Hopefully the CSS was clear enough that you understood what was going on. If you need clarification let me know in the comments below, or on one of the social networks (see page header or footer)


~ Gregory ʘ‿ʘ














