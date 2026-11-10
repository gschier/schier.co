// Widgets in a post (BRIEF.md, Widgets): the fence that pins one, its props,
// and what the site knows of each widget. Plain functions with nothing of
// the server's or the browser's in them, so the renderer
// (src/server/markdown.ts), the post actions, the MCP, the editor's card and
// scripts/widget-publish.mjs all read a fence the same way.
//
// A fence is
//
//   ```widget hello@3
//   count: 5
//   shape: bars
//   ```
//
// pinning the widget hello at its published version 3 (or `dev`, its local
// build, on the dev server only), with one `key: value` line a prop. Props
// are read against that version's schema: an unknown key or a bad value is
// left out and the default used, and each is said as a problem, never
// thrown.

import type { PropSpec, PropValue, Props, WidgetJson } from './widgetContract'

// ---------------------------------------------------------------------------
// What the site knows: widgets/manifest.json, and on the dev server the
// local folders.

/// One published version, as widgets/manifest.json records it.
export type ManifestVersion = {
  version: number
  /// ISO 8601, when it was published.
  date: string
  /// The files under widgets/{name}/{version}/ in storage.
  files: { path: string; size: number; type: string }[]
  /// sha256 of the files, each path and its bytes in path order, as
  /// `sha256-{hex}`.
  hash: string
  /// The version's widget.json as it was published.
  widget: WidgetJson
  /// "disk" when it was published to a directory rather than the bucket,
  /// which production therefore ignores.
  storage?: 'disk'
}

/// widgets/manifest.json: every published version of every widget.
export type Manifest = Record<string, { versions: ManifestVersion[] }>

/// A widget as the editor and the MCP see it.
export type CatalogEntry = {
  /// The id fences use.
  name: string
  /// The latest published version's name and description, else the local
  /// folder's.
  title: string
  description: string
  /// Published versions, oldest first, each with its widget.json.
  versions: { version: number; date: string; widget: WidgetJson }[]
  /// The local folder (dev server only): its widget.json, whether it has
  /// been built, and when (ms), so a rebuild is loaded afresh.
  dev: { widget: WidgetJson; built: boolean; stamp: number } | null
}

export type Catalog = CatalogEntry[]

/// The newest published version of [entry], or null.
export const latest = (entry: CatalogEntry) => entry.versions[entry.versions.length - 1] ?? null

/// The widget.json a pin of [entry] at [version] reads its props with, or
/// null when there is no such version (or no dev folder, for dev).
export function widgetAt(entry: CatalogEntry | undefined, version: Version): WidgetJson | null {
  if (!entry) return null
  if (version === 'dev') return entry.dev?.widget ?? null
  return entry.versions.find((v) => v.version === version)?.widget ?? null
}

// ---------------------------------------------------------------------------
// Pins

export type Version = number | 'dev'

export type Pin = { name: string; version: Version }

/// A widget's id: lower case, digits and dashes, starting with a letter or
/// digit.
export const WIDGET_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/

/// `hello@3` or `hello@dev` as a pin; null for anything else.
export function parsePin(text: string | null | undefined): Pin | null {
  const m = /^([a-z0-9][a-z0-9-]{0,63})@(dev|[1-9]\d{0,8})$/.exec((text ?? '').trim())
  if (!m) return null
  return { name: m[1]!, version: m[2] === 'dev' ? 'dev' : Number(m[2]) }
}

export const pinText = (pin: Pin) => `${pin.name}@${pin.version}`

