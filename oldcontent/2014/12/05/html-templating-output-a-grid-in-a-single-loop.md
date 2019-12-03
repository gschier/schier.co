---
title: "HTML Templating – Output a Grid in a Single Loop"
slug: "html-templating-output-a-grid-in-a-single-loop"
date: "2014-12-05"
url: "blog/2014/12/05/html-templating-output-a-grid-in-a-single-loop.html"
tags: ["tutorial", "jinja"]
---

It was about a two years ago. I was working on a food startup and needed to display some food
photos in a six-column grid. The image below shows what the end result looked like:

![Six-column Grid](/images/food.jpg)

I was using [Bootstrap](https://getbootstrap.com), which requires an HTML element to be wrapped
around each column and each row. Here's a sample of Bootstrap showing two rows of four columns each:

```html
<!-- 2 row - 4 column grid -->

<div class="row">
    <div class="col-md-3">Item 1</div>
    <div class="col-md-3">Item 2</div>
    <div class="col-md-3">Item 3</div>
    <div class="col-md-3">Item 4</div>
</div>
<div class="row">
    <div class="col-md-3">Item 5</div>
    <div class="col-md-3">Item 6</div>
    <div class="col-md-3">Item 7</div>
    <div class="col-md-3">Item 8</div>
</div>
```

My first attempt at a solution involved putting the items in a 2D grid and using nested loops
in the HTML template. I had to transform the data to look like this:

```js
var items = [
    [ 1, 2, 3, 4],
    [ 5, 6, 7, 8]
]
```

This required a template that looked like this:

{% raw %}
```html
<!-- Django Templating -->

{% for row in rows %}
    <div class="row">
        {% for item in row %}
            <div class="col-md-3">{{ item }}</div>
        {% endfor %}
    </div>
{% endfor %}
```
{% endraw %}

While that solution worked fine, I wanted to simplify it and keep the grid logic in the
template. Ideally, the data would be kept in a regular array like this:

```js
var items = [
    1, 2, 3, 4, 5, 6, 7, 8
]
```

After a lot of thinking and failure, I ended up coming up with a fairly elegant solution. It's a
bit hard to explain how it work so I put together some simple pseudocode that hopefully explains the
algorithm without cluttering it up with ugly HTML tags.


```js
/** Pseudocode for Printing Grids **/

PRINT "[["
FOR all items
    PRINT "<< COUNT >>"
    IF last column in row
        PRINT "]] [["
PRINT "]]"

/** Output for 5 Items */
"[[ << 1 >> << 2 >> << 3 >> ]] [[ << 4 >> << 5 >> ]]"


/**
    Note that for 6 items it will print an empty row at
    the end unless you also check that it's not the last
    item in the loop.
*/
```

Now that we have a rough idea of what our code needs to look like, we can write some actual HTML.

{% raw %}
```html
<!-- Django Templating -->

<div class="row">

    {% for item in items %}
    <div class="col-md-3">{{ item }}</div>

        <!-- if last column in row -->
        {% if forloop.counter | divisibleby:"4" and not forloop.last %}
        </div><div class="row">
        {% endif %}

    {% endfor %}

</div>
```

And that's it. We can now generate a grid layout in a single loop without changing the way our
data looks.

I hope this explanation was clear enough. Feel free to reach out if you have any questions or
comments.
