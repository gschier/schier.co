---
title: "Install Genymotion 2.0 In Ubuntu"
slug: "install-genymotion-20-in-ubuntu"
date: "2013-11-13"
url: "blog/2013/11/13/install-genymotion-20-in-ubuntu.html"
tags: ["tutorial", "android", "ubuntu"]
---

The 3rd party Android emulator Genymotion announced the official release of their 2.0 version today. This is a small tutorial on how to install it in Ubuntu.

1. Download the Ubuntu installer from the [Genymotion](https://cloud.genymotion.com/page/launchpad/download/) website
2. Download and install the latest [Virtualbox](https://www.virtualbox.org/wiki/Linux_Downloads) if you haven't already
3. Open your terminal of choice
4. Run the following commands to install and set up Genymotion
```bash
  # Make the file executable
  $ chmod +x genymotion-2.0.0_x64.bin

  # Run the installer
  $ ./genymotion-2.0.0_x64.bin

  # Move the installed directory to your home folder
  $ mv genymotion ~/.genymotion

  # Add executables to your path
  $ echo 'export PATH="/home/$USER/.genymotion:$PATH"' >> ~/.bashrc
```

And that's it! Simply restart your terminal and you should now be able to run `genymotion` and `genymotion-shell` from your terminal.

------------------

**TIP:** *You can optionally download and install the Eclipse and/or IntelliJ IDEA plugins from the Genymotion [Downloads](https://cloud.genymotion.com/page/launchpad/download/) page as well.*




