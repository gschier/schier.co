---
title: "Dabbling in the World of Particle Animation"
slug: "dabbling-in-the-world-of-particle-animation"
date: "2013-03-02"
url: "blog/2013/03/02/dabbling-in-the-world-of-particle-animation.html"
tags: ["experience", "graphics"]
---

I was browsing around [CodePen](https://codepen.io/) today and some particle animation demos caught my eye so I thought to myself, "how hard could that be?" I spent half the day tinkering and this is what I came up with:

## Bouncy Balls

The first thing I wrote was a simple container of moving particles. Each particle is initialized with a random velocity that remains constant throughout its life. The most challenging part of this demo was creating the *bounce* effect. You can achieve this by multiplying the `x` or `y` velocity of the particle by `-1` if it exceeds its horizontal or vertical bounds.

<pre class="codepen" data-height="300" data-type="result" data-href="qtKAw" data-user="gschier" data-safe="true"><code></code><a href="https://codepen.io/gschier/pen/qtKAw">Check out this Pen!</a></pre>
<script async src="https://codepen.io/assets/embed/ei.js"></script>

## Sparkling Candles

Since the first demo was relatively simple I felt like trying something more challenging. Somehow I came up with sparkling candles which seemed simple enough at first, but ended up taking longer than expected (as most things do). The basic particle animation didn't take long to get working, but I added a bunch of subtle effects to make it look more realistic:

- Alpha fade as particles "burn"
- Random particle sizes
- Ending "explosion"
- A bunch of configuration options

<pre class="codepen" data-height="300" data-type="result" data-href="kwdHI" data-user="gschier" data-safe="true"><code></code><a href="https://codepen.io/gschier/pen/kwdHI">Check out this Pen!</a></pre>
<script async src="https://codepen.io/assets/embed/ei.js"></script>

[Refresh Demo](https://cdpn.io/kwdHI)

If you have been reading this article then you probably already missed the sparkling candle animation. You can refresh the demo by clicking [Here](https://cdpn.io/kwdHI).

## Final Notes

If you have never dabbled in the world of `<canvas>` before I highly recommend trying it out. Once you figure out how to draw shapes and set up an [update loop](https://paulirish.com/2011/requestanimationframe-for-smart-animating/) the rest isn't all that difficult. It's definitely a nice change from working on backend server code.

If you have any questions or comments you can leave me a note below, and if you are feeling adventurous you can view the source of each demo by clicking on the top right corner of each.

