---
title: "Ubuntu Unity Multitouch Gestures"
slug: "ubuntu-unity-multitouch-gestures"
date: "2013-02-13"
url: "blog/2013/02/13/ubuntu-unity-multitouch-gestures.html"
---

I recently discovered that Unity supports multitouch gestures. I had already known about using a three finger drag to move a window, but there are more. The [Ubuntu Wiki](https://wiki.ubuntu.com/Multitouch) has a list of all of the supported gestures. The supported gestures include the following:

- 3 finger pinch to maximize/restore windows
- 3 finger press and drag to move window
- 3 finger touch to show grab handles
- 3 finger double tap -> switches to previous window
- 3 finger tap followed by 3-fingers hold -> shows window switcher
  - drag those 3-fingers -> change selected window icon
  - release fingers -> selects window and closes switcher
- 3 finger tap followed by 3-fingers hold -> shows window switcher
  - release fingers -> switcher will kept being shown for some seconds still
  - drag with one or three fingers -> change selected window
  - release finger(s) -> selects window and closes switcher
- 3 finger tap followed by 3-fingers hold -> shows window switcher
  - release fingers -> switcher will kept being shown for some seconds still
  - tap on some window icon -> selects that icon and closes the switcher
- 4 finger swipe left/right to reveal launcher (if the dock autohide is enabled)
- 4 finger tap to open dash

The way I found out about these gestures was actually an accident. Every once in a while my Unity dock would pop out for no reason and refuse to hide again. The last time this happened I noticed that my hand had swiped across my trackpad by accident, so my first thought was that this must have been triggered by a hidden gesture.

After searching Google for a few seconds I came across the aforementioned wiki page and found out that a four-finger swipe to the right reveals the dock. From what I can tell, the only way to hide the dock after doing this is to repeat the gesture in the other direction. This is fine if you already know about the feature, but if you don't you'll have to do what I used to do and log out of your session to reset the dock.

