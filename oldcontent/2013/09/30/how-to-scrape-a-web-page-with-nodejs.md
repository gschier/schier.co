---
title: "How to Scrape a Web Page with Node.js"
slug: "how-to-scrape-a-web-page-with-nodejs"
date: "2013-09-30"
url: "blog/2013/09/30/how-to-scrape-a-web-page-with-nodejs.html"
tags: ["tutorial", "nodejs"]
---

Even though web APIs are becoming more common, it is still common to find a service you want to get data from but can't because the data is not easily accessible. *Web scraping* is a last-resort technique that requires programatically extracting the required data from a webpage's raw HTML. This tutorial will cover how to download and traverse a web page server-side using Node.js and the Zepto.js library.

## What we're Building

Currently, Google does not offer an API to search and browse Android applications. To get around this, we are going to build a command line tool that takes in an app ID, and spits out a bunch of info for that app. Let's get started by defining our `package.json` file.

## Requirements

The first thing we need to do is install the modules that we will need to perform our task. First, create a `package.json` file in the root of your project directory that looks like this:

<script src="https://codereplay.com/w/web-scraper-dependencies"></script>

We need three modules to perform our task:

- `zepto-node`, a jQuery-like library for traversing the DOM
- `domino`, to simulate the browser DOM in node (*DOM in No*de)
- `request`, to make HTTP calls

Once your `package.json` file is ready to go, type `$ npm install` in your terminal to download and install the dependencies. Once complete, you should see a new directory called `node_modules/` in the root of your project. This means you are ready to get started. Let's write some code.

## The Code

The code for this app needs little explanation. Here is a high level overview of the steps required:

- include required modules
- define the Google Play URL to fetch
- fetch the HTML page
- extract the desired data

The following is a code replay that shows you step-by-step how to create the app. Press *play* and then hit *next* after each step to walk through the code:

<script src="https://codereplay.com/w/web-scraping-in-node.js"></script>

Here is a sample output from running the command on the ForkJoy app:

<script src="https://codereplay.com/w/sample-output-web-scraper"></script>
<br>
## Is That It?

Well that was pretty easy wasn't it? In 30 lines of code we have a command line tool that scrapes information from a web page. So now that you know how easy scraping web pages is with Node.js, what will you build?

