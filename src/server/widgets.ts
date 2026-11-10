import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import bundled from '../../widgets/manifest.json'
import {
  checkWidgetJson,
  devModuleUrl,
  findFences,
  latest,
  moduleUrl,
  pinText,
  widgetAt,
  type Catalog,
  type CatalogEntry,
  type Manifest,
  type Pin,
} from '#/lib/widgets'
import type { WidgetJson } from '#/lib/widgetContract'

// What the site knows of widgets (BRIEF.md, Widgets): in production only
// the committed widgets/manifest.json, built into the server; on the dev
// server the file as it is on disk now (Prepare for publish adds to it), and
// the local folders under widgets/, which can be pinned as {name}@dev.

/// Whether this is the dev server (or the tests), as storage.ts decides it.
export function dev(): boolean {
  return import.meta.env.DEV === true && process.env.NODE_ENV !== 'production'
}

/// The widgets folder: WIDGETS_DIR (for the tests) or widgets/ in the repo
/// root, where every npm script runs. Dev only.
export const widgetsDir = () => resolve(process.cwd(), process.env.WIDGETS_DIR || 'widgets')

/// Every published version of every widget. Production leaves out versions
/// published to a directory, which its bucket does not have.
export function manifest(): Manifest {
  if (!dev()) {
    const all = bundled as Manifest
    return Object.fromEntries(Object.entries(all).map(([name, w]) => [name, { ...w, versions: w.versions.filter((v) => v.storage !== 'disk') }]))
  }
  try {
    return JSON.parse(readFileSync(join(widgetsDir(), 'manifest.json'), 'utf8')) as Manifest
  } catch {
    return {}
  }
}

/// The local widget folders (dev only): each with a good widget.json, and
/// whether its build output is there.
function devFolders(): Map<string, NonNullable<CatalogEntry['dev']>> {
  const found = new Map<string, NonNullable<CatalogEntry['dev']>>()
  if (!dev()) return found
  let names: string[]
  try {
    names = readdirSync(widgetsDir(), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    return found
  }
  for (const name of names) {
    const dir = join(widgetsDir(), name)
    let widget: WidgetJson
    try {
      widget = JSON.parse(readFileSync(join(dir, 'widget.json'), 'utf8')) as WidgetJson
    } catch {
      continue
    }
    if (checkWidgetJson(widget, name).length) continue
    const entry = join(dir, widget.build.output, 'index.js')
    const built = existsSync(entry)
    found.set(name, { widget, built, stamp: built ? Math.floor(statSync(entry).mtimeMs) : 0 })
  }
  return found
}

/// Every widget there is: the published ones and, on the dev server, the
/// local folders, by name.
export function catalog(): Catalog {
  const published = manifest()
  const local = devFolders()
  const names = [...new Set([...Object.keys(published), ...local.keys()])].sort()
  return names.map((name) => {
    const versions = [...(published[name]?.versions ?? [])].sort((a, b) => a.version - b.version).map((v) => ({ version: v.version, date: v.date, widget: v.widget }))
    const entry: CatalogEntry = { name, title: '', description: '', versions, dev: local.get(name) ?? null }
    const shown = latest(entry)?.widget ?? entry.dev?.widget
    entry.title = shown?.name ?? name
    entry.description = shown?.description ?? ''
    return entry
  })
}

/// Where a pin's module is, with the widget.json its props are read by; or
/// why it cannot run, in words.
export type Target = { src: string; widget: WidgetJson } | { error: string }

export function target(pin: Pin, widgets: Catalog = catalog()): Target {
  const entry = widgets.find((w) => w.name === pin.name)
  if (!entry) return { error: `No widget is named "${pin.name}"` }
  if (pin.version === 'dev') {
    if (!dev()) return { error: `${pinText(pin)} is a local build, which only the dev server runs` }
    if (!entry.dev) return { error: `${pin.name} has no folder under widgets/` }
    if (!entry.dev.built) return { error: `${pin.name} has not been built yet: run npm run widget:dev ${pin.name}` }
    return { src: devModuleUrl(pin.name, entry.dev.stamp), widget: entry.dev.widget }
  }
  const widget = widgetAt(entry, pin.version)
  if (!widget) return { error: `${pin.name} has no published version ${pin.version}` }
  return { src: moduleUrl(pin.name, pin.version), widget }
}

/// Why [markdown] cannot be published, in words, or null: a fence that pins
/// a local build, a version the manifest does not have, or no widget at all.
/// Read against the manifest alone, since that is what production has.
export function publishProblem(markdown: string): string | null {
  const published = manifest()
  for (const fence of findFences(markdown)) {
    const pin = fence.pin
    if (!pin) return `A widget fence says "widget ${fence.info}", which pins no widget; write it as widget {name}@{version}`
    if (pin.version === 'dev')
      return `It pins ${pinText(pin)}, a local build: use Prepare for publish in the editor (or npm run widget:publish ${pin.name}) and pin the version that makes`
    if (!published[pin.name]?.versions.some((v) => v.version === pin.version)) return `It pins ${pinText(pin)}, which is not in widgets/manifest.json`
  }
  return null
}
