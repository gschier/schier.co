---
title: "How I Implemented a Lantern Lighting Effect in 10 Minutes"
slug: "how-i-implemented-a-lantern-lighting-effect-in-10-minutes"
date: "2015-12-30"
url: "blog/2015/12/30/how-i-implemented-a-lantern-lighting-effect-in-10-minutes.html"
tags: ["gamedev", "libgdx"]
---

I am not an artist, so when I set out to make a game I needed to find other ways
of making it look good. One of the things I did for my game
[Platform Pixels](https://platformpixels.com) was add a lantern lighting effect.
Here's what it looks like (zoomed out for greater effect).

![Platform Pixels Lantern Effect](/images/lantern-effect.gif)

This effect was actually very easy to implement in the game, so I felt like
sharing exactly how it was done.

*NOTE: the code shown is probably only relevant to my game engine, but the
concept can be reused anywhere.*


## From Start to Finish

Every obstacle (level square) in Platform Pixels is treated separately and
drawn separately. This led me to think, what if I darkened each block based on
how far it was away from the player. That would be cool right? So that's exactly
what I did.

I knew what needed to be done. I needed to get the distance to the player and
use that to generate a brightness ratio.

Here's the Java code that uses the
[Pythagorean theorem](https://en.wikipedia.org/wiki/Pythagorean_theorem) to get
the distance to the player.

```java
// Get the distance from the player
float deltaX = Math.abs(player.x - o.x);
float deltaY = Math.abs(player.y - o.y);
float distance = (float) Math.sqrt(
        Math.pow(deltaX, 2) + Math.pow(deltaY, 2)
);
```

Now we can use that distance to calculate the brightness ratio.

```java
// Calculate a brightness ratio from distance
float brightness = 1 - distance / MAX_RADIUS;
```

Ok that's great, but it goes all the way to zero. We don't want the outside to
be completely dark, so I'll set a minimum brightness using the `clamp` function
from libGDX's `MathUtils` library.

```java
float clampedBrightness = MathUtils.clamp(
    brightness,
    MIN_BRIGHTNESS,  // 0.6
    MAX_BRIGHTNESS   // 1
)
```

At this point, the effect works, but the transition is a bit too gradual. Let's
adjust the formula so that it doesn't start the darkening transition right away.
Here is an illustration of what I mean.

![Platform Pixels Lantern Math](/images/lantern-math.png)

And here's the updated code to adjust the fade.

```java
// Calculate a brightness ratio from distance
float brightness = 1 - (distance - MIN_RADIUS) / MAX_RADIUS;
```

Now that we have a ratio we can use to adjust the brightness of each
obstacle in the game. Let's now go ahead and tie it all together.


```java
/**
* Darken a given obstacle in the level based on how far it is from the player
*/
private void darkenObstacle (Obstacle o) {

    // Get the player object
    Player player = mLevel.getPlayer();

    // Calculate distance from player
    float deltaX = Math.abs(player.x - o.x);
    float deltaY = Math.abs(player.y - o.y);
    float distance = (float) Math.sqrt(
            Math.pow(deltaX, 2) + Math.pow(deltaY, 2)
    );

    // Calculate what the brightness should be (explained above)
    float brightness = 1 - (distance - MIN_RADIUS) / MAX_RADIUS;

    // Make sure the brightness doesn't go below a certain level
    float clampedBrightness = MathUtils.clamp(
            brightnessRatio,
            MIN_BRIGHTNESS, // 0.6F
            MAX_BRIGHTNESS  // 1F
    );

    // Actually draw the thing
    o.setDarkness(clampedBrightness);
    o.setBatchColor(mShapeBatch);
    o.draw(mShapeBatch);
}
```

## Wrap Up

And that's it! With a bit of simple math, we get a very stunning lighting
effect. Here it is again one more time.

![Platform Pixels Lantern Effect](/images/lantern-effect.gif)

Thanks for reading. I hope you enjoyed it!
