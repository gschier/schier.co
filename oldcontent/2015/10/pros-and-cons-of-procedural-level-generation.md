---
title: "Pros and Cons of Procedural Level Generation"
slug: "pros-and-cons-of-procedural-level-generation"
date: "2015-10-23"
url: "blog/2015/10/23/pros-and-cons-of-procedural-level-generation.html"
tags: ["gamedev", "opinion"]
---

Over the past few months I've been working on a 2D platformer game called
[Platform Pixels](https://platformpixels.com) as a side project. A large part of
making a game like this is designing and creating levels. I started off doing this
by hand, but quickly realized that it was taking more time than I wanted.

To speed up the development cycle, I wrote a
[Procedural Level Generator](https://github.com/gschier/platform-pixels-level-generator)
to make levels *for* me. It can randomly generate a level for the game in
seconds, which is a huge improvement.

![Platform Pixels Level Generator](/images/platform-pixels/platformpixels-cli.png)

Saving time is great, but there are many reasons why using a level generator is
a bad idea. The goal of this post is to share what I've learned about level
generation to provide insight to anyone considering a similar approach.

![Platform Pixels Gameplay Sample (for context)](/images/platform-pixels/platformpixels-gameplay.gif)


PRO: It Saves Time
------------------

As I mentioned in the introduction, manually creating levels is a lot of work.
This would be bearable if it were a one-time job, but it's far from that.
Game mechanics change frequently (especially during the early stages), and these
changes usually force the developer to modify or recreate existing levels. This
is a lot of work, and after a doing it a few times, you end up not wanting to
change too much because it will mean creating new content. This is not what you
want when building a new game.

Level generation eliminates this barrier because it only takes seconds to create
new levels instead of hours. This yields shorter iteration cycles and encourages
the developer to make changes more often, resulting in a better game overall.


PRO: Prevents Getting Bored of the Game
---------------------------------------

One of the biggest side effects of creating levels by hand is the amount of play
testing required to make them good. This didn't seem like such a bad thing at
first, but I quickly saw the downsides. There are two major downsides that come
from overplaying a level.

> How do I know it's fun if I've played it a hundred times?

**Play Testing Makes Levels Boring**. How do I know a level is fun if I've
already played it a hundred times? The only solution is to wait a few days and
play it again but that takes time, and I don't have that.

**Play Testing Makes Levels Easy**. How do I know a level is the right
difficulty if I've played it a hundred times? By that point it's usually so easy
that I can beat it with my eyes closed. This makes creating a balanced set of
levels almost impossible.

Again, level generation saves the day because it eliminates play testing almost
entirely. You still need to play the levels that you generate, but only one or
two times, instead of hundreds.


CON: Hard to Generate Visually Unique Levels
--------------------------------------------

Perhaps the worst part about computers is that they aren't creative or original.
This makes building a level generator that outputs visually appealing and unique
levels extremely difficult. Players don't want to play the same boring thing
over and over. Ideally, every levels should have a unique feature or style, but
this is something that is hard to achieve even when creating levels by hand.

One way to improve on this is to make the generator more configurable. If I could
tell the generator things like "generate a level that looks like a cave, and the
entire floor is lava" that would be great! Unfortunately, this is very hard to
do and probably not worth it. It would so much time to make a generator
configurable like that that you might as well go back to making levels by hand.

So, if you're thinking of building a level generator. First understand that the
levels it produces won't be as appealing as if a creative person made them by
hand.


CON: Hard to Change The Generation Algorithm
--------------------------------------------

Something I didn't realize until after launching the initial Android beta was how
much impact changing the generation algorithm would have on the levels. Due to the
random nature of the generator, any small change to the code ended up generating
a completely different set of levels. Here's why that's bad.

If level 5 of Beta 3 was really interesting and awesome, there is a high chance
that it would be replaced by something less interesting and awesome in Beta 4.
Every new generation is a gamble.

I put this down as a con, but it's really not a huge deal most of the time. Yes,
it sucks to lose a good level, but chances are that if you run the generator a
few more times you'll end up with a level that's just as good (or better). Also,
as you work on the generator, the average quality of level will hopefully go up.


BONUS: A Hybrid Approach
------------------------

I was talking with my coworker
[Brad](https://twitter.com/bvanvugt) about level generation, and he suggested
using the generator as a starting point, instead of expecting it to produce
production quality levels. These levels could then be edited manually afterwards
to tweak things and add visual flair. This provides the best of both worlds with
almost no downsides, so that's the approach I'm going to take.

Currently, my plan is to use the level generator during the beta stage of
Platform Pixels. This gives me the fast iteration cycles needed to improve the
game quickly, and also helps me focus on the game mechanics instead of the
content. Then, once the mechanics are solid, I'm going to build off the generated
levels and add visual appeal and uniqueness.

Wrap Up
-------

If there's anything I want you to take away from this post, it's that level
generators save time, but they can't be creative enough to replace a human. If
you really want awesome levels, you need to put in some manual work. However,
this doesn't mean that you can't use a bit of technology to do some heavy
lifting and assist you along the way.

I hope you got something valuable out of this post. Be sure to follow this blog
for more updates on Platform Pixels development if you enjoyed reading this.
