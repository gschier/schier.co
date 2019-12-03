---
title: "How I Fixed libGDX Sounds Causing Game Lag on Android"
slug: "how-i-fixed-libgdx-sounds-causing-game-lag-on-android"
date: "2016-01-07"
url: "blog/2016/01/07/how-i-fixed-libgdx-sounds-causing-game-lag-on-android.html"
tags: ["gamedev", "libgdx", "android"]
---

_tl;dr add silence to your sound files if they're too short._

The release of my first ever mobile game
[Platform Pixels](https://platformpixles.com) is coming up, so I've been
testing it on as many devices as I can. I was confident after seeing it
run on an old HTC One X (2012) but was saddened when I later saw it stutter
on a more powerful Nexus 7 (2013). Then I noticed something. The stutter
disappeared completely when I disabled the sound.

The framework that the game uses is [libGDX](https://libgdx.badlogicgames.com/)
so naturally I began searching for things like _android libGDX audio lag_ to try
to find a solution. Unfortunatly, there didn't seem to be many people
experiencing the same problem. This led me to believe that it was my fault, so
I went through a few libGDX sound tutorials to be certain that I was doing
everything correctly. I was.

Then, after about an hour more of debugging and searching, I came
across this very understated [Stack Overflow answer](https://stackoverflow.com/a/29431378)...

![Stack Overflow answer to audio lag](/images/stackoverflow-libgdx-silence.png)

That's it? Make the sounds longer? How could that possibly be a solution to the
problem? It seemed like a troll answer since it only had one up vote and no
comments, but I had tried everything else already and had no more ideas. So, I
gave it a shot and it worked! I added a second of silence to the end of every
sound and the stutter went away. I could finally relax in peace.

Thanks for reading, and I hope this saved you a lot of time if you
had the same problem. If you have any thoughts or reasoning on the issue I would
love to hear from you. If not, I guess I'll just have to suffer eternally for not
knowing. Thanks a lot Google.
