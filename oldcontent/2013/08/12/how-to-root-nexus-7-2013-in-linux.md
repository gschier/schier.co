---
title: "How to Root Nexus 7 (2013) in Linux"
slug: "how-to-root-nexus-7-2013-in-linux"
date: "2013-08-12"
url: "blog/2013/08/12/how-to-root-nexus-7-2013-in-linux.html"
tags: ["tutorial", "android"]
---

I found a great [XDA post](https://forum.xda-developers.com/showthread.php?t=2382051) showing how to root the new Nexus 7 (2013) on Windows, so I made some slight modifications and got it working from my Linux terminal. Here's what I did:

**MANDITORY DISCLAIMER**: I am not responsible if you fuck up your shit.

Links:

- [Windows Guide](https://forum.xda-developers.com/showthread.php?t=2382051)
- [abd for Linux](https://developer.android.com/sdk/index.html)
- [TWRP v2.6.0.0](https://techerrata.com/browse/twrp2/flo)
- [Super SU](https://download.chainfire.eu/345/SuperSU/UPDATE-SuperSU-v1.51.zip)


Here are the steps I took to get my Nexus 7 (2013) rooted.

## 1. Boot Device to Recovery Mode

The following command will reboot your device to the bootloader menu.

```bash
./adb reboot bootloader
```

## 2. Unlock Device

The next step is to unlock the bootloader. This voids your warrenty (apparently) so there is no turning back. Since this is a Nexus device the bootloader is easy to unlock, and can be done with a single command. 

```bash
sudo ./fastboot oem unlock
```

## 3. Flash TWRP Recovery

This next command tells the device to flash the *img* file `TWRP.img` from the downloads directory. Obviously replace the path and file name with whatever yours is.

```bash
sudo ./fastboot flash recovery ~/Downloads/TWRP.img
```

## 4. Go to Recovery Mode

Now, use the volume and power buttons to select *Recovery Mode*.

## 5. Reboot and Confirm Root

Find the *Reboot* option within TWRP and select it. It will ask you whether or not you want to permanently enable root. Of course you do! Confirm this notice and be on your way.

## 6. Copy SuperSU.zip File to SD Card

If your Nexus 7 rebooted to Android correctly, you can transfer `SuperSU.zip` to your device as you normally would. For those of you whose device failed to boot (after waiting several minutes), do the following like I did.

1. reboot to recovery by holding Power + Vol-Down
2. choose Advanced > ADB Sideload

Once on the sideload screen, go back to your terminal and type the following:

```bash
sudo ./adb sideload ~/Downloads/SuperSu.zip
```

If you get a message saying your device does not have permissions, do the following and then try again:

```bash
sudo ./adb kill-server
sudo ./adb devices
```

## 7. Install zip from SD Card

Now for the easy part. From the *Install* menu, choose the zip you just uploaded. *If you transferred using ADB sideload it will be in the first folder you see.*

After flashing, do a factory reset and clear cache to make sure everything is fresh.

## Conclusion

The Windows tutorial was basically the exact same for Linux, however there were two unforeseen problems that needed workarounds, as this post mentions.

Anyway, I hope this tutorial helped. Let me know in the comments below if you have any questions, or tweet at me [@GregorySchier](https://twitter.com/GregorySchier) if that's your thing.

