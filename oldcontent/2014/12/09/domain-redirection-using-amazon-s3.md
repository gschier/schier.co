---
title: "Domain Redirection Using Amazon S3"
slug: "domain-redirection-using-amazon-s3"
date: "2014-12-09"
url: "blog/2014/12/09/domain-redirection-using-amazon-s3.html"
tags: ["tutorial", "devops", "aws"]
---

Setting up redirect is one of the most common tasks in web development. Whether redirecting
a single page to another, or redirecting an entire domain to a new one. Knowing how to set up
redirects is a basic requirement for any web developer. In this post, I'm going to show you how to
set up a domain redirect with nothing more than an [Amazon S3](https://aws.amazon.com/s3/) bucket.


Common Use Cases
----------------

There are a lot of different use cases for redirection. The one I'm going focus on today is the
domain redirect. This means redirecting all traffic for a single domain to a new one.
There are a lot of use cases where this type of redirect is needed. Here are a few that come to
mind right away:

- `www.domain.com -> domain.com`
- `olddomain.com -> newdomain.com`
- `blog.domain.com -> domain.com/blog`

The most common way to implement redirects is to add redirect rules to a webserver configuration
file (Apache, Nginx, etc). This is usually the easiest approach, but there are a few cases
where this solution is either inconvenient, difficult, or impossible to implement. Here are some
examples of why that might be:

- hosting a website on a platform that you do not control
- using a platform like [NodeJS](nodejs.org) where redirect implementation is not built-in
- hosting a static website.

For these use cases, domain redirects needs to be implemented external to the main webserver.
Setting up an Apache server to strictly manage redirects would be overkill and expensive. Luckily,
S3 provides an easy and cheap way to do redirects with almost no work involved.


Domain Redirects on Amazon S3
-----------------------------

Amazon S3 is a storage service usually used for storing static assets like images, scripts
and stylesheets. One of the lesser-known facts of S3 is that it can also be set to two other
modes: a static webserver, or a basic redirect server.

I currently have two redirects on *schier.co*. All traffic going to
`www.schier.co` forwards to `schier.co` and all traffic going to `blog.schier.co` goes to
`schier.co/blog`. An important requirement of this is that `blog.schier.co/my/first/post` needs
to maintain its path and redirect to `schier.co/blog/my/first/post`. Luckily, S3 handles this
scenario out of the box.


Enabling Domain Redirection on Amazon S3
----------------------------------------

Adding domain redirects with S3 can be done in just a few steps. The first is to
create a new bucket from the admin panel. The important thing to point out here is that the bucket
name must match the name of the URL pointing to it, or **it won't work**.

In this example I'll be redirecting `blog.schier.co` to `schier.co/blog` so I need to make a
bucket called `blog.schier.co`.

<a href="/images/s3newbucket.png" target="_blank">
    <img alt="blog.schier.co Bucket" src="/images/s3newbucket.png" />
</a>

Now that I have a bucket, I need to point the `blog` subdomain domain at it. To do this, I'll need
to create a CNAME DNS record. This step will be different depending on your domain registrar but
the concepts basic concepts are the same.

<a href="/images/hover.png" target="_blank">
    <img alt="Schier.co Redirects" src="/images/hover.png" />
</a>

In the screenshot above, I've entered a new CNAME record that points `blog` to the URL of the S3
bucket `blog.schier.co.s3-website-us-east-1.amazonaws.com`. The last step is to actually create
the redirect rule. First, I'll navigate to the bucket properties and click on *Static Website
Hosting*, then check the bubble saying *Redirect all requests to another host*. Here's what it
looks like:

<a href="/images/s3redirect.png" target="_blank">
    <img alt="Schier.co Redirects" src="/images/s3redirect.png" />
</a>

At this point the redirect should be functional. Try going to
[blog.schier.co/2014/12/09/domain-redirection-using-amazon-s3.html](https://blog.schier.co/2014/12/09/domain-redirection-using-amazon-s3.html)
to see it in action.


Wrap Up
-------

That's it for this tutorial.

As always, feel free to reach out on Twitter or Google Plus if you have any questions.
