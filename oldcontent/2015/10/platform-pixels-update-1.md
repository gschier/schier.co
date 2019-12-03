---
title: "Platform Pixels – Update 1"
slug: "platform-pixels-update-1"
date: "2015-10-11"
url: "blog/2015/10/11/platform-pixels-update-1.html"
tags: ["platform pixels", "update"]
---

*Summary: join the [Android Beta](https://plus.google.com/communities/113735941596133351612)
and follow [@PlatformPixels](https://twitter.com/PlatformPixels) for updates*

In late 2013, I launched a web-based game named Platform Pixels as a side
project and learning experience. Platform Pixels was a 2D platformer meant to be
simple, easy to learn, yet extremely difficult. It was heavily influenced by
iconic games like Super Mario Brothers 3, Super Mario World, and Super Meat Boy,
and a few other classics that I played growing up.

![Platform Pixels v2.0 Promo](/images/platform-pixels/platformpixels-v2-promo.png)

While the game was fun, it was not very well thought out, and was more of a
prototype than anything. So, I recently started working on a v2.0, which will be
mobile-first, cross platform, and have a lot more depth than a simple prototype.

This post will provide a brief history of what went on behind the scenes of v1.0
as well as outline what I have planned for v2.0 and beyond. As work on the game
progresses, I will continue to write about how it's going, the problems I
encounter, and other things like planning, distribution, design,
and algorithms.


The History
-----------

I built an initial version of Platform Pixels in late 2013. It was web only,
poorly planned, and wasn't anything close to a success. The reason I built it
was primarily as a learning experience. I wanted to understand how physics
engines (primarily collision detection) worked, so I started building an engine
from scratch. Like most problems, I broke it down into achievable steps, and
got to work. Here are some of the main steps I took to end up with the initial
physics engine.

1. make a rectangle move on the screen (basic animation)
2. make a rectangle move at a given velocity, independent of framerate
3. make the rectangle change direction once hitting the edge of the screen
4. make the y velocity have an acceleration (gravity)
5. apply a jump velocity when spacebar is pressed
6. apply left/right velocity when the arrow keys are pressed
7. figure out a bunch of math to do rectangle collision detection (will do a
later post on this)

I was able to accomplish this in about three days, and was fairly satisfied with
the result. During this period I also accidentally implemented the wall jump,
which was super fun and turned out to be the core mechanic of the game.

![Platform Pixels v1.0](/images/platform-pixels/platformpixels-v1.png)

I won’t go into any more details in this post about the initial version, but the
gist of it is that I liked the mechanics so much that I decided to make some
real levels and put it on the internet for others to play. 


Platform Pixels v2.0 – A Complete Rewrite
-----------------------------------------

My original intention for rewriting Platform Pixels was to port the web 
version to mobile I could play it on the go. Having mobile support would also 
expose the game to a larger audience to (hopefully) gain more traction.

During the planning phase, I came across a cross-platform game framework called 
[libGDX](https://libgdx.badlogicgames.com/). “Perfect!” I though. libGDX would
let me write a game for Android (which I was already familiar with) and provide
one-click exports to iOS, desktop, web, and even blackberry!

I started thinking about it some more. Like I said above, I wasn’t satisfied 
with v1.0. While it was fun to play, it felt more like a prototype than 
anything. I had so many ideas for tweaks and improvements that I decided to 
scrap the whole project and start over. I took a weekend to rewrite the physics 
engine for libGDX and, for fun, didn’t reference the old code. Not referencing 
the old code allowed me to approach some problems from different angles and make 
a bunch of improvements and performance optimizations. The result was a much 
more robust and performant physics engine that allowed for levels of 10-100 
times the size as before.

This got me really excited. It had only been two days and I had something that 
was, from a technical perspective, much better than the original. That was the 
point that I mentally committed myself to the project.


Next Steps
----------

This week I decided to stop messing around and really commit to the game. I 
currently have a working physics engine, an easy way to make levels, and have 
even started on a procedural level generator. Most importantly, though, I have 
a solid plan for player progression, content, distribution, and monetization 
(yes, the one you hate :P).

![Platform Pixels v2.0 Gameplay](/images/platform-pixels/platformpixels-v2-gameplay-1.png)


Follow Platform Pixels Development
----------------------------------

Something I really love is when companies openly develop software. 
[Wolfire Games](https://blog.wolfire.com/) does a great job at doing this with
their work in progress *Overgrowth*. They have an interesting strategy of
releasing alpha versions of their game every week to those who’ve preordered,
and they also creat videos and blog posts about the design and development
process along the way.

I want to take a similar approach for Platform Pixels and document as much of 
the process as possible including blog posts (primarily), videos, tutorials, 
demos, and even code samples.

For now, if you’d like to follow along, you can do any of the following

- join the beta (currently Android only) 
    [here](https://plus.google.com/communities/113735941596133351612)
- follow [@PlatformPixels](https://twitter.com/PlatformPixels) on Twitter
- follow my personal Twitter account [@GregorySchier](https://twitter.com/GregorySchier)
- subscribe to this blog (below)

Thanks for reading, and I hope you enjoy the updates to come!
