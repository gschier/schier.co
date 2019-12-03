---
title: "Semantic CSS with CSStyle"
slug: "semantic-css-with-csstyle"
date: "2014-10-20"
url: "blog/2014/10/20/semantic-css-with-csstyle.html"
tags: ["webdev"]
---


[CSStyle](https://www.csstyle.io/) is interesting. It's a set of SASS mixins that
basically force you to write *correct* CSS. There are 6 main structures in
CSStyle:

- **Components:** Groups of styles like buttons, form inputs, etc.
- **Options:** Modifications of component styles for different uses
- **Parts:** Children of compenents
- **Tweaks:** Reusable "tweaks" that can be applied to any compenent
- **Locations:** Overrides for component styles based on where the component lives

Here's a sample of some of some basic CSStyle applied to a button:

```html
<a class="button --success">Save</a>
<a class="button --danger">Continue Without Saving</a>
```

```scss
/** SCSS **/
@include component(button) {
  background: blue;
  padding: 15px;

  @include option(success) {
    background: green;
  }

  @include option(danger) {
    background: red;
  }
}
```

As you can see above, we have a simple button component with an
`--option` of `success` (green) or `danger` (red). CSStyle's use of class
prefixes makes it really clear that the option classes are variations of a compenent
and should not be used for any other styling purposes.

Visit the [CSStyle](https://www.csstyle.io/) website to download the SASS mixins
and start writing better CSS.
