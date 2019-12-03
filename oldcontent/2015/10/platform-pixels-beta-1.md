---
title: "Platform Pixels – Beta 1"
slug: "platform-pixels-beta-1"
date: "2015-10-12"
url: "blog/2015/10/12/platform-pixels-beta-1.html"
tags: ["platform pixels", "update"]
---

*Beta Access: join the [Android Beta](https://plus.google.com/communities/113735941596133351612)
and follow [@PlatformPixels](https://twitter.com/PlatformPixels) for updates*

Platform Pixels is a mobile-first 2D platformer meant to be
simple, easy to learn, yet extremely difficult. If this is your first time
hearing about it, check out the
[Update 1](/blog/2015/10/11/platform-pixels-update-1.html) post to find out
more information.

![Platform Pixels Beta 1 Level](/images/platform-pixels/platformpixels-beta1-level.png)

The Beta Program
----------------

This is the first post I've written about the Platform Pixels beta program. The
goal of the program is to publish a post (like this one) alongside every new
beta release. Each post will cover what's new in the release and go into detail
about certain aspects of the development process including interesting
solutions to problems, implementation details, marketing, distribution, and even
pie-in-the-sky ideas for the future. 

If you want early access to the game itself, you can join the
[Google+ Beta Community](https://plus.google.com/communities/113735941596133351612)
to install the app, or you can just follow the progress here on my site. The
beta is only available to Android users right now, but I plan on opening it up
to other platforms as it stabilizes. If you really want to see support for 
other platforms, feel free to reach out and bump the invisible priority counter
in my head.

At this stage, the beta is more of a demo than anything, and may change
drastically between updates. My intention is to get early-stage feedback on
things like controls, difficulty, playability, other high-level aspects that
you have feedback on.


Release Details (5 Items)
-------------------------

As mentioned above, Beta 1 is pretty much a demo. The basic mechanics and 
controls are fairly polished, but the level progression and UI are pretty bad
still. Here are a few of the major things you'll find in Beta 1.


### 1. Levels 

Beta 1 includes 16 hand-built levels, ranging from easy to difficult. The first
few levels are meant to introduce the player to the different mechanics and,
as the levels progress, combine the mechanics to make longer and more difficult
levels.

#### DEEP DIVE! How a level is defined

Right now (under the hood) each level is represented by two PNG images. The
first image tells the game what to draw on the screen (visually), and the second
image tells the game information about things on the level. Here is an example.

![Platform Pixels Level Editor](/images/platform-pixels/platformpixels-level-editor.png)

The image on the left is what the player sees, and the image on the right 
defines metadata about each square on the level. This is what the colors on
the right mean.
 
- `Purple`: Player's start position
- `Yellow`: Coin
- `Red`: Death
- `Green`: Level finish

This is a huge benefit of keeping the game simple. I have no need for a level
editor because I can use any image editing program I want to generate these. 
This also makes the possibility of user-submitted levels much more achievable
(hint hint).


### 2. Coins

There are a few coins placed in each level that can be collected. You can
collect them if you want, but right now they don't count towards anything. Look
forward to a later update where coins will play a larger role in game
progression.

![Platform Pixels Beta 1 Coins](/images/platform-pixels/platformpixels-beta1-coins.png)


### 3. Player Trail

As you play through a level, the platforms that you touch will slowly change
color. It won't be uncommon for a level to take 10 or 20 tries to complete, so
the trail provides a visual indicator for where you've been before and how you
got there.

*NOTE: You might notice that the blocks start blending in with the background and
become invisible. This was not intentional but it might be an interesting
mechanic to frustrate the player even more.*


### 4. Level Selection Menu

If you press the *back* button during a level, you will be taken to the level
selection screen. Right now, the purpose of this screen is for easy level 
switching during development, but will probably be completely different once
the game is closer to release.


### 5. Google Play Games

Beta 1 includes code to connect to Google Play games. Right now, it
will prompt you to sign in every time you launch the game (until you sign in),
but it isn't currently used for anything yet. I have a task to make Play Games
optional but that won't be out until a future beta.



Up Next
-------

This week I began working on a tool to procedurally generate levels. I was
getting tired of generating levels by hand (it's a lot of work!) so this would
free up some of my time to focus on other things. It's going to be a lot more
work up front, but it will make content creation in the future much easier.

I'll probably do a few separate posts on the level generation details so stay
tuned for that.

Until then, thanks for reading and enjoy the beta!
