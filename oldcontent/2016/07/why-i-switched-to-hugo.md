---
date: 2016-07-30T15:58:51-07:00
slug: "why-i-switched-to-hugo"
title: "Why I Switched to Hugo"
tags: ["blogging", "golang"]
---

Last weekend I converted my website (the one you're looking at) to the 
[Hugo Static Website Engine](https://gohugo.io/). If you don't already know, a static website 
engine converts a directory structure of (usually) 
[Markdown](https://daringfireball.net/projects/markdown/) files to a set of HTML 
files that can be uploaded to a static web server like [Surge.sh](https://surge.sh/).

I've grown fond of Hugo over the past few days so I thought share a few of the things I like and
dislike about it. Let start with the things I like...


## What I Like About Hugo

Before Hugo, I was using an engine that I built myself called 
[Balloon](https://github.com/gschier/balloon). Balloon worked great up until this point, it won't
be able to do some of the more advanced things I'm looking to implement soon. That's where Hugo
comes in.

There are a few main reasons why I switched to Hugo.


### 1/3 – Installation

One of the reasons why I didn't go with [Jekyll]() (perhaps the most popular static engine) is 
because I didn't want to deal with installation and setup of Ruby. Since Hugo


### 2/3 – Build and Reload Performance

Compiling my entire collection of over 100 blog posts went from taking five seconds half of a 
second. Also, Hugo's _watch_ capability is usually able to reload the browser with my changes
before I can even `⌘ Tab` back to the browser!

```shell
$> time hugo
Started building site
0 of 1 draft rendered
0 future content
105 pages created
0 non-page files copied
22 paginator pages created
0 tags created
in 247 ms
```
    
    
### 3/3 – Flexible Categorization

Hugo has powerful [categorization](https://gohugo.io/taxonomies/overview/) built in. All it takes
to tag and categorize a post is the addition of some metadata at the top of the post. You can
even create your own _taxonomies_ if you want to group posts based on something unique like what
programming language it relates to.

```yaml
---
title: "Why I Switched to Hugo" 
slug: "why-i-switched-to-hugo"
date: 2016-07-30T15:58:51-07:00
tags: ["Development", "Blogging"]
language: ["Go"]
menu: "Best Blog Posts"
---

This is [Markdown](https://daringfireball.net/projects/markdown/).
```


## What I Dislike About Hugo

My complaints on Hugo are mostly about **poor onboarding** and don't really bother me now
that I've spent a few days learning it, but here they are anyway.

- error messages are not very descriptive (debugging user error is hard)
- the documentation is hard to navigate (huge accordion sidebar)
- themes are low quality (I ripped the logic out of one and started over)
- Go template syntax is weird, but I'm getting used to it
- conf written in the obscure [TOML](https://github.com/toml-lang/toml), but also supports `YAML` and `JSON`


## Wrap Up

Hugo is a great static engine for the technical blogger. I hit a few hurdles in the beginning, but
after learning a few basic concepts and developing a custom theme it's been a pleasure to use and
I'm sure it will be for a long time. 


