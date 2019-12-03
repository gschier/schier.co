---
title: "The Perfect Static Website Generator is the One You Write Yourself"
slug: "the-perfect-static-website-generator-is-the-one-you-write-yourself"
date: "2014-12-02"
url: "blog/2014/12/02/the-perfect-static-website-generator-is-the-one-you-write-yourself.html"
tags: ["opinion", "blogging"]
---

There are many static website generators out there
(see [staticgen.com](https://www.staticgen.com/)). This post is to explain why I chose to
write my own generator instead of using an off-the-shelf solution.

What is a Static Website Generator?
===================================

A static website generator is typically a command line tool that takes a directory of files,
performs operations on them, and then writes the output to a *build* directory. The build
directory is usually deployed to a static website host such as
[Github Pages](https://pages.github.com/) or [Amazon S3](https://aws.amazon.com/s3/).

Here are some examples of operations that a static generator might perform:

- render template logic
- parse and convert [Markdown](https://daringfireball.net/projects/markdown/) to HTML
- run CSS preprocessors
- compress or resize images
- compile, minify, and concatenate JavaScript

This is just a short list of some of the operations a static generator might be required to
do but there is much more that could be added to that list, including use-case-specific
functionality.

It was not too long ago that I found myself with my own use case for a static generator. Here is
the process I went through along with the conclusions I made along the way...


Finding the Perfect Generator for Me
------------------------------------

I spent a long time researching static generators. I was looking for one
built on NodeJS that supported a [Jinja](https://jinja.pocoo.org/docs/dev/)-like template
language. I found a couple that could have worked, but none were perfect. There was always
that one little thing missing that I couldn't do without. No matter how hard I looked I couldn't
find one for me. It made me sad.

There are so many ways to implement features of a static generator. Look at templating,
for example. Let's say I'm writing a generic static website generator expecting
many people to use it. I'll probably pick the template language that the most people will like. If
there is enough demand I might add a few more, but that's a lot of work.

The problem is that there are literally hundreds of template languages in the world, making it
impossible for a generator to support all of them. If I do happen find a generator that supports
my desired templating language then what are the chances that it will also support SASS and
CoffeeScript, have support for image compression, and be compatible with my specific work flow?
Basically zero.

One static generator that caught my eye was [Metalsmith](https://www.metalsmith.io/),
written by the good folks at [Segment](https://segment.com/). Matalsmith is essentially a plugin
system for generating static websites which means it uses plugins to do almost everything.
When I saw Metalsmith I got excited. I knew it could find a plugin for most things and then write
my own plugins if needed for more specific functionality. That's when it hit me.

**Fuck plugins**. I'll just write my own generator.


Just Write Your Own
-------------------

Static generators read, transform, and write files. The read and write steps are trivial to
implement and the transform step can usually be done by calling a third-party module.

So, if I can write a simple script to read and write files from a source directory to a build
directory, I should be able to easily *plug* code in between to do transformations. The more I
thought about it, the more I realized how easy it actually was.

To help get my point across, here is a simplified static generator written in a few lines of Python:

```python
""" a simple static website generator """

for file in directory.getFilesRecursively():

    # render Markdown
    if file.extension == '.md':
        bodyContent = renderMarkdown(file.read())

    # compile SASS
    elif file.extension == '.scss':
        bodyContent = compileSass(file.read())

    # compress images
    elif file.extension in ['.jpg', '.jpeg', '.png']:
        bodyContent = compressImage(file.read())

    # leave alone (HTML files, JavaScript, etc)
    else:
        bodyContent = file.read()

    # render the template
    renderedContent = templateLibrary.render(bodyContent)

    # write the file to the build directory
    buildPath = file.path.replace('/source', '/build')
    writeFile(buildPath, renderedContent)
```

There are a few things missing but making this code actually work isn't hard. The hardest
part is be picking modules and reading module documentation, which is exactly what I would of had
to do if I used Metalsmith except I wouldn't get the enjoyment of hacking on something on my own.


Advice to You
-------------

So after all of this, I have built a working static site generator in NodeJS. The code is up
on [Github](https://github.com/gschier/balloon) but I don't recommend using it. I think the total
line count for version zero was around ~500 lines of code but it's gone up since then from added
features. I'm also currently in the process of breaking the code up into components to make it a
bit more maintainable.

And finally, here is my advice to you:

```python

def shouldWriteOwnStaticGenerator(person):
    if person.isPickyAboutTech():
        return "Yes"
    else:
        return "Use Jekyll"
```

Thanks for reading, and feel free to reach out if you want to chat about cool tech stuff.



Bonus: What a Generator Shouldn't Do
------------------------------------

I know some people might be reading this thinking, but a static generator also does *blank*. You
are correct. Some static generators do other things as well, but most of these other things can
and should be done with other tools. Here are some examples:

### Serve and Live-Reload the Build Directory

I wrote mine using a simple [file-watching library](https://github.com/paulmillr/chokidar) combined
with a simple [static web server](https://github.com/expressjs/serve-static), but you Grunt for
this ([tutorial](https://rhumaric.com/2013/05/reloading-magic-with-grunt-and-livereload/)) as well.


### Deploying Build Directory

If you're using [Github Pages](https://pages.github.com/) then you just use Git to deploy. If you
are using [Amazon S3](https://aws.amazon.com/s3/) or something similar, you can usually find
[a module](https://www.npmjs.org/package/s3) that will let you write a deploy script in a couple
lines of code.


### Draft/Publish Workflows

This is what Git is for. Just create a new branch. Boom! Draft support.
