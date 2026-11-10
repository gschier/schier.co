// The widget contract (widgets/README.md), shared by copying: the site has
// this file at src/lib/widgetContract.ts, and each widget keeps a copy of
// its own (widgets/hello/src/contract.ts), since a widget is its own small
// project and imports nothing from the site. test/widgets.test.ts checks
// that every copy under widgets/ matches this one. Change them together.

/// A prop's value, as the fence's `key: value` line gives it.
export type PropValue = string | number | boolean

/// A widget's props by key, every one present: the fence's values where
/// they are good, else the schema's defaults.
export type Props = Record<string, PropValue>

type PropBase = {
  /// What the fence's line starts with: lower case, digits and dashes.
  key: string
  /// What the editor's form calls it.
  label: string
  /// A line under the field in the editor's form.
  help?: string
}

/// One of a few values, each with the label the editor's form shows.
export type EnumProp = PropBase & { type: 'enum'; default: string; options: { value: string; label: string }[] }
/// A number between min and max, in steps of step (default 1), with a unit
/// the form shows after it (°, px, %).
export type NumberProp = PropBase & { type: 'number'; default: number; min: number; max: number; step?: number; unit?: string }
/// On or off: true or false in the fence.
export type BooleanProp = PropBase & { type: 'boolean'; default: boolean }
/// One line of text.
export type StringProp = PropBase & { type: 'string'; default: string }

export type PropSpec = EnumProp | NumberProp | BooleanProp | StringProp

/// widget.json, at the root of a widget's folder.
export type WidgetJson = {
  /// The widget's name, the folder's name and what a fence pins:
  /// ```widget {id}@{version}
  id: string
  /// The name a person reads, in the editor's card and picker.
  name: string
  /// One line on what it shows.
  description: string
  build: {
    /// Builds the module into output, run in the widget's folder after its
    /// install (npm ci when it has a lockfile).
    command: string
    /// Rebuilds on every change, for npm run widget:dev (optional).
    watch?: string
    /// The folder the build writes, holding index.js and any assets it loads
    /// by URL relative to import.meta.url.
    output: string
  }
  /// The space the page keeps for the widget before its code has loaded:
  /// an aspect ratio ("16 / 9") or a height in CSS pixels.
  size: { aspectRatio: string } | { height: number }
  props: PropSpec[]
}

/// What a mounted widget gives back.
export type MountedWidget = {
  /// New props (every key present), as the editor's preview changes them.
  update(props: Props): void
  /// Take everything out of the element and stop: listeners, timers,
  /// animation frames.
  destroy(): void
}

/// The built module's one export: draws the widget into [element], a plain
/// element in the page (no iframe, no shadow DOM) that the widget has to
/// itself.
export type Mount = (element: HTMLElement, options: { props: Props }) => MountedWidget

/// What the module is, as the site imports it.
export type WidgetModule = { mount: Mount }
