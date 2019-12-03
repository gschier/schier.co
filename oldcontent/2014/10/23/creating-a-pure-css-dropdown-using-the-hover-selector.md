---
title: "Creating a Pure CSS Dropdown Using the :hover Selector"
slug: "creating-a-pure-css-dropdown-using-the-hover-selector"
date: "2014-10-23"
url: "blog/2014/10/23/creating-a-pure-css-dropdown-using-the-hover-selector.html"
tags: ["tutorial", "webdev"]
categories: ["best of"]
---

In this tutorial we're going to be building a basic dropdown button. Here's a peak at what
the final result will look like.

<style>
.dropdown { position: relative; display: inline-block; z-index: 9999; }
.dropdown .dropdown-menu {
    position: absolute; top: 100%; display: none; margin: 0;
    list-style: none; width: 100%; padding: 0; }

.dropdown:hover .dropdown-menu { display: block; }

.dropdown button {
    background: #FF6223; color: #FFFFFF; border: none; margin: 0;
    padding: 0.4em 0.8em; font-size: 1em; }

.dropdown-wide button { min-width: 13em; }

.dropdown a {
    display: block; padding: 0.2em 0.8em; text-decoration: none;
    background: #CCCCCC; color: #333333; }

.dropdown a:hover { background: #BBBBBB; }
</style>

<div class="dropdown">

    <!-- trigger button -->
    <button>Hover Over Me</button>

    <!-- dropdown menu -->
    <ul class="dropdown-menu">
        <li><a href="#" onclick="return false;">Item 1</a></li>
        <li><a href="#" onclick="return false;">Item 2</a></li>
        <li><a href="#" onclick="return false;">Item 3</a></li>
    </ul>
</div>

Let's get started.


Motivations and Introduction
----------------------------

When I first began learning HTML and CSS, creating a dropdown was a magical thing. I didn't know
how to implement one myself, and the random stylesheets I found on the Internet were
too long and complicated to understand. It wasn't until I grasped CSS a bit more that I figured
out how to make a dropdown myself. In fact, building a basic dropdown is really easy. Let's walk
through it.


Step 1 — The HTML Components
----------------------------

There are three main components of a basic dropdown: The dropdown menu itself, a button to trigger
the dropdown, and a container to wrap it all up. I'll go over each of these components in detail
as we go.

Below is a snippet of HTML showing how all three components fit together:

```HTML
<!-- dropdown container -->
<div class="dropdown">

    <!-- trigger button -->
    <button>Navigate</button>

    <!-- dropdown menu -->
    <ul class="dropdown-menu">
        <li><a href="#home">Home</a></li>
        <li><a href="#about">About</a></li>
        <li><a href="#contact">Contact</a></li>
    </ul>
</div>
```

Step 2 — Positioning the Dropdown Menu
--------------------------------------

The code above showed the HTML we're going to use for the dropdown. The next step is to position
the `<ul>` so that it sits exactly below the button. We'll use `position: absolute;` for this. The
[Mozilla Docs](https://developer.mozilla.org/en-US/docs/Web/CSS/position) define absolute
positioning as such:

> **position: absolute**
> <br>
> Do not leave space for the element. Instead, position it at a specified position relative to
> its closest positioned ancestor or to the containing block. Absolutely positioned boxes can
> have margins, they do not collapse with any other margins.

The CSS snippet below shows us using absolute positioning to set the top of `.dropdown-menu` to
be below the button. Notice `.dropdown` is given `position: relative;` so the
`.dropdown-menu` is positioned relative to `.dropdown` as opposed to the next parent in its
family tree (again, check the [Mozilla Docs](https://developer.mozilla.org/en-US/docs/Web/CSS/position)
for more details on positioning).

```CSS
.dropdown {
    position: relative;

    /** Make it fit tightly around it's children */
    display: inline-block;
}

.dropdown .dropdown-menu {
    position: absolute;

    /**
     * Set the top of the dropdown menu to be positioned 100%
     * from the top of the container, and aligned to the left.
     */
    top: 100%;
    left: 0;

    /** Allow no empty space between this and .dropdown */
    margin: 0;
}
```

And this is what all that looks like in the browser:

![CSS Dropdown](/images/dropdown/dropdown_1.png)

Super ugly, but it works. Now that we have our basic layout setup, we can start adding some
functional styles.


Step 3 — Showing the Menu on Mouse Hover
----------------------------------------

In order for our dropdown to be usable, we need to add some styles to show and hide
the menu based on user action. To keep things simple, we're going to make the dropdown appear
when the user hovers over the button. The CSS selector `:hover`
([Mozilla Docs](https://developer.mozilla.org/en-US/docs/Web/CSS/:hover)) can help us with that.

*Note that `:hover` functionality is not the most mobile friendly since there is no concept of
hovering on a touch screen, but for the purpose of keeping this tutorial short, and teaching a bit
more about CSS, we're going to keep it simple and use `hover` anyway.*

```CSS
/**
 * Apply these styles to .dropdown-menu when user hovers
 * over .dropdown
 */
.dropdown:hover .dropdown-menu {

    /** Show dropdown menu */
    display: block;
}
```

Let me explain the CSS we added above. The `.dropdown:hover` selector is triggered when the user's
mouse moves over top of `.dropdown`. Once this happens, the style `display: block;` is applied to
the last item in the selector `.dropdown-menu`. So, the parent element is triggering the style
and the dropdown menu is what the style is being applied to. Pretty neat huh?

Now that we have the basic functionality in place, let's make it look good.


Step 4 — More Styles
--------------------

Although making things pretty isn't really necessary for this tutorial, it's always a fun thing
to do. Here are a few more styles that make our dropdown a lot more pleasant to use.


```CSS
.dropdown {
    position: relative;
    display: inline-block;
}

.dropdown .dropdown-menu {
    position: absolute;
    top: 100%;
    display: none;
    margin: 0;

    /****************
     ** NEW STYLES **
     ****************/

    list-style: none; /** Remove list bullets */
    width: 100%; /** Set the width to 100% of it's parent */
    padding: 0;
}

.dropdown:hover .dropdown-menu {
    display: block;
}

/** Button Styles **/
.dropdown button {
    background: #FF6223;
    color: #FFFFFF;
    border: none;
    margin: 0;
    padding: 0.4em 0.8em;
    font-size: 1em;
}

/** List Item Styles **/
.dropdown a {
    display: block;
    padding: 0.2em 0.8em;
    text-decoration: none;
    background: #CCCCCC;
    color: #333333;
}

/** List Item Hover Styles **/
.dropdown a:hover {
    background: #BBBBBB;
}
```

Here is what our changes look like in the browser:

![CSS Dropdown](/images/dropdown/dropdown_2.png)

Much better right? A few basic styles go a long way.


Wrap-Up
-------

That's about it for this tutorial. As mentioned above, this was more of a CSS lesson than anything.
I wouldn't recommend using a *hover-triggered* dropdown on the web today unless it has a fallback
for mobile devices. The next step would be to make it activate on click, instead of hover, which
requires some Javascript. If you'd like to see that tutorial just let me know on
[Twitter](https://twitter.com/gregoryschier) or
[Google Plus](https://plus.google.com/102509209246537377732?rel=author).

Thanks for reading and I hope you learned something today!


### Update

[test6554](https://www.reddit.com/user/test6554) on Reddit pointed out that we can also use the
[Checkbox Hack](https://css-tricks.com/the-checkbox-hack/) to make things mobile friendly, which
wouldn't require Javascript at all.


<div class="dropdown dropdown-wide">
    <button>More Tutorials</button>
    <ul class="dropdown-menu">
        <li><a href="/blog/2014/03/01/clicky-3d-buttons-with-css.html">CSS 3D Buttons</a></li>
        <li><a href="/blog/2013/11/16/creating-pure-css-lightboxes-with-the-target-selector.html">Pure CSS Lightboxes</a></li>
        <li><a href="/blog/2013/11/14/method-chaining-in-javascript.html">Method Chaining</a></li>
        <li><a href="/blog/2013/09/30/how-jsonp-works.html">How JSONP Works</a></li>
    </ul>
</div>