/// A fence's opening line, as its marker and what follows `widget`, when it
/// opens a widget fence. Matches what CommonMark takes for a fence's info
/// string: up to three spaces, three or more backticks or tildes.
const OPENING = /^( {0,3})(`{3,}|~{3,})[ \t]*widget(?:[ \t]+([^\n]*))?$/

/// A widget fence found in a post's markdown.
export type Fence = {
  /// Where the opening line starts and the closing line ends, as string
  /// offsets (the closing line's end is the text's end for one left open).
  from: number
  to: number
  /// What follows `widget` on the opening line, trimmed.
  info: string
  /// The pin, or null when the info is not one.
  pin: Pin | null
  /// The lines between the opening and closing lines.
  body: string
}

/// Every widget fence in [markdown], in order. Fences of other languages are
/// stepped over whole, so a widget fence quoted inside one is not taken for
/// one.
export function findFences(markdown: string): Fence[] {
  const fences: Fence[] = []
  const lines = markdown.split('\n')
  let offset = 0
  let open: { marker: string; widget: { from: number; info: string; bodyFrom: number } | null } | null = null
  for (const line of lines) {
    const start = offset
    offset += line.length + 1
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (open) {
      if (marker && marker[0] === open.marker[0] && marker.length >= open.marker.length && line.trim() === marker) {
        if (open.widget) {
          const w = open.widget
          fences.push({ from: w.from, to: start + line.length, info: w.info, pin: parsePin(w.info), body: markdown.slice(w.bodyFrom, Math.max(w.bodyFrom, start - 1)) })
        }
        open = null
      }
      continue
    }
    if (!marker) continue
    // A backtick fence's info has no backticks (CommonMark).
    if (marker[0] === '`' && line.slice(line.indexOf(marker) + marker.length).includes('`')) continue
    const widget = OPENING.exec(line)
    open = { marker, widget: widget ? { from: start, info: (widget[3] ?? '').trim(), bodyFrom: Math.min(offset, markdown.length) } : null }
  }
  if (open?.widget) {
    const w = open.widget
    fences.push({ from: w.from, to: markdown.length, info: w.info, pin: parsePin(w.info), body: markdown.slice(w.bodyFrom) })
  }
  return fences
}

// ---------------------------------------------------------------------------
// Props

/// Props read from a fence's body: every key of the schema, and what was
/// wrong with the body, in words.
export type ReadProps = { props: Props; problems: string[] }

/// The schema's defaults.
export const defaults = (schema: PropSpec[]): Props => Object.fromEntries(schema.map((p) => [p.key, p.default]))

/// One `key: value` line: the key and the raw value, or null for a line
/// that is not one.
function propLine(line: string): { key: string; value: string } | null {
  const m = /^\s*([A-Za-z0-9_-]+)\s*:(.*)$/.exec(line)
  return m ? { key: m[1]!, value: m[2]!.trim() } : null
}

/// [raw] as [spec]'s type, or a problem in words.
export function readValue(spec: PropSpec, raw: string): { value: PropValue } | { problem: string } {
  switch (spec.type) {
    case 'enum': {
      if (spec.options.some((o) => o.value === raw)) return { value: raw }
      return { problem: `"${raw}" is not one of ${spec.options.map((o) => o.value).join(', ')}` }
    }
    case 'number': {
      const n = raw === '' ? Number.NaN : Number(raw)
      if (!Number.isFinite(n)) return { problem: `"${raw}" is not a number` }
      if (n < spec.min || n > spec.max) return { problem: `${raw} is outside ${spec.min} to ${spec.max}` }
      return { value: n }
    }
    case 'boolean': {
      const lower = raw.toLowerCase()
      if (lower === 'true') return { value: true }
      if (lower === 'false') return { value: false }
      return { problem: `"${raw}" is not true or false` }
    }
    case 'string':
      return { value: raw }
  }
}

/// The props of a fence's [body] read against [schema]: the defaults with
/// every good line's value over them. A key the schema lacks, a bad value, a
/// key given twice (the last one counts) and a line that is not
/// `key: value` are each a problem.
export function readProps(body: string, schema: PropSpec[]): ReadProps {
  const props = defaults(schema)
  const problems: string[] = []
  const seen = new Set<string>()
  body.split('\n').forEach((line, i) => {
    if (!line.trim()) return
    const kv = propLine(line)
    if (!kv) return void problems.push(`Line ${i + 1} is not key: value, so it is ignored`)
    const spec = schema.find((p) => p.key === kv.key)
    if (!spec) return void problems.push(`"${kv.key}" is not a setting of this widget, so it is ignored`)
    if (seen.has(kv.key)) problems.push(`"${kv.key}" is set twice; the last one counts`)
    seen.add(kv.key)
    const read = readValue(spec, kv.value)
    if ('problem' in read) {
      props[kv.key] = spec.default
      problems.push(`${spec.key}: ${read.problem}, so the default (${formatValue(spec.default)}) is used`)
    } else props[kv.key] = read.value
  })
  return { props, problems }
}

/// A value as its fence line writes it. Text keeps to one line.
export const formatValue = (value: PropValue) => (typeof value === 'string' ? value.replace(/\s*\n\s*/g, ' ').trim() : String(value))

/// [body] with [key] set to [value]: its line rewritten in place (the last
/// one, if it is there twice, since that is the one that counts), or a line
/// added at the end. Nothing else in the body changes.
export function setProp(body: string, key: string, value: PropValue): string {
  const lines = body === '' ? [] : body.split('\n')
  const line = `${key}: ${formatValue(value)}`
  let at = -1
  lines.forEach((l, i) => {
    if (propLine(l)?.key === key) at = i
  })
  if (at >= 0) lines[at] = line
  else {
    // After the last line with something on it, not after trailing blanks.
    let end = lines.length
    while (end > 0 && !lines[end - 1]!.trim()) end--
    lines.splice(end, 0, line)
  }
  return lines.join('\n')
}

/// A fence's body for [props]: a line each, in the schema's order.
export const propsBody = (schema: PropSpec[], props: Props) => schema.map((p) => `${p.key}: ${formatValue(props[p.key] ?? p.default)}`).join('\n')

/// A whole fence pinning [pin] with [props] (the defaults when left out).
export function fenceText(pin: Pin, schema: PropSpec[], props: Props = defaults(schema)): string {
  const body = propsBody(schema, props)
  return `\`\`\`widget ${pinText(pin)}\n${body}${body ? '\n' : ''}\`\`\``
}

