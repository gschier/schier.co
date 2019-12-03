---
title: "Rethinking The Programming Tutorial"
slug: "rethinking-the-programming-tutorial"
date: "2013-08-06"
url: "blog/2013/08/06/rethinking-the-programming-tutorial.html"
tags: ["announcement", "sideproject", "codereplay"]
---

I got sick of posting lengthy programming tutorials so I sat down and tried to come up with a more condensed way to do things. I concluded that programming tutorials usually follow this pattern:

- introduction
- code followed by a description of the code
- code followed by a description of the code
- code followed by a description of the code
- conclusion

What is wrong with this pattern? Too much repetition! A programmer's duty is to cut down on repetition, so that's what I did. I ended up creating a tutorial builder called [Code Replay](https://codereplay.com/), which is meant to refactor this awful pattern into something much simpler:

- introduction
- Code Replay tutorial
- conclusion

Using Code Replay, the typical programming tutorial will consist of some introductary text, followed by a Code Replay embed, capped off with some concluding thoughts. Clean and simple.

## How it works

Code Replay converts multiple versions of a file into a screencast-like, interactive tutorial. It uses Google's [diff library](https://code.google.com/p/google-diff-match-patch/) to detect the difference between each file version, then plays back the changes in a way that looks like it's being typed in real time. Besides being a simple diff player you can also do the following:

- add hover tooltips to any portion of text
- name each step
- add a [Markdown](https://daringfireball.net/projects/markdown/) description of each step

As of right now Code Replay still has some work left, but the end is in sight. If you have any feedback or suggestions I'd be happy to hear them.

Thanks for reading!

