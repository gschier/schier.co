---
title: "Make Catleap Monitor Work With Nvidia Drivers in Ubuntu"
slug: "make-catleap-monitor-work-with-nvidia-drivers-in-ubuntu"
date: "2013-04-18"
url: "blog/2013/04/18/make-catleap-monitor-work-with-nvidia-drivers-in-ubuntu.html"
tags: ["ubuntu", "tutorial"]
---

In short, read this [forum thread](https://ubuntuforums.org/showthread.php?t=2038997).

I recently switched from two 1920x1080 monitors to one 2560x1400 screen. The monitor I purchased was a Yamakasi Catleap (yeah, It sounded weird to me at first too) from a seller on Ebay for a cool $400. However, there were problems using it under Ubuntu.

I've never had much success with the open source Nouveau graphics driver for my hardware, so I tried installing the proprietary Nvidia one. This, however resulted in a blank screen on the next boot. Luckily, I could still use another TTY for debugging the problem. You can also uninstall the Nvidia drivers and get Nouveau back with a few commands.

Anyway, after trying to troubleshoot the problem for a *long* time (thinking it was Nvidia or Ubuntu's fault) I thought that it may be an issue with the Catleap, so I did a quick search and *voila!* this [forum thread](https://ubuntuforums.org/showthread.php?t=2038997) showed me the way. After modifying my `xorg.conf` file to borrow from the "Monitor" and "Screen" sections of the sample config file, my system booted normally with the new driver!

So, in summary, the lesson I learned from this struggle was not to get too deep into researching a solution because the solution is usually simpler than you think. After all, computers aren't that complex *amirite*?



