---
title: "Jaakt – Update 1"
slug: "jaakt-update-1"
date: "2013-10-03"
url: "blog/2013/10/03/jaakt-update-1.html"
tags: ["update", "sideproject"]
---

I've never written about a new project this early in the development stage, but I thought it would be a good exercise to help me organize all the thoughts in my head. I've been working on a very basic workout logging app called Jaakt and I would like to explain some of the initial process behind the project.

## Choosing a Name

I wanted to use a common bodybuilding adjective for the app and I ended up choosing "jacked" because I thought it sounded best. Of course `jacked.com` was not available so I had to get a bit more creative with it. I ended up going through the following steps to end up with *Jaakt*:

1. Jacked --> Starting adjective
2. Jackd --> Remove last vowel
3. Jakd --> Remove unnecessary letters
4. Jakt --> Add some extra punch
5. Jaakt --> Add letters until `.com` available

I also ended up buying `jaakd.com` because I couldn't fully make up my mind between *Jaakt* and *Jaakd*.

## Motivations

While I don't consider myself to be "jacked", I do try to work out 2 to 3 times per week. I currently jot down my workouts in a Field Notes pocketbook as the image below shows:

![Jaakt Logbook Inspiration](https://s3.amazonaws.com/gschierBlog/images/workoutLog.jpg)

Since I'm a software dev, I inevitably ended up thinking that I could make something better in digital form – so I got started. From the time between 12AM and 3AM last night I made a frontend prototype of the logging system. You can see by the screenshot below that the feature set includes only what's absolutely necessary for me to record a workout. 

![Jaakt Screenshot](https://s3.amazonaws.com/gschierBlog/images/jaaktMock.png)

There are a few more things I want to add, but other than that the frontend is finished. Here are a few things that the frontend still needs:

- a notes field for each workout
- display date of workout
- auto-completion of workout names

And that's about it. The next step is to whip up a backend with some user accounts and data models and be done with it. I'll be posting more of the process along the way so stay tuned for that.











