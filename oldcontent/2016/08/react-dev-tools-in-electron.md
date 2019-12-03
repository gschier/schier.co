---
date: 2016-08-09T09:20:59-07:00
title: Use React Dev Tools in Electron 
slug: react-dev-tools-in-electron
tags: ['tutorial']
---

I recently set up [React Dev Tools](https://github.com/facebook/react-devtools) inside an
[Electron](https://electron.atom.io/) app, so I thought I'd write a small tutorial on it. 
The whole process should take less than five minutes so let's get started.


## Step 1 – Install React Dev Tools Chrome Extension

Before we can use React Dev Tools in Electron, we need a copy of it. To do that, install it from the
[Chrome Web Store](https://chrome.google.com/webstore/detail/react-developer-tools/fmkadmapgofadopljbjfkapdkoienihi)


## Step 2 – Locate the Extension Files

Chrome puts all extension files under the extension's ID. Get a copy of the ID by finding the
extension on [chrome://extensions](chrome://extensions).

![React dev tools Chrome extension](/images/react-chrome-extension.png)

The ID should look something like `fmkadmapgofadopljbjfkapdkoienihi`.

Next, open your terminal and find the version of the extension that is installed.

_Note: The path will be different on non-Mac platforms_

```shell
# Should print something like `0.15.0_0`
ls ~/Library/Application\ Support/Google/Chrome/\
Default/Extensions/fmkadmapgofadopljbjfkapdkoienihi
```

This path, plus the version, is what we'll give to Electron.


## Step 3 – Tell Electron to Load the Extension

Now all we have to do is tell Electron to load the extension. Be sure to only load the extension
in your development workflow. 

```javascript
if (process.env.NODE_ENV === 'development') {
    
  // Make sure you have the FULL path here or it won't work
  BrowserWindow.addDevToolsExtension(
    '/Users/gschier/Library/Application Support/Google/Chrome/' +
    'default/Extensions/fmkadmapgofadopljbjfkapdkoienihi/0.15.0_0'
  );
  
}
```


## Success!

That's it! You now have the React dev tools available within your app. Here's what it should
look like.

_TIP: You can drag the tabs in the dev tools with your mouse. I put React on the left._

![React dev tools in Electron](/images/react-dev-tools-electron.png)