/// The props in one line of words, for the editor's closed card: each
/// prop's value, an enum's by its label, a boolean as on or off.
export function propsSummary(schema: PropSpec[], props: Props): string {
  return schema
    .map((p) => {
      const value = props[p.key] ?? p.default
      const said =
        p.type === 'enum'
          ? (p.options.find((o) => o.value === value)?.label ?? String(value))
          : p.type === 'boolean'
            ? value
              ? 'on'
              : 'off'
            : p.type === 'number'
              ? `${value}${p.unit ?? ''}`
              : `"${value}"`
      return `${p.key}: ${said}`
    })
    .join(', ')
}

// ---------------------------------------------------------------------------
// widget.json

/// What is wrong with a widget.json, in words; empty when nothing is. [name]
/// is the folder's name, which the id must match.
export function checkWidgetJson(json: unknown, name?: string): string[] {
  const problems: string[] = []
  const w = json as Partial<WidgetJson> | null
  if (!w || typeof w !== 'object') return ['widget.json is not an object']
  if (typeof w.id !== 'string' || !WIDGET_NAME.test(w.id)) problems.push('id must be lower case letters, digits and dashes')
  else if (name !== undefined && w.id !== name) problems.push(`id "${w.id}" is not the folder's name "${name}"`)
  if (typeof w.name !== 'string' || !w.name.trim()) problems.push('name is missing')
  if (typeof w.description !== 'string') problems.push('description is missing')
  if (!w.build || typeof w.build.command !== 'string' || typeof w.build.output !== 'string' || !w.build.output || w.build.output.includes('..'))
    problems.push('build needs a command and an output folder inside the widget')
  const size = w.size as Record<string, unknown> | undefined
  if (!size || !((typeof size.aspectRatio === 'string' && ASPECT.test(size.aspectRatio)) || (typeof size.height === 'number' && size.height > 0 && size.height <= 4000)))
    problems.push('size needs an aspectRatio such as "16 / 9" or a height in pixels')
  if (!Array.isArray(w.props)) problems.push('props must be a list')
  else {
    const keys = new Set<string>()
    for (const p of w.props as PropSpec[]) {
      const where = `prop ${JSON.stringify((p as { key?: unknown })?.key ?? '?')}`
      if (!p || typeof p.key !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(p.key)) {
        problems.push(`${where}: key must be lower case letters, digits, - and _`)
        continue
      }
      if (keys.has(p.key)) problems.push(`${where}: given twice`)
      keys.add(p.key)
      if (typeof p.label !== 'string' || !p.label.trim()) problems.push(`${where}: label is missing`)
      if (p.type === 'enum') {
        if (!Array.isArray(p.options) || !p.options.length || p.options.some((o) => typeof o?.value !== 'string' || typeof o?.label !== 'string' || /\n/.test(o.value) || o.value.trim() !== o.value))
          problems.push(`${where}: options must be { value, label } pairs`)
        else if (!p.options.some((o) => o.value === p.default)) problems.push(`${where}: the default is not one of its options`)
      } else if (p.type === 'number') {
        if (typeof p.min !== 'number' || typeof p.max !== 'number' || p.min > p.max) problems.push(`${where}: min and max are needed, min first`)
        else if (typeof p.default !== 'number' || p.default < p.min || p.default > p.max) problems.push(`${where}: the default is not between min and max`)
        if (p.step !== undefined && !(typeof p.step === 'number' && p.step > 0)) problems.push(`${where}: step must be more than 0`)
      } else if (p.type === 'boolean') {
        if (typeof p.default !== 'boolean') problems.push(`${where}: the default must be true or false`)
      } else if (p.type === 'string') {
        if (typeof p.default !== 'string' || p.default.includes('\n')) problems.push(`${where}: the default must be one line of text`)
      } else problems.push(`${where}: type must be enum, number, boolean or string`)
    }
  }
  return problems
}

const ASPECT = /^\d+(\.\d+)?(\s*\/\s*\d+(\.\d+)?)?$/

/// The CSS that keeps a widget's space before it loads, from its size hint.
export function sizeStyle(size: WidgetJson['size'] | undefined): string {
  if (size && 'aspectRatio' in size && ASPECT.test(size.aspectRatio)) return `aspect-ratio: ${size.aspectRatio}`
  if (size && 'height' in size && typeof size.height === 'number' && size.height > 0) return `min-height: ${Math.min(Math.round(size.height), 4000)}px`
  return ''
}

/// Where a published version's module is served (src/routes/media/$.ts).
export const moduleUrl = (name: string, version: number) => `/media/widgets/${name}/${version}/index.js`

/// Where the dev server serves a local build (vite.config.ts, dev only),
/// with [stamp] so a rebuild is loaded afresh.
export const devModuleUrl = (name: string, stamp: number | string) => `/__widgets/${name}/index.js?v=${stamp}`
