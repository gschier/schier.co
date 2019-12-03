---
title: "Simple Vanilla JavaScript Typing Carousel"
slug: "simple-vanilla-javascript-typing-carousel"
date: "2013-10-09"
url: "blog/2013/10/09/simple-vanilla-javascript-typing-carousel.html"
tags: ["tutorial", "webdev"]
---

Last night I worked on a simple [JavaScript plugin](https://codepen.io/gschier/pen/jkivt) that rotates snippets of text periodically. Here is a sample of it in action:

<h3 style="text-align:center;background:#f5f5f5;font-weight:200;padding:1em;margin:1em;font-size:2.3em;">This plugin is
  <span
     class="txt-rotate"
     data-period="2000"
     data-rotate='[ "nerdy.", "simple.", "vanilla JS.", "fun!" ]'>
  </span>
</h3>


All you need to do is insert a &lt;span&gt; where you want the rotating text to be:

```html
<h3>This plugin is
  <span
     class="txt-rotate"
     data-period="2000"
     data-rotate='[ "nerdy.", "simple.", "vanilla JS.", "fun!" ]'>
  </span>
</h3>
```

As you can see from the markup above, the plugin accepts a period (optional) telling it how long to pause after each piece of text is fully typed, as well as a JSON encoded array of text snippets that it will rotate through. 

The plugin has no dependencies and requires only a single snippet of JavaScript to run. I created a [Gist](https://gist.github.com/gschier/6903476) of it for your convenience, or you can take a look at the code below:

```javascript
var TxtRotate = function(el, toRotate, period) {
  this.toRotate = toRotate;
  this.el = el;
  this.loopNum = 0;
  this.period = parseInt(period, 10) || 2000;
  this.txt = '';
  this.tick();
  this.isDeleting = false;
};
 
TxtRotate.prototype.tick = function() {
  var i = this.loopNum % this.toRotate.length;
  var fullTxt = this.toRotate[i];
 
  if (this.isDeleting) {
    this.txt = fullTxt.substring(0, this.txt.length - 1);
  } else {
    this.txt = fullTxt.substring(0, this.txt.length + 1);
  }
 
  this.el.innerHTML = '&lt;span class="wrap"&gt;'+this.txt+'&lt;/span&gt;';
 
  var that = this;
  var delta = 300 - Math.random() * 100;
 
  if (this.isDeleting) { delta /= 2; }
 
  if (!this.isDeleting && this.txt === fullTxt) {
    delta = this.period;
    this.isDeleting = true;
  } else if (this.isDeleting && this.txt === '') {
    this.isDeleting = false;
    this.loopNum++;
    delta = 500;
  }
 
  setTimeout(function() {
    that.tick();
  }, delta);
};
 
window.onload = function() {
  var elements = document.getElementsByClassName('txt-rotate');
  for (var i=0; i&lt;elements.length; i++) {
    var toRotate = elements[i].getAttribute('data-rotate');
    var period = elements[i].getAttribute('data-period');
    if (toRotate) {
      new TxtRotate(elements[i], JSON.parse(toRotate), period);
    }
  }
  // INJECT CSS
  var css = document.createElement("style");
  css.type = "text/css";
  css.innerHTML = ".txt-rotate &gt; .wrap { border-right: 0.1em solid #666 }";
  document.body.appendChild(css);
};
```

If you have any questions let me know in the comments below, and if you like what you see you can follow me on [Codepen.io](https://codepen.io/gschier), [Twitter](https://twitter.com/gregoryschier), or subscribe to my [RSS Feed](https://schier.co/rss.xml)

<script>
var TxtRotate = function(el, toRotate, period) {
  this.toRotate = toRotate;
  this.el = el;
  this.loopNum = 0;
  this.period = parseInt(period, 10) || 2000;
  this.txt = '';
  this.tick();
  this.isDeleting = false;
};
 
TxtRotate.prototype.tick = function() {
  var i = this.loopNum % this.toRotate.length;
  var fullTxt = this.toRotate[i];
 
  if (this.isDeleting) {
    this.txt = fullTxt.substring(0, this.txt.length - 1);
  } else {
    this.txt = fullTxt.substring(0, this.txt.length + 1);
  }
 
  this.el.innerHTML = '<span class="wrap">'+this.txt+'</span>';
 
  var that = this;
  var delta = 300 - Math.random() * 100;
 
  if (this.isDeleting) { delta /= 2; }
 
  if (!this.isDeleting && this.txt === fullTxt) {
    delta = this.period;
    this.isDeleting = true;
  } else if (this.isDeleting && this.txt === '') {
    this.isDeleting = false;
    this.loopNum++;
    delta = 500;
  }
 
  setTimeout(function() {
    that.tick();
  }, delta);
};

setTimeout(function() {
  var elements = document.getElementsByClassName('txt-rotate');
  for (var i=0; i<elements.length; i++) {
    var toRotate = elements[i].getAttribute('data-rotate');
    var period = elements[i].getAttribute('data-period');
    if (toRotate) {
      new TxtRotate(elements[i], JSON.parse(toRotate), period);
    }
  }
  // INJECT CSS
  var css = document.createElement("style");
  css.type = "text/css";
  css.innerHTML = ".txt-rotate > .wrap { border-right: 0.07em solid #666 }";
  document.body.appendChild(css);
}, 50);
</script>


<h5 style="text-align:center;background:#f5f5f5;font-weight:200;padding:1em;margin:1em;font-size:1.4em;">Have a 
  <span
     class="txt-rotate"
     data-period="2000"
     data-rotate='[ "great", "relaxing", "exciting" ]'>
  </span> day!
</h5>









