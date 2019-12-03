---
title: "Switching From Vim to IntelliJ"
slug: "switching-from-vim-to-intellij"
date: "2015-04-19"
url: "blog/2015/04/19/switching-from-vim-to-intellij.html"
---

Anyone who knows me knows how much I love Vim. I even wrote
[a post](/blog/2014/02/07/vim-and-i-a-love-story.html) about it. In the past
few months, however, I've found some things that made me start looking
elsewhere for a great editing experience. It was time for a replacement.

Recently I've gotten back into Android development which, unfortunately,
requires programming in Java. Anyone that has written Android code knows how
much an IDE can do for you. Vanilla Vim just doesn't cut it. Yes,
there are ways to make Vim behave like an IDE ([Eclim](https://eclim.org/)),
but none of them are amazing.


Rediscovering IntelliJ IDEA
---------------------------

About a year ago, Google released an offical Android IDE called
[Android Studio](https://developer.android.com/tools/studio/index.html), which
is a modified version of [IntelliJ IDEA](https://www.jetbrains.com/idea/)
(created by Jetbrains).

I really liked Android Studio when I first tried it, but the Vim plugin
[IdeaVim](https://plugins.jetbrains.com/plugin/164) was missing a key feature
which prevented me from using it – key mappings. I use the
[Colemak](https://colemak.com/) keyboard layout, so having the ability to remap
keys is an absolute necessity. During my search for a Vim replacement, I looked
into IdeaVim again to see if it had gotten better. It had. In fact, it now
supports a subset of `.vimrc` commands, including key remapping.  Hooray! This
means that I can use the same `.vimrc` file for both Vim and Android Studio.

I didn't just want to do Android development though. I needed an editor that
supported writing code in any language. After a quick search, I found out
that if you purchase the full version of IntelliJ, Jetbrains' most expensive
IDE, you can add the features of all of their other IDEs (PhpStorm,
PyCharm, Webstorm, etc) by installing the necessary plugins. Amazing! That was
enough to convince me to install the trial.


Impressions After Two Months
----------------------------

I'm going to try and keep this post to the point, so here is a short description
of my favorite things about IntelliJ after my first two months of use.


### 1. The Interface

The thing that really sets IntelliJ apart from other IDEs, like Eclipse, is the
interface. IntelliJ comes with an optional dark theme (called Darcula) and it's
beautiful. Yes, it's still a Java app, but at least it looks good.

Besides a pretty dark theme, IntelliJ's UI exceeds in another area – minimalism.
If you want, you can hide every toolbar and window leaving just the editor in
view. That's right, IntelliJ doesn't have to look gross and busy like most
out-of-the-box IDEs. Here's a basic screenshot of me editing
[Insomnia](https://insomnia.rest/), a [React](https://facebook.github.io/react/)
project.

---
title: "Switching from Vim to IntelliJ"
slug: "switching-from-vim-to-intelliJ"
date: "2015-04-04"
url: "blog/2015/04/04/switching-from-vim-to-intellij.html"
tags: ["tools"]
---

<a href="/images/intellij/react.png" target="_blank">
    <img src="/images/intellij/react.png" alt="IntelliJ ReactJS" style="max-width:100%"/>
</a>


### 2. Search Everywhere

*Search Everywhere* is by far my most used IntelliJ feature. It's like the
`ctrl-p` (or `cmd-p`) shortcut of [Sublime Text](https://www.sublimetext.com/),
but on steroids. As you can see in the screenshot below, this feature lets you
search things like files, symbols, IDE actions, and even IDE settings. And,
if a boolean setting appears in the list, IntelliJ lets you toggle it right
from the dropdown!

<a href="/images/intellij/searcheverywhere.png" target="_blank">
    <img src="/images/intellij/searcheverywhere.png" alt="IntelliJ Search Everywhere" style="max-width:100%"/>
</a>


### 3. Diff Visualizer

I use (and you should too) version control for every project. I used
to use a tool on Ubuntu called Gitg to look at Git diffs, but IntelliJ actually
does a better job.

<a href="/images/intellij/diffs.png" target="_blank">
    <img src="/images/intellij/diffs.png" alt="IntelliJ Git Diff" style="max-width:100%"/>
</a>


### 4. Code Editing Features


Here are a few features that IntelliJ offers that make writing code much easier:

- refactoring tools
    - rename variables
    - change function arguments
    - etc...
- auto import of files and libraries
- go-to-definition
    - easily jump to the definition of a function, class, etc
    - it even works for symbols in external libraries
- find usages
    - search the codebase for all the usages of a class, function, etc
- more than simple linting
    - code linting for all major languages
    - smart analysis of function arguments, etc
    - will tell you if a variable hasn't been defined, or function args don't
    match

This is a pretty messy list of things so it may not mean much to you, but I
am continually impressed by small editing features like these. Something that
impressed me most is that these features also work surprisingly well for
less-strict languages like Python and Javascript.


### 5. Plugins

The plugin ecosystem of IntelliJ is awesome. As I mentioned before, the
only reason I can use IntelliJ is because the Vim plugin is so good.

Besides IdeaVim, I have installed many other plugins for things like editing
Markdown, formatting JSON, programming language support (coffeescript, JSX,
etc), and many other things that I'm probably forgetting.


### 6. Honorable Mentions

Here are some other (more minor) things that are pretty cool.

- you can build your own toolbars from the ground up
- settings can be synced with your IntelliJ account
- package management is built in (Python Pip, Node NPM, etc...)
- built in terminal that lets you plug in whatever you want (Bash, ZSH, Fish,
  etc)
- diagram generation for class hierarchies or database relations



Where IntelliJ Fails
--------------------

It can't all be good right? This post has listed a large number of things I
like about IntelliJ, but what about the things I don't like? Here's a few
examples.


### 1. Quick File Edits

IntelliJ is an IDE, which means it's inherently centered around a project.
The downside of this is that it's not good for creating one-off files that
aren't tied to any specific project. An example of this is writing a one-off
script, or editing system dotfiles like `.zshrc` or `.bash_profile`.

IntelliJ offers support for *scratch files*, which are one-off files, but the
ease of use of these is nowhere near that of editing a file in Vim from the
command line.


### 2. Resource Hog

This is an obvious one. IntelliJ is a large Java application that does
a massive amount of computation and code analysis behind the scenes. I develop
on a Dell XPS 15, which is a top-of-the-line laptop, but every once in a while
things freeze up for a second or two. This only seems to be a problem on
larger-than-average projects, but it's something to keep in mind.

IntelliJ does offer the ability to tune the amount of background checking it
does, but I can never bring myself to turn any of those features off. After all,
that's one of the largest benefits of using an IDE.


### 3. Buggy Plugins (nitpick)

This isn't really IntelliJ's fault, but a few of the plugins I've found have
either crashed or have interrupted my editing experience in some way.


### 4. Cost

Elephant in the room! IntelliJ is not cheap. I don't mind paying for the tools
that I use every day, but cost seems to be the highest barrier for everyone
that I talk to about IntelliJ.


## Conclusion

So that's it. I've been using IntelliJ for two months now and am pretty happy
with it. I still use Vim for a few things, but since I can share the same
`.vimrc` file between both it's easy and familiar to switch back and forth
any time.

I'm definitely going to keep using IntelliJ for the foreseeable future, but I'm
sure something different will catch my interest eventually.
