---
title: "Install Node.js On Ubuntu Server With PPA"
slug: "install-nodejs-on-ubuntu-server-with-ppa"
date: "2013-01-30"
url: "blog/2013/01/30/install-nodejs-on-ubuntu-server-with-ppa.html"
---

Here is a quick tip that would have saved me a couple of hours while installing Node.js on Ubuntu Server 12.04. I wanted to install Node from a repository instead of a tarball for convenience but couldn't figure out why `apt-get` wasn't giving Node v0.6.* instaed of v0.8.*. I followed the [official tutorial](https://github.com/joyent/node/wiki/Installing-Node.js-via-package-manager) which tells you to do the following:

```bash
sudo apt-get install python-software-properties python g++ make
sudo add-apt-repository ppa:chris-lea/node.js
sudo apt-get update
sudo apt-get install nodejs npm
```

What I did not know, however, was that there already existed a package by the name on `nodejs`, so by default the last command was installing the more "stable" version. To find out what versions of `nodejs` are available, you can type the following:

```bash
sudo apt-cache show nodejs
```

To install the latest one, simply append the version to the package name separated by an "=" sign.

```bash
# Your version may be different
sudo apt-get install nodejs=0.8.18-1chl1~precise1
```

I hope this helped you avoid the head smashing frustrations that I went through during this process. Time to hack! :)

P.S. The same thing applies when installing NPM as well.



