---
title: "How to Stop Tap Events From Passing Through an Android Fragment"
slug: "how-to-stop-tap-events-from-passing-through-an-android-fragment"
date: "2014-09-11"
url: "blog/2014/09/11/how-to-stop-tap-events-from-passing-through-an-android-fragment.html"
tags: ["tutorial", "android"]
---

By default, the layout view in Android (`LinearLayout`, `RelativeLayout`, etc) don't consume click events. I discovered this trying to show a new fragment above another. Taps were registering on the non-visible fragment below. To fix this, add an attribute to the view to tell it to consume click events with `android:clickable="true"`.

```html
<?xml version="1.0" encoding="utf-8"?>

<LinearLayout xmlns:android="https://schemas.android.com/apk/res/android"
    android:orientation="vertical"
    android:layout_width="fill_parent"
    android:layout_height="fill_parent"
    android:background="@android:color/white"

    android:clickable="true">

</LinearLayout>
```

I hope this tip saves someone else the time I lost :)


