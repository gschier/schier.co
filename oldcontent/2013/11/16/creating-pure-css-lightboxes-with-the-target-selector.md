---
title: "Creating Pure CSS Lightboxes With The :target Selector"
slug: "creating-pure-css-lightboxes-with-the-target-selector"
date: "2013-11-16"
url: "blog/2013/11/16/creating-pure-css-lightboxes-with-the-target-selector.html"
tags: ["tutorial", "webdev"]
categories: ["best of"]
---

This tutorial will show you how to create a JavaScript-free lightbox using **CSS only**. To accomplish this, we will make use of the [:target](https://caniuse.com/#search=%3Atarget) selector from the CSS3 spec. Click the thumbnail below to see the lightbox in action, or see the full demo on [CodePen](https://codepen.io/gschier/pen/HCoqh).

<style>

.thumbnail {
  max-width: 40%;
}

.italic { font-style: italic; }
.small { font-size: 0.8em; }

/** LIGHTBOX MARKUP **/

.lightbox {
	/** Default lightbox to hidden */
	display: none;

	/** Position and style */
	position: fixed;
	z-index: 999;
	width: 100%;
	height: 100%;
	text-align: center;
	top: 0;
	left: 0;
	background: rgba(0,0,0,0.8);
}

.lightbox img {
	/** Pad the lightbox image */
	max-width: 90%;
	max-height: 80%;
	margin-top: 2%;
}

.lightbox:target {
	/** Remove default browser outline */
	outline: none;

	/** Unhide lightbox **/
	display: block;
}
</style>

<a href="#img1">
  <img src="/images/pig-small.jpg">
</a>

<a href="#_" class="lightbox" id="img1">
  <img src="/images/pig-big.jpg">
</a>

*This will work in any browser above IE8.*


## What is the :target Selector?

The `:target` selector is similar to other (better known) selectors like `:focus` and `:visited`. Any styles associated with a `:target` selector are applied when the `id` of the *targeted* element is the same as the [URL hash](https://www.w3schools.com/jsref/prop_loc_hash.asp) of the current page. Here is a simple example of `:target` being used:

```html
<!-- Simple :target demo -->

<style>
  div:target { color: green; }
</style>

<div id="foo">Target Element</div>

<!-- links to change the URL hash -->
<a href="#foo">Activate</a>
<a href="#_">Deactivate</a>
```

*view on [CodePen](https://codepen.io/gschier/pen/fb0c6b8d962195b0a2f6f34bdc3b445d)*

In this example, the "Target Element" text will turn green after clicking the "Activate" link because the URL hash will change to `#foo`, which is the same as the id of the "Target Element".

Now that we know how to use the `:target` selector we can use this principle to trigger the display of a lightbox.


## Lightbox Markup

The way this lightbox will work is simple. All we need to do is hide a lightbox somewhere on the page and unhide it when it is the `:target` element.

```html
<!-- Lightbox usage markup -->

<!-- thumbnail image wrapped in a link -->
<a href="#img1">
  <img src="/images/pig-small.jpg">
</a>

<!-- lightbox container hidden with CSS -->
<a href="#_" class="lightbox" id="img1">
  <img src="/images/pig-big.jpg">
</a>
```

In the example above, clicking the first link (thumbnail) will change the page hash and result in the second element (lightbox) becoming the `target`. To disable the lightbox, the lightbox image is wrapped in a link that will change the page hash to something that doesn't reference a valid element id.

*We use the hash `#_` to deactivate the lightbox, but any random hash will do the trick*.

## Lightbox CSS

Now all we need to do is write a few lines of CSS. The following CSS is commented to help you understand what is going on.

```css
/*************************************
 * Basic lightbox styles. Notice the
 * default 'display' is 'none'.
 */

.lightbox {
  /** Hide the lightbox */
  display: none;

  /** Apply basic lightbox styling */
  position: fixed;
  z-index: 9999;
  width: 100%;
  height: 100%;
  text-align: center;
  top: 0;
  left: 0;
  background: black;
  background: rgba(0,0,0,0.8);
}

.lightbox img {
  /** Pad the lightbox image */
  max-width: 90%;
  max-height: 80%;
  margin-top: 2%;
}

.lightbox:target {
  /** Show lightbox when it is target */
  display: block;

  /** Remove default browser outline style */
  outline: none;
}
```

## Conclusion

That's it! You now have a fully-functional CSS-only lightbox that can be used *almost* anywhere (stupid IE). If you have any questions let me know in the comments below.

Happy coding!













