---
title: "Blog Publishing Using iOS Shortcuts and Netlify"
slug: "blog-publishing-from-bear"
date: "2019-01-21"
url: "blog/2019/01/21/blog-publishing-from-bear.html"
tags: [ "life" ]
---

Recently, I bought an iPad Pro and have been using it for basically everything except software development, which it's not yet good at. This led to a problem, however, because I've been wanting to start blogging again but publishing posts requires many software-development-like activities which, again, the iPad is not good at.

Here's what currently needs to happen to publish a post:

1. Write a post in [Markdown](https://en.m.wikipedia.org/wiki/Markdown) format
2. Generate/add frontmatter (URL, title, date, tags, etc) to top of file
3. Add the file to my [Blog's GitHub Repository](https://github.com/gschier/schier.co)
4. Wait for [Netlify](https://www.netlify.com) to pick up GitHub change and redeploy the website

This entire flow is actually possible on the iPad using an app called [Working Copy](https://workingcopyapp.com) but its built-in text editor is not ideal for writing. In a perfect world, publishing new posts could be done from my favorite note-taking app, [Bear](https://bear.app). Bear already has the ability to export Markdown, so I spent some time to see if it might be possible. The good news? I came up with a workflow that I'm happy with. The bad news? There are a couple pitfalls.

## Bear + Shortcuts + Netlify = Publishing
In iOS 12, Apple released a new app called [Shortcuts](https://itunes.apple.com/ca/app/shortcuts/id915249334?mt=8) which allows the user to automate tasks by linking together things called "actions". To my surprise, Shortcuts provides an action for sending data to a web URL. Perfect!

After learning a bit about Shortcuts, I came up with a plan:

1. Create Netlify function (URL) to accept a file and published it to GitHub 
2. Create a shortcut to send blog post contents to Netlify function
3. Make shortcut visible in iOS Share Sheet so it could be accessed from within Bear

This solution makes it possible to share a note directly from Bear to the shortcut. The shortcut then passes it along to the Netlify function to do the publishing, taking less than a minute to complete from start to finish!

So how does it work exactly?

## Writing the Netlify Function
Netlify supports the ability to write one-off JavaScript functions that can be called via a specific web address. Because of the complexity of the task at hand, this was the best place to perform the logic of generating the post metadata and publishing it to GitHub. 

Here's a simplified version of the JavaScript code inside the Netlify function:

```javascript
const octokit = require('@octokit/rest')();

// This will be called when the Netlify function is invoked
exports.handler = async function (event, context) {
  // Generate and prepend metadata to Markdown
	const {text, slug, year, month} = generatePost(event.body);

  // Authenticate with GitHub API 
  octokit.authenticate({
    type: 'basic',
    username: event.headers['gh_user'],
    password: event.headers['gh_pass']
  });
  
  // Add blog post to correct folder in GitHub Repository
  const result = await octokit.repos.createFile({
    owner: 'gschier',
    repo: 'schier.co',
    path: `site/content/blog/${year}/${month}/${slug}.md`,
    message: `Auto-Publish of ${slug}.md`,
    content: Buffer.from(text, 'utf8').toString('base64'),
  });
  
  // Respond with HTTP Success code
  return { statusCode: 200 };
};
```

As you can see from the code above, the solution only requires a few steps and is fairly simple.

_Note, I omitted the  `generatePost()` method, which extracts the title from the Markdown, generates the metadata, and prepends it to the post._

## Creating the Shortcut
The iOS shortcut used for this task is fairly simple but I've included a [importable copy](https://schier.co/blog-publish.shortcut) if you want to take a look. It consists of just three steps

1. Prompt for GitHub username and store it in a variable
2. Prompt for GitHub password and store it in a variable
3. Use the "Get Contents of URL" action to send the username, password, and shortcut input (Bear note) to the Netlify function

These three actions, along with enabling the setting to have the shortcut appear in the iOS Share Sheet, were the only things needed to send a Bear note to the JavaScript code 😊 

![iOS shortcut to publish blog post from Bear](/images/publish-blog-shortcut.jpg)

## Pitfalls and Future Improvements
There are a couple problem that still remain. Currently, **any resources, including images, within a Bear note are not exported**. This seems like an oversight from the Bear team and hopefully it will be improved later. However, there _is_ a way to do it. It just requires a bit more work.

Along with Markdown, Bear also has the ability to share notes in the `.bearnote` format. After examination, it seems that this format is essentially a zip archive that contains both the text of the note and resources. So, in order to add image support to the workflow, I'll need to write some code to handle this new format and save any resources to GitHub that may be included.

Another problem is that the current workflow **does not yet support updating posts, only creating them.** Adding support for this should only require a small amount more JavaScript logic, though.

## Wrap-Up
This was my first experience using iOS shortcuts and I must say, they are a lot more powerful than I expected! I look forward to seeing what other task they can handle and I also look forward to publishing many more posts now that the experience is so much nicer. 🎈 