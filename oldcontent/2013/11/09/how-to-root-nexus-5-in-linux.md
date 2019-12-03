---
title: "How to Root Nexus 5 in Linux"
slug: "how-to-root-nexus-5-in-linux"
date: "2013-11-09"
url: "blog/2013/11/09/how-to-root-nexus-5-in-linux.html"
tags: ["tutorial", "android"]
---

I just bought a Nexus 5 today and wanted to root it. I tried running the [following script](https://download.chainfire.eu/363/CF-Root/CF-Auto-Root/CF-Auto-Root-hammerhead-hammerhead-nexus5.zip) without success. I kept getting the following error:

```bash
sudo: unable to execute tools/fastboot-linux: No such file or directory
```

So, here are some alternative instructions. If you don't know what *Linux* is, please STOP reading this RIGHT NOW:

MANDITORY DISCLAIMER: This will wipe your device and I am not responsible if you fuck up your shit.

## 1. Enable Developer Mode and USB Debugging

1. Go to settings on your phone
2. Go to "About Phone"
3. Tap "Built Number" a bunch of times
4. Go back
5. Go to "Developer Options"
6. Check "USB Debugging"
7. Click "OK"

## 2. Install ADB and Fastboot tools

This is how you install ADB and Fastboot in Ubuntu Linux. I'll let you figure it out for other Linux operating system.

```bash
sudo apt-get install android-tools*
```

After installing, you should be able to run both `adb` and `fastboot`.

## 3. Unlock Bootloader

First, make sure `adb` can see your device:

```bash
adb devices
```

Reboot to bootloader:

```bash
adb reboot bootloader
```

Then, unlock the bootloader (this may need "sudo"):

```bash
fastboot oem unlock
```

## 4. Flash Root

First, download [CF-Auto_root](https://download.chainfire.eu/363/CF-Root/CF-Auto-Root/CF-Auto-Root-hammerhead-hammerhead-nexus5.zip)

Then, run:

```bash
unzip CF-Auto-Root-hammerhead-hammerhead-nexus5.zip
cd image/
sudo fastboot boot CF-Auto-Root-hammerhead-hammerhead-nexus5.img
```

Be patient, this takes about a minute or two. It will reboot on its own...


## 5. Done!

And that's it! When your phone reboots, it should walk you through the setup process again. To make sure if this worked, make sure the SuperSU app is intalled.

I hope the instructions helped you out. Let me know if you have any questions.







