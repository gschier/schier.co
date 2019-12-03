---
title: "How to Make Android Camera Permission Optional"
slug: "how-to-make-android-camera-permission-optional"
date: "2015-04-03"
url: "blog/2015/04/03/how-to-make-android-camera-permission-optional.html"
tags: ["android", "tutorial"]
---

I have an Android app called [To Read](https://play.google.com/store/apps/details?id=com.gregschier.toread&hl=en).
To Read allows you to search for books and add them to a *reading list*. This
weekend I added the ability to add a book by scanning a barcode.

When I uploaded the finished app to the developer console, this is what I saw.

![Google Play APK Details](/images/apk_details.png)

**336** different Android devices can no longer see or install my app from the
Play Store?! Since the camera is not required to use the basic functionality of
the app, I wanted to make the permission optional. Here's what I did...


Modify `AndroidManifest.xml`
----------------------------

In order for an app to use the camera, it must request the
`android.permission.CAMERA` permission in the `AndroidManifest.xml` file.
Adding this line (and this line only) will allow the app to use the camera
without any problems.  However, if you *only* add this line, devices that do
not have a camera will not be able to install the app. This is a huge problem
if the app does not necessarily *need* the camera for core operation
(like mine).

There are a couple more things you need to add to the manifest so that the
camera is not *required* to install the app:

```xml
<!-- First, request the camera permission -->
<uses-permission android:name="android.permission.CAMERA" />

<!--
  -- IMPORTANT PART:
  -- Include all the "features" under the camera permission,
  -- and mark them all as optional.
  -->
<uses-feature
    android:name="android.hardware.camera"
    android:required="false" />
<uses-feature
    android:name="android.hardware.camera.autofocus"
    android:required="false" />
```

If you want to make the permission optional, you need to add the
`<uses-feature>` tag for each of the *features* under the `CAMERA` permission.
Within this tag, make sure to specify `android:required="false"` for each
feature. I found the child features of the `CAMERA` permission on
[this page](https://developer.android.com/guide/topics/manifest/uses-feature-element.html)
(*image below*).

![Google Play Camera Permission](/images/camera_permission.png)

Now that the use of the camera is optional, the other thing that needs to be
done is check at runtime whether or not the device has a camera. You can use
the following snippet of code to do that.

```java
// Check that the device will let you use the camera
PackageManager pm = getPackageManager();

if (pm.hasSystemFeature(PackageManager.FEATURE_CAMERA)) {
    // Do camera stuff...
}
```

I hope you found this info useful. It took me longer than I would have liked
to figure this one out on my own.
