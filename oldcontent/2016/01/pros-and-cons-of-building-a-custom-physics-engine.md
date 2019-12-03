---
title: "Pros and Cons of Building a Custom Physics Engine"
slug: "pros-and-cons-of-building-a-custom-physics-engine"
date: "2016-01-08"
url: "blog/2016/01/08/pros-and-cons-of-building-a-custom-physics-engine.html"
tags: ["gamedev"]
---

I am currently building a 2D platformer game called
[Platform Pixels](https://platformpixels.com). I chose to build the game using the
[libGDX](https://libgdx.badlogicgames.com/) framework because it can export to
iOS, Android, and Desktop very easily. The framework also includes (optionally)
the [Box2D](https://github.com/libgdx/libgdx/wiki/Box2d) physics engine, but I
chose not to use it. Instead, I wrote my own physics engine.

<!--more-->

The purpose of this post is to explain why I chose to write my own engine and
also detail whether or not I still think it was worth while. In order follow
along, you'll need to know what the game is like, so here is a short gif to give
you a feel for the mechanics.

![Platform Pixels Sample Gameplay](/images/platform-pixels/platformpixels-gameplay2.gif)

Now that you have some context around the game, let's dive into physics engines.


Benefits and Pitfalls
---------------------

To help outline the benefits and pitfalls of building a custom physics engine,
I've centered them around four groups.

1. Learning Experience
2. Flexibility
3. Performance
4. Fun!

You might notice that these all sound like benefits but but don't worry, the
pitfalls are in there. Even though these four things may sound like benefits
they might not be for everyone, and they all have trade-offs.

So, without any further ado, let's get started.


### 1. Learning Experience

If you love learning new things and you've never built a physics engine before,
I highly recommend giving it a try. Even if nothing tangible comes from it, I
guarantee you won't regret it.

![learning](/images/learning.gif)

Not many people know this, but the creation of Platform Pixels was actually an
accident. Before knowing anything about game development or even graphics
programming, I was curious about the HTML5 canvas element so I started playing
around with it. As soon as I drew a rectangle on the screen I was
hooked. I wanted to take it further. This thinking eventually led me to create
a very basic 2D engine.

So how did I go from drawing a rectangle to making a platformer? These are
roughly the steps I went through to get there:

1. draw a rectangle on the screen
2. make the rectangle move across the screen
3. make the rectangle bounce off the edges
4. add gravity (downwards acceleration)
5. add keyboard controls to make the rectangle move and jump

At this point, I had a rectangle that could move and jump around the screen.
In order to take the demo to a full platformer, I just had to extend the
collision detection to support arbitrarily sized rectangles with arbitrary
coordinates. So I did that.

I won't go into any more detail about how the engine works (that's not the point
of this post) but I will say that the process of figuring out how to build it
has taught me **A LOT** so, even if Platform Pixels isn't a success, I have
already benefited from the experience immensely.


### 2. Flexibility

Flexibility is sort of an obvious benefit of building a custom physics engine.
If you're not relying on anyone else's libraries, you can build whatever you
want however you want.

In the screenshot at the top of the post you probably noticed how the
character (Block Boy) can stick to walls. I also mentioned that the creation of
the game was an accident. Well, the wall sticking was also an accident. This
mechanic actually came from a bug in the engine when I first created it. I ended
up liking it so much that I fixed it and implemented it properly. And, what
seemed like a complicated feature ended up being just a couple lines of code!

![Platform Pixels Wall Stick Code](/images/platform-pixels/platformpixels-wall-code.png)

Depending on the out-of-the-box physics engine you choose, adding a feature
like this might take much more effort. You might spend a lot of time reading
documentation on how to extend the engine, and it might also take a lot of
code as to implement. but, since the engine I built was so simple and I knew
exactly how it worked, this feature only took minutes to add.

Now, I should point out that not all custom engine features will be this easy.
I've had to throw away more than one idea because I either didn't know how
to implement it properly, or I knew that the engine wouldn't be able to
support it because of an early design decision or existing optimization. I've
also had to do one (thankfully only one) major engine refactor which took an
entire weekend.

So don't think that just because you build an engine you are going to get
infinite flexibility. If you build it perfectly, you may get what you want. If you
build it wrong, you are just putting up walls that your future self will have to
break down.


### 3. Performance

Performance isn't always a guaranteed benefit of building your own engine, and
if you ignore performance then your engine will surely be choppy and slow.

Getting performance benefits really depends on your technical ability and the
complexity of features that you want to add. The engine for Platform Pixels is
very basic, so it allowed me to keep things simple and optimize aspects of it
based on certain assumptions.

To give you an example, here are some of the assumptions I have made and the
benefits that came from them.

- **ASSUMPTION**: the engine will only need to support squares
    - **BENEFIT**: no complex math equations for polygon intersection
    - **BENEFIT**: collision detection is only about 50 lines of `if` statements (that's it!)
    - **BENEFIT**: levels can be represented by PNG files so no need for a level editor
- **ASSUMPTION**: all (almost all) objects in the world have deterministic positions based on play time
    - **BENEFIT**: support for very large levels because only objects in view need to be referenced
    - **BENEFIT**: object draw calls can take more time if they need

These benefits have been amazing. Unfortunately, there are trade-offs (as always).
These assumptions have provided simplicity and performance but they have also
limited the features that I can add down the road. For example, I can never add
triangular spikes or round rolling enemies!


### 4. Fun!

Like performance, having fun building a custom engine might not be a benefit to
everyone. Like I stated above, the reason I decided to build an engine was for
the learning experience. As a result, I've had a lot of fun doing it. If you just
want to build a game, then you probably won't have fun writing your own engine.

I think there is one way to figure out if you will have fun building your own
engine. Just ask yourself this. Are you building an engine because you want to
make a game, or are you making a game because you want to build an engine? If
you answer *yes* to the first question, don't build an engine because you won't
be motivated to put the effort in to making it great. If you answer *yes* to the
second question, stop reading this post, open your editor, and start building.
No really, do it. Why are you still here?


Was it Worth it?
----------------

*tl;dr YES*

Now that I've covered the main benefits and drawbacks I've experienced
while building the physics engine for
[Platform Pixels](https://platformpixels.com) you must be wondering if I still
think it's worth it. Well, the short answer is **YES**, it was worth it. The
long answer is a bit more complicated.

Since the major motivation for me was to learn something new, I really enjoyed
the initial design and development of the engine. However, I've been losing
motivation as time passes because I learn less and less as the game nears
completion. Because of this, I probably won't be building a custom physics
engine for my next project unless I need something that I can't get from an
out-of-the-box solution. I don't think learning will be a big enough motivator
next time.

I'd love to hear your thoughts and opinions in the comments below! Thanks for
reading :)

