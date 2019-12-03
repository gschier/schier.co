---
date: 2016-08-09T13:13:34-07:00
title: Add Colorful Cows to Your Terminal
slug: add-colorful-cows-to-your-terminal
tags: ['tutorial', 'terminal']
---

Have you ever wanted to see a random, funny and colorful message every time you launch your 
terminal? Well I did, and and here's how you can do it too.

<!--more-->

![](/images/cow-fortune.png)


## Dependencies

- [`fortune`](https://en.wikipedia.org/wiki/Fortune_(Unix)) to generate a message
- [`cowsay`](https://github.com/piuccio/cowsay) to print a character
- [`lolcat`](https://github.com/busyloop/lolcat) to color the output


## How To

Just add this one-liner to your `.bashrc` and you're all set!

```bash
# Fancy pants one-liner
fortune | cowsay -f $(node -e "var c='$(cowsay -l)'.split('  ');console.log(c[Math.floor(Math.random()*c.length)])") | lolcat --seed 0 --spread 1.0
```

Here's a slightly more comprehensible version of the same code.

```bash
# Randomly select a cow name
cow=$(node -e "var c='$(cowsay -l)'.split('  ');console.log(c[Math.floor(Math.random()*c.length)])")

# Or, if you have shuf (or gshuf) installed
#  cow=$(shuf -n 1 -e $(cowsay -l))

fortune | cowsay -f "$cow" | lolcat --spread 1.0
```


