---
title: "Build a Blog Email Subscription Service using Zapier and Sendwithus"
slug: "build-a-blog-email-subscription-service-using-zapier-and-sendwithus"
date: "2015-04-23"
url: "blog/2015/04/23/build-a-blog-email-subscription-service-using-zapier-and-sendwithus.html"
tags: ["tutorial", "sendwithus", "zapier"]
---

There are many different ways to get notified of new posts for you favourite 
blogs. For example, you could subscribe via RSS or follow a Twitter account
(if there is one). There is also the good ol' fashioned way – email
subscriptions.

I wanted to add email subscription notifications to *my* blog (the thing you're
reading) but didn't want it to be a manual process email every time I published
something new. So, I thought a little bit and realized I could combine a couple
services ([Zapier](https://zapier.com) and
[Sendwithus](https://www.sendwithus.com/)) to come up with something automated.
This post is going to outline the steps needed to build an email notification
system without writing a single line of code.

*I should point out that I am a developer at Sendwithus, but it really doesn't
matter. These instructions can be modified to work with almost any email tool.*


The Requirements
----------------

What does our email subscription service need to do? This is what I asked myself
before starting. Well, there are just a few basic requirements.

- should be able to send an email to a list of subscribers
- should send the emails automatically when a new post goes live
- email content should be dynamically generated based on the new blog post

Each one of these requirements is non-trivial. Building something from
scratch to satisfy these would take a lot of time and on require ongoing
maintenance. Let's not waist our time. That's where our tools come in.


Introducing the Tools
---------------------

Now that we know what our email service needs to do, how do we build it?
There are two tools that work espicially well together that we're going to use
to solve this problem: [Zapier](https://zapier.com) and
[Sendwithus](https://www.sendwithus.com/).


### Zapier

Zapier is a service that makes it really easy to link together different web
services. The main feature Zapier is the ability create what they call a Zap.
A Zap consists of two parts. A source event and an action. Once the Zap is
created, whenever Zapier sees the source event happen it will trigger the
action. This is a pretty hand-wavy explanation so I put together some examples
to help you understand.

- when I post a new tweet, text that tweet to my mom using
  [Twilio](https://twilio.com/)
- when a new issue is created in [Github](https://github.com/), also create a
  task in [Trello](https://trello.com/)
- when a phone number recieves an SMS (Twilio), unlock my door using
  [Lockitron](https://lockitron.com/)

You get the picture. You can pretty much do anything you want, including...

- when an RSS feed updates, send an email to my blog subscribers using
  [Sendwithus](https://www.sendwithus.com/)

Amazing right? **That's exactly what we want!**

Now that we know a bit about Zapier, lets talk a bit about Sendwithus.


### Sendwithus

Sendwithus, to put is simply, is a hosted API platform for sending templated
email. What does this mean? It means that you can programmatically send highly
dynamic and personalized email using any programming language you want.

Here are the core Sendwithus features we'll be using:

- premade responsive email starter templates
- HTML email templating with [Jinja2](https://jinja.pocoo.org/docs/dev/)
- sending email to a customer segment

These three things combined are all we need to get this working. Now that we've
introduced the tech we'll be using, let's get started on the real work.


Step 1 – Create a Zap
---------------------

We're going to skip the easy stuff like registering accounts for Sendwithus and
Zapier. I trust you're smart enough to figure those out on you're own. So,
we'll just dive right in and create our first Zap.

On the "Make a New Zap" page, there are two dropdowns. We're going to select
our event source (RSS) from the first one, and our action (Sendwithus) in the
second. If you haven't yet connected your Sendwithus account to Zapier,
Zapier will prompt you to put in your API key, but that's all you need to get
going.

After selecting Sendwithus, choose the "Send to Segment" action from the
dropdown as the picture below shows. A segment in Sendwithus is basically a
dynamic customer list, defined by one or many rules. The rule that defines my
blog subscribes segment is `have property "confirmed" equals "YES"`. This
tutorial won't be showing you how to get customers into Sendwithus but, if you're
interested, let me know on [Twitter](https://twitter.com/gregoryschier) and I'll
consider that for a future post.

<a href="/images/blog_updates_swu/step1.png" alt="zapier with sendwithus" target="_blank">
    <img src="/images/blog_updates_swu/step1.png" title="zapier with sendwithus" />
</a>


Step 2, 3 – Connect a Sendwithus Account
----------------------------------------

This step is where we configure our accounts. We simply select the Sendwithus
account that we connected to Zapier and leave the RSS account alone (RSS doesn't
have accounts).

After selecting your Sendwithus account, Zapier will make an authentication call
to ensure that everything is configured correctly.

<a href="/images/blog_updates_swu/step2.png" alt="zapier with sendwithus rss" target="_blank">
    <img src="/images/blog_updates_swu/step2.png" title="zapier with sendwithus rss" />
</a>


Step 4 – Select an RSS Feed
---------------------------

This is where the we start seeing the magic. Zapier's RSS integration is pretty
advanced but, for our purposes, we'll only be using the basic settings. Simply
copy and paste the URL of your RSS feed into the first input box and we're done.

If you want to get  really advanced, you can do cool stuff like only trigger
this Zap when the new RSS item matches a specific filter (COOL!).

<a href="/images/blog_updates_swu/step3.png" alt="zapier with sendwithus rss" target="_blank">
    <img src="/images/blog_updates_swu/step3.png" title="zapier with sendwithus rss" />
</a>


Step 4 – Configure the Action
-----------------------------

The next thing we need to do is set up our Sendwithus action. At this point,
I have already created a new email template inside Sendwithus. All I did was
modify one of the stock templates to change some colors and add some templating.
We'll get to that in a second.

So, to configure the action, we need to set a few things. The first one is the
email template that we want to send. So, select the one that you've created from
the dropdown. Next, we need to select the customer segment that we want to send
to. This is the segment that I mentioned earlier (remember?).

Now that we've done that, we need to define the dynamic data that will be passed
to Sendwithus to render the email. The image below shows the three variables
we'll be pulling out of the RSS feed item (url, title, description).

<a href="/images/blog_updates_swu/step4.png" alt="zapier with sendwithus rss" target="_blank">
    <img src="/images/blog_updates_swu/step4.png" title="zapier with sendwithus rss" />
</a>

What is this doing exactly? Once the Zap is live, Zapier will start watching the
RSS feed. Once Zapier detects that a new item has been added, it will pull the
variables we want out of the feed item. Once Zapier has these, it will pass the
data to Sendwithus in an API call. Once Sendwithus receives this API call, it
will render the email template with the given data, and deliver it to the
customer segment.

We can reference the given variables from within our Sendwithus template using
the Jinja2 template language. Here's an example of an extremely basic email
template.

{% raw %}
```html
<html>
    <head></head>
    <body>
        <!-- Title of the RSS feed item -->
        <h1>{{ title }}</h1>

        <!-- First 130 characters of the RSS feed content -->
        <p>{{ description | truncate(130, end="...") }}</p>

        <!-- A link to read the post -->
        <a href="{{ url }}">Click Here to Read</a>
    </body>
</html>
```
{% endraw %}

While this is an extremely basic example, making a friendly and colorful email
is not much more work. Sendwithus provides a bunch of
[responsive email templates](https://www.sendwithus.com/resources/templates)
that you can modify for your needs. I modified a template from the
[Neopolitan](https://www.sendwithus.com/resources/templates/neopolitan) theme
in less than ten minutes.

Here's what my template looks like in the Sendwithus app.

<a href="/images/blog_updates_swu/swu.png" alt="zapier with sendwithus rss" target="_blank">
    <img src="/images/blog_updates_swu/swu.png" title="zapier with sendwithus rss" />
</a>


Step 5 – Test the Zap
---------------------

Alright, now that we have everything set up, how do we know it works?
Fortunately, Zapier lets you test a Zap by pulling in data from the last RSS
feed items and giving you an option to trigger them manually. This is awesome
because you get to test your Zap with **real** content!

Since we don't want to send a test email to our whole subscriber list, first
make a test segment in Sendwithus that only contains a test email address.
Use the `email address contains "myemail@mydomain.com"` rule to accomplish this.
Once you've safely tested the Zap, switch it back to the real segment.

<a href="/images/blog_updates_swu/step5.png" alt="zapier with sendwithus rss" target="_blank">
    <img src="/images/blog_updates_swu/step5.png" title="zapier with sendwithus rss" />
</a>

After my own testing, this is what the email looked like in my inbox
(pun intended).

<a href="/images/blog_updates_swu/email.png" alt="zapier with sendwithus rss" target="_blank">
    <img src="/images/blog_updates_swu/email.png" title="zapier with sendwithus rss" />
</a>


Wrap Up
-------

That's it! We have built fully automated email service in about an hour with no
programming required, thanks to Zapier and Sendwithus :)

Oh, and I should also mention that these services are totally free for
low-volume use cases like this one.

As always, let me know if you have any questions or comments. Thanks for
reading!
