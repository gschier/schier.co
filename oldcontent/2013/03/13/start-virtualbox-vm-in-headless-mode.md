---
title: "Start VirtualBox VM in Headless Mode"
slug: "start-virtualbox-vm-in-headless-mode"
date: "2013-03-13"
url: "blog/2013/03/13/start-virtualbox-vm-in-headless-mode.html"
tags: ["tutorial", "virtualbox"]
---

It is fairly common in web development to run code in a virtual machine (VM) so that you can mirror your production environment. However, using a *GUIless* operating system through VirtualBox's GUI window is a terrible experience. Fortunately VirtualBox provides an easy way of starting a VM using their command line tool `VBoxManage` in a *headless* mode.

```bash
# List virtual machines
VBoxManage list vms
"MyVM" {e4b0c92c-4301-4a7d-8af8-fe02fed00451}

# Start VM in headless mode
VBoxManage startvm MyVM --type headless

# Power off VM
VBoxManage controlvm MyVM poweroff

```

Once the virtual machine has started you can connect to it over SSH and use it as you would any server operating system.

