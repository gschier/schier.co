---
title: "Cyanogenmod Alarm Clock Turns Itself Off"
slug: "cyanogenmod-alarm-clock-turns-itself-off"
date: "2014-12-06"
url: "blog/2014/12/06/cyanogenmod-alarm-clock-turns-itself-off.html"
tags: ["android"]
---

[Cynanogenmod](https://www.cyanogenmod.org/) is an *aftermarket firmware* (typicically known
as a custom ROM) for Android. It adds many new features and makes a lot of improvements, especially
for the power user. Some of these improvements are in the alarm clock app.

I've been using Cyanogenmod for years. Recently I noticed that sometimes the alarm clock
will go off in the morning, then snooze by itself without me touching it. I thought this would seem
like an obvious bug and get fixed right away, but it hasn't. This morning it finally hit me. I
now know the reason for this unexpected behaviour.

![Cynanogenmod Alarm Clock](/images/cyanogenmod_alarm_1.png)

The screenshot above shows a setting in the app to *snooze alarm* when the phone is shaken.

The next screenshot shows a setting to vibrate the phone when the alarm goes off. I'm sure
you can put the pieces together yourself at this point.

![Cynanogenmod Alarm Clock](/images/cyanogenmod_alarm_2.png)

You guessed it. The vibration of the phone can cause enough movement to trigger the snooze of the
alarm clock. Simply disable one of these settings and it won't happen anymore.
