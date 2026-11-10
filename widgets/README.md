# Widgets

Interactive demos that run inside a post. Each folder here is a small
project of its own: its own `package.json`, lockfile and build, making one
ES module. The site never installs or builds them (their `node_modules` and
`dist` are ignored, and the site's build and typecheck leave this folder
alone); it loads a published build from storage when a post pins it.

## A widget's folder

```
widgets/<name>/
  widget.json      what the site knows of it (below)
  package.json     its own scripts and dependencies, with its lockfile
  src/contract.ts  a copy of the contract (below)
  src/...          its code
```

`widget.json`:

```json
{
  "id": "hello",
  "name": "Hello shapes",
  "description": "One line on what it shows.",
  "build": { "command": "npm run build", "watch": "npm run watch", "output": "dist" },
  "size": { "height": 240 },
  "props": [
    { "key": "count", "label": "Count", "help": "A line under the field.", "type": "number", "default": 5, "min": 1, "max": 12, "step": 1, "unit": "" },
    { "key": "shape", "label": "Shape", "type": "enum", "default": "bars", "options": [{ "value": "bars", "label": "Bars" }] },
    { "key": "animate", "label": "Animate", "type": "boolean", "default": true },
    { "key": "caption", "label": "Caption", "type": "string", "default": "Hello" }
  ]
}
```

- `id` is the folder's name: lower case letters, digits and dashes.
- `build.command` writes `build.output`, which holds `index.js` and any
  assets it loads by URL relative to `import.meta.url`. `build.watch` is
  optional, for `npm run widget:dev`.
- `size` is the space the page keeps before the code loads:
  `{ "aspectRatio": "16 / 9" }` or `{ "height": 240 }` in CSS pixels.
- `props` is the site's own small schema, not JSON Schema. Every prop has a
  `key`, a `label`, an optional `help`, a `default`, and a `type`: `enum`
  (with `options`, each a `value` and a `label`), `number` (with `min`,
  `max`, and optionally `step` and `unit`), `boolean` or `string` (one
  line).

## The contract

The module exports `mount`:

```ts
export const mount: Mount = (element, { props }) => {
  // draw into element
  return {
    update(props) {},  // new props, every key present
    destroy() {},      // take everything out, stop timers and listeners
  }
}
```

The types are in `src/lib/widgetContract.ts`. A widget keeps an exact copy
at `src/contract.ts` rather than importing from the site; the site's tests
check that every copy matches. Change them together.

- `element` is a plain element in the page: no iframe, no shadow DOM. The
  widget has it to itself, and puts nothing outside it but its `<style>` in
  the head, added once per build (matched by its text, so a rebuild on the
  dev server brings its new styles).
- Its styles live under a class of its own (`.hello-widget`), so nothing
  reaches the page.
- It follows the site's light and dark colours by using the site's CSS
  variables, which switch with `<html theme="light|dark">`:
  `--bg`, `--gray-100` to `--gray-900`, `--primary-050` to `--primary-500`,
  `--txt-link`, `--txt-syntax-1` to `--txt-syntax-4`, `--info-500`,
  `--warning-500`, `--danger-500`. Give each a fallback for a page without
  them. Anything else that differs can key on `[theme="dark"]`.
- Props arrive read and checked against the version's schema: every key
  present, each a good value or the default.
- It respects `prefers-reduced-motion`.

## In a post

````md
```widget hello@1
count: 3
shape: dots
```
````

One `key: value` line a prop; leave a prop out for its default. A key the
schema does not have, or a bad value, is ignored (the editor's card says
so). The editor's Insert widget, or a `/` alone on a line, writes the
fence for you; the MCP's `list_widgets` gives an agent the same.

## Developing one

```sh
npm run dev                  # the site, in one terminal
npm run widget:dev hello     # the widget's watch, in another
```

On the dev server, pin `hello@dev` to run the local build from
`/__widgets/hello/` (dev only). The page and the editor's preview mount the
new build each time it changes, with the props they had.

## Publishing one

```sh
npm run widget:publish hello
```

Runs the widget's install (`npm ci`) and build, takes the next version (an
integer counting up from 1), uploads the output under
`widgets/hello/<version>/` in storage (the bucket when the `AWS_*` variables
are set, else `.media/`), and records the version in `manifest.json`, with
its files, a content hash and its `widget.json`. A version is never
overwritten. Commit `manifest.json` afterwards: production knows only the
versions it lists, and ignores any marked `"storage": "disk"`.

On the dev server, the editor's Prepare for publish does the same for a
post's `@dev` pins and repins them. A post pinning `@dev`, or a version the
manifest lacks, cannot be published.
