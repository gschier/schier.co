---
title: "Find Your Way $HOME In Bash"
slug: "find-your-way-dollarhome-in-bash"
date: "2013-01-22"
url: "blog/2013/01/22/find-your-way-dollarhome-in-bash.html"
tags: ["tutorial", "bash"]
---

Today I learned a shorter way to navigate to my home directory while in a Bash terminal. According to [this page](https://linux.about.com/library/cmd/blcmdl1_cd.htm), when the `cd` command doesn't receive any parameters it defaults to `$HOME`. How convenient is that?! In fact, there are four ways to get to your home directory:

```bash
# These are equivalent

cd                  # Defaults to $HOME
cd ~                # Current user's home dir
cd ~$USER           # Given user's home dir
cd /home/$USER/     # Full path
```

Up until this time I have been using `cd ~` exclusively, but now I can switch to `cd` and knock off two whole characters!


