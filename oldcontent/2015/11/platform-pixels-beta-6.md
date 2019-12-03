---
title: "Platform Pixels – Beta 6"
slug: "platform-pixels-beta-6"
date: "2015-11-27"
url: "blog/2015/11/27/platform-pixels-beta-6.html"
tags: ["platform pixels", "update"]
---

**Android Beta**: Visit [Beta Link](https://play.google.com/apps/testing/com.platformpixels.app.android)<br>
**iOS Beta**: DM your email to [@PlatformPixels](https://twitter.com/PlatformPixels)

It's been a couple weeks since the last beta, but that's fine because this is a
big one! Along with an entire engine rewrite, this beta includes a bunch of
visual improvements and refinements.


Changelog
---------

Here's what's new:

- new lighting effects
- better visuals
- moving obstacles
- tweaked levels
- coins now remain collected
- total coins now shown in the UI
- now have gold and silver coins (10 silver == 1 gold)
- rewrote controller logic
- rewrote/refactored entire game engine


### New Lighting Effects

The most noticeable thing in this beta is the new visual effects that I
mentioned above. I posted Platform Pixels on
[/r/playmygame](https://www.reddit.com/r/playmygame/comments/3sasvf/platform_pixels_2d_platformer/)
and got some great feedback. One piece of feedback mentioned that the game mechanics were
solid but it wasn't very visually interesting. So, I spent about two hours 
and ended up with something I'm really happy with. 

Here's a screenshot of what it looks like.

![Platform Pixels New Visuals](/images/platform-pixels/platformpixels-lighting-effects.png)

Compared to what it was before.

![Platform Pixels Old Visuals](/images/platform-pixels/platformpixels-old-lighting.png)


### New Coin Mechanics

Coin mechanics are something that I've been thinking about for a while. This 
beta introduces the concept of gold and silver coins. Each gold coin is worth
10 silver, and gold coins are generally harder to find. Coins now also stay 
hidden once collected.

The current plan for coins is to make the player collect a certain amount to 
unlock a *boss* level. I'm not 100% certain that this will be the final use for
coins, but that's what I'm going with for now.


### New Engine

The thing that I spend the most time on this beta (that you probably won't notice)
is rewriting the game engine. This was mostly for fun, but it has also made it
easier to add new features and enemy types, so hooray for that! 


Up Next
-------

Surprisingly, there isn't much left on the pre-1.0 road map. I'm satisfied with
the current 8 levels and am finally happy with how the game looks. My plan is to
release v1.0 to the Google Play store by the end of the year, along with an iOS
version shortly after. Here is the current list of what's left to do.

- level completion summary screen (after beating a level)
- better level selection screen (show fastest time, number of coins, etc)
- add a few more levels to the first world
- add a boss level
- add a "Coming Soon" screen for the next world

See? Not much left! I'm sure there are a bunch more things in there that I
haven't thought of yet, but the end is in sight.
