---
title: "Install Ubuntu on Asus P8P67 WS Revolution Motherboard"
slug: "install-ubuntu-on-asus-p8p67-ws-revolution-motherboard"
date: "2013-04-15"
url: "blog/2013/04/15/install-ubuntu-on-asus-p8p67-ws-revolution-motherboard.html"
tags: ["tutorial", "ubuntu"]
---

*Short answer*: [Upgrade your BIOS](https://support.asus.com/download.aspx?SLanguage=en&m=P8P67%20WS%20Revolution&p=1&s=39&os=30&hashedid=dzgoion0wgHoT7tp) to make the UEFI boot option appear for your new installation.

Two years ago, I made the mistake of buying a desktop computer with new hardware. This will never happen again.

Newer Ubuntu versions now have support for UEFI installs as opposed to legacy BIOS installs. For reasons that I am unaware of, booting an Ubuntu live USB in legacy mode has never worked. This meant that UEFI installs had been my only option.

The boot menu for this motherboard is meant to show two options for every UEFI capable drive connected to the machine; one for legacy mode, and one for UEFI. These two options have always been present for Ubuntu live USBs (though only the UEFI option worked), but the UEFI option for a newly created install was never presented.

I did not even realize this was the problem until I upgraded the BIOS version and *viola*, the UEFI boot option magically appeared for my new installation. I had upgraded the BIOS when I first ran into this problem but apparently the bug was just recently fixed.

Anyway, I now have hardware that doesn't cause me to smash my head in every time I want to install a new distro, which makes me very happy.

Old workaround: Previously, my solution to this was to install a version of Ubuntu older than UEFI support and then upgrading to the desired version from there. This seemed to work, but was very painful and slow. I don't know the technical details but I assume that this forced the installation to legacy mode which my motherboard supported at the time.



