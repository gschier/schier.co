---
title: "Ubuntu Update – Not Enough Free Space"
slug: "ubuntu-update-not-enough-free-space"
date: "2014-12-11"
url: "blog/2014/12/11/ubuntu-update-not-enough-free-space.html"
tags: ["tutorial", "ubuntu"]
---

Twice now this has happened to me. After clicking the button to install updates an error message
appears saying "Not enough free disk space".

![Ubuntu not enough free disk space](/images/softwareupdater.png)

After some Googling, I found a solution on the
[Ask Ubuntu Forums](https://askubuntu.com/questions/293273/boot-folder-too-small-for-upgrade-from-ubuntu-12-10-to-13-04).

This happens because some kernel packages hang around even after updated ones replace
them. The solution is simple. Delete what is no longer being used.


Step 1 – Find Your Kernel Release
---------------------------------

There is a handy command you can use called `uname`, which can print out various system
information. Type `uname --help` to find out more.

To print the current kernel release, use the `-r` option, which will look something like this:

```bash
# Print the current kernel release
uname -r

# OUTPUT: 3.13.0-40-generic
```

Hold on to the output of this for the next step.


Step 2 – Uninstall What You Don't Need
--------------------------------------

It's time for the scary part. We're going to start removing old kernel packages that are no longer
needed. **If you remove the one that is currently in use, your machine will not boot!**

Here's what we're going to do:

- use the `dpkg` command to figure out what's installed
- remove packages that aren't related to our current *kernel release* (from step 1)

*Note: You might only need to remove one or two packages to recover the amount of space needed.*

The following commands will list the packages that are installed. From here we can start installing
things that don't match our kernel release.


```bash
dpkg -l linux-image\*
dpkg -l linux-headers\*
dpkg -l linux-tools\*

# Sample output for "linux-image\*"
# ||/ Name                              Version               Architecture          Description
# +++-=================================-=====================-=====================-========================================================================
# un  linux-image                       <none>                <none>                (no description available)
# un  linux-image-3.0                   <none>                <none>                (no description available)
# rc  linux-image-3.13.0-32-generic     3.13.0-32.57          amd64                 Linux kernel image for version 3.13.0 on 64 bit x86 SMP
# ii  linux-image-3.13.0-37-generic     3.13.0-37.64          amd64                 Linux kernel image for version 3.13.0 on 64 bit x86 SMP
# ii  linux-image-3.13.0-39-generic     3.13.0-39.66          amd64                 Linux kernel image for version 3.13.0 on 64 bit x86 SMP
# ii  linux-image-3.13.0-40-generic     3.13.0-40.69          amd64                 Linux kernel image for version 3.13.0 on 64 bit x86 SMP
# rc  linux-image-extra-3.13.0-32-gener 3.13.0-32.57          amd64                 Linux kernel extra modules for version 3.13.0 on 64 bit x86 SMP
# ii  linux-image-extra-3.13.0-37-gener 3.13.0-37.64          amd64                 Linux kernel extra modules for version 3.13.0 on 64 bit x86 SMP
# ii  linux-image-extra-3.13.0-39-gener 3.13.0-39.66          amd64                 Linux kernel extra modules for version 3.13.0 on 64 bit x86 SMP
# ii  linux-image-extra-3.13.0-40-gener 3.13.0-40.69          amd64                 Linux kernel extra modules for version 3.13.0 on 64 bit x86 SMP
# ii  linux-image-generic               3.13.0.40.47          amd64                 Generic Linux kernel image
```

Alright, let's remove some of these packages. Remember, you can remove any package that is is
**NOT** associated with the kernel release outputted by `uname -r`.

```bash
sudo apt-get purge \
    linux-image-3.13.0-XX-generic \
    linux-image-3.13.0-YY-generic \
    linux-image-3.13.0-ZZ-generic \
    linux-headers...\
    linux-tools...
```

Step 3 – On With Your Life
--------------------------

After removing a couple unneeded packages, you should be able to open up the Software Updater and
try again.

![Ubuntu Software Updater](/images/updater.png)



Wrap Up
-------

So how can you prevent this from happening again? You can either delete more packages from the
commands ran above, increase the size of your `/boot` partition (extremely scary), or be lazy
like me and repeat this process when needed.

I've made a mental note to allocate more space for `/boot` next time I reinstall my computer but
doubt I'll remember when the time comes.

