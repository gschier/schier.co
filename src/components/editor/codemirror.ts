// The post body as CodeMirror 6 draws it (src/components/editor.tsx makes
// one with createBody):
// - markdown with GFM, every syntax mark left visible, but the words styled:
//   headings larger by level, bold and italic, code in the mono face on a
//   faint ground, links coloured, list marks and quotes quieter. The classes
//   are md-*; their colours are the site's, in src/styles.css;
// - the keys the textarea had: Tab puts in a tab with nothing selected and
//   indents the touched lines two spaces with a selection, Shift-Tab takes
//   that back, Enter keeps the line's indent; history gives undo;
// - an image on a line of its own has its thumbnail, alt text and Replace
//   drawn under the line. A file being uploaded is drawn there at once,
//   dimmed; its markdown goes in when the upload is done, in one
//   transaction, so undo takes it out and a save mid-upload stores nothing
//   half done;
// - a widget fence is drawn as a card the editor fills (widgetCard.tsx),
//   and a slash alone on a line opens the widget picker.

import { EditorSelection, EditorState, Facet, MapMode, Prec, StateEffect, StateField, type ChangeSet, type ChangeSpec, type Extension } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType, highlightActiveLine, keymap, placeholder, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, redo, undo } from '@codemirror/commands'
import { findFences, type Fence } from '#/lib/widgets'
import { HighlightStyle, ensureSyntaxTree, syntaxHighlighting, syntaxTree } from '@codemirror/language'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { tags as t } from '@lezer/highlight'

// ---------------------------------------------------------------------------
// Markdown, styled

const style = HighlightStyle.define([
  { tag: t.heading1, class: 'md-h md-h1' },
  { tag: t.heading2, class: 'md-h md-h2' },
  { tag: t.heading3, class: 'md-h md-h3' },
  { tag: t.heading4, class: 'md-h md-h4' },
  { tag: t.heading5, class: 'md-h md-h5' },
  { tag: t.heading6, class: 'md-h md-h6' },
  { tag: t.strong, class: 'md-strong' },
  { tag: t.emphasis, class: 'md-em' },
  { tag: t.strikethrough, class: 'md-strike' },
  { tag: t.link, class: 'md-link' },
  { tag: t.url, class: 'md-url' },
  { tag: t.monospace, class: 'md-code' },
  { tag: t.processingInstruction, class: 'md-mark' },
  { tag: t.labelName, class: 'md-mark' },
  { tag: t.contentSeparator, class: 'md-mark' },
  { tag: t.quote, class: 'md-quote' },
])

const fenceLine = Decoration.line({ class: 'md-fence' })
const fenceFirst = Decoration.line({ class: 'md-fence md-fence--first' })
const fenceLast = Decoration.line({ class: 'md-fence md-fence--last' })

/// A fenced code block's lines on a faint ground, as one block.
const fences = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = this.build(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) this.decorations = this.build(update.view)
    }
    build(view: EditorView) {
      const lines: { from: number; deco: Decoration }[] = []
      for (const { from, to } of view.visibleRanges) {
        syntaxTree(view.state).iterate({
          from,
          to,
          enter: (node) => {
            if (node.name !== 'FencedCode' && node.name !== 'CodeBlock') return
            const doc = view.state.doc
            const first = doc.lineAt(node.from).number
            const last = doc.lineAt(node.to).number
            for (let n = first; n <= last; n++) {
              const line = doc.line(n)
              if (line.to < from || line.from > to) continue
              lines.push({ from: line.from, deco: n === first ? fenceFirst : n === last ? fenceLast : fenceLine })
            }
            return false
          },
        })
      }
      const seen = new Set<number>()
      return Decoration.set(
        lines.filter((l) => !seen.has(l.from) && seen.add(l.from)).map((l) => l.deco.range(l.from)),
        true,
      )
    }
  },
  { decorations: (v) => v.decorations },
)

// ---------------------------------------------------------------------------
// Keys

/// Tab: a tab character where nothing is selected, else two spaces before
/// every line the selection touches.
function tab(view: EditorView) {
  if (view.state.selection.ranges.every((r) => r.empty)) {
    view.dispatch(view.state.replaceSelection('\t'), { scrollIntoView: true, userEvent: 'input' })
    return true
  }
  return shiftLines(view, 1)
}

const untab = (view: EditorView) => shiftLines(view, -1)

/// Indents ([dir] 1) or takes back ([dir] -1, two spaces or a tab) every
/// line a selection touches. A selection is widened to its whole lines, as
/// the textarea did it.
function shiftLines(view: EditorView, dir: 1 | -1) {
  const { state } = view
  const changes: ChangeSpec[] = []
  const seen = new Set<number>()
  const spans = state.selection.ranges.map((r) => {
    const first = state.doc.lineAt(r.from)
    // A selection ending at the start of a line does not touch that line.
    const last = state.doc.lineAt(r.to > r.from && state.doc.lineAt(r.to).from === r.to ? r.to - 1 : r.to)
    for (let n = first.number; n <= last.number; n++) {
      if (seen.has(n)) continue
      seen.add(n)
      const line = state.doc.line(n)
      if (dir > 0) changes.push({ from: line.from, insert: '  ' })
      else {
        const lead = /^( {1,2}|\t)/.exec(line.text)
        if (lead) changes.push({ from: line.from, to: line.from + lead[0].length })
      }
    }
    return { range: r, from: first.from, to: last.to }
  })
  if (!changes.length) return true
  const set = state.changes(changes)
  const selection = EditorSelection.create(
    spans.map(({ range, from, to }) => (range.empty ? range.map(set) : EditorSelection.range(set.mapPos(from, -1), set.mapPos(to, 1)))),
    state.selection.mainIndex,
  )
  view.dispatch({ changes: set, selection, userEvent: dir > 0 ? 'input.indent' : 'delete.dedent' })
  return true
}

/// Enter: a new line with the indent of the one it breaks, and nothing more
/// (no list continued).
function newline(view: EditorView) {
  const { state } = view
  view.dispatch(
    state.changeByRange((range) => {
      const line = state.doc.lineAt(range.from)
      const insert = `\n${/^[ \t]*/.exec(line.text.slice(0, range.from - line.from))![0]}`
      return { changes: { from: range.from, to: range.to, insert }, range: EditorSelection.cursor(range.from + insert.length) }
    }),
    { scrollIntoView: true, userEvent: 'input' },
  )
  return true
}

const keys = Prec.high(
  keymap.of([
    { key: 'Tab', run: tab, shift: untab },
    { key: 'Enter', run: newline },
  ]),
)

// ---------------------------------------------------------------------------
// Images: the uploads in progress

type Upload = {
  id: number
  /// Where its markdown will go; for a replacement, the image line's start.
  pos: number
  name: string
  /// The local file, shown while it uploads.
  src: string
  /// For a replacement, the URL it replaces.
  replacing: string | null
}

const addUpload = StateEffect.define<Upload>()
const endUpload = StateEffect.define<number>()

/// An upload's place through a change: a new image's follows the text, and
/// a replacement is dropped when its image's start is deleted, so it never
/// lands on another image.
function mapUpload(upload: Upload, changes: ChangeSet): Upload | null {
  if (upload.replacing === null) return { ...upload, pos: changes.mapPos(upload.pos, 1) }
  const pos = changes.mapPos(upload.pos, -1, MapMode.TrackAfter)
  return pos === null ? null : { ...upload, pos }
}

const uploads = StateField.define<Upload[]>({
  create: () => [],
  update(list, tr) {
    let next = tr.docChanged ? list.map((u) => mapUpload(u, tr.changes)).filter((u) => u !== null) : list
    for (const effect of tr.effects) {
      if (effect.is(addUpload)) next = [...next, effect.value]
      else if (effect.is(endUpload)) next = next.filter((u) => u.id !== effect.value)
    }
    return next
  },
})

/// What the editor does when a decoration's button is pressed.
export type ImageActions = {
  /// Replace the image whose line starts at [pos].
  replace: (view: EditorView, pos: number) => void
  /// Stop the upload [id].
  cancel: (id: number) => void
}

const actions = Facet.define<ImageActions, ImageActions | null>({ combine: (values) => values[0] ?? null })

// ---------------------------------------------------------------------------
// Images: the decorations

/// `![alt](url)` or `![alt](url "title")`, alone on its line, indented less
/// than an indented code block would be.
const IMAGE_LINE = /^ {0,3}!\[([^\]]*)\]\(([^\s)]+)(?:\s+"[^"]*")?\)\s*$/
/// The part of an image line before its URL, and the URL.
const IMAGE_URL = /^( {0,3}!\[[^\]]*\]\()([^\s)]+)/

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/// The thumbnail, with the image's size once it has loaded.
function thumb(view: EditorView, src: string, alt: string, size?: HTMLElement) {
  const box = el('span', 'cm-image__thumb')
  const img = el('img', '')
  img.alt = alt
  img.decoding = 'async'
  img.onload = () => {
    if (size) size.textContent = `${img.naturalWidth} × ${img.naturalHeight}`
    view.requestMeasure()
  }
  img.onerror = () => box.classList.add('cm-image__thumb--broken')
  img.src = src
  box.append(img)
  return box
}

/// The upload's dimmed file, an indeterminate bar, and Cancel.
function uploading(view: EditorView, wrap: HTMLElement, upload: { id: number; name: string; src: string }) {
  wrap.classList.add('cm-image--uploading')
  const box = thumb(view, upload.src, upload.name)
  box.append(el('span', 'cm-image__progress'))
  const row = el('div', 'cm-image__row')
  const said = el('span', 'cm-image__said', 'Uploading ')
  said.append(el('span', 'cm-image__name', upload.name))
  const cancel = el('button', 'cm-image__cancel', 'Cancel')
  cancel.type = 'button'
  cancel.onclick = () => view.state.facet(actions)?.cancel(upload.id)
  row.append(el('span', 'cm-image__spinner'), said, cancel)
  wrap.append(box, row)
}

class ImageWidget extends WidgetType {
  constructor(
    readonly alt: string,
    readonly url: string,
    readonly pending: Upload | null,
  ) {
    super()
  }
  eq(other: ImageWidget) {
    return other.alt === this.alt && other.url === this.url && other.pending?.id === this.pending?.id
  }
  get estimatedHeight() {
    return 170
  }
  toDOM(view: EditorView) {
    const wrap = el('div', 'cm-image')
    if (this.pending) {
      uploading(view, wrap, this.pending)
      return wrap
    }
    const size = el('span', 'cm-image__size')
    const row = el('div', 'cm-image__row')
    const replace = el('button', 'btn btn--xs btn--gray cm-image__replace', 'Replace')
    replace.type = 'button'
    replace.onclick = () => view.state.facet(actions)?.replace(view, view.state.doc.lineAt(view.posAtDOM(wrap)).from)
    row.append(el('span', 'cm-image__name', this.alt || this.url.split('/').pop() || this.url), size, replace)
    wrap.append(thumb(view, this.url, this.alt, size), row)
    return wrap
  }
}

class PendingWidget extends WidgetType {
  constructor(readonly upload: Upload) {
    super()
  }
  eq(other: PendingWidget) {
    return other.upload.id === this.upload.id
  }
  get estimatedHeight() {
    return 170
  }
  toDOM(view: EditorView) {
    const wrap = el('div', 'cm-image')
    uploading(view, wrap, this.upload)
    return wrap
  }
}

function imageDecorations(state: EditorState): DecorationSet {
  const pending = state.field(uploads)
  const ranges = []
  let fence: string | null = null
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n)
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line.text)?.[1]
    if (marker) {
      if (fence === null) fence = marker
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null
      continue
    }
    if (fence !== null) continue
    const image = IMAGE_LINE.exec(line.text)
    if (!image) continue
    const replacing = pending.find((u) => u.replacing !== null && state.doc.lineAt(u.pos).number === n) ?? null
    ranges.push(Decoration.widget({ widget: new ImageWidget(image[1]!, image[2]!, replacing), block: true, side: 1 }).range(line.to))
  }
  for (const upload of pending) {
    if (upload.replacing === null) ranges.push(Decoration.widget({ widget: new PendingWidget(upload), block: true, side: 1 }).range(state.doc.lineAt(upload.pos).to))
  }
  return Decoration.set(ranges, true)
}

const images = StateField.define<DecorationSet>({
  create: imageDecorations,
  update: (decorations, tr) => (tr.docChanged || tr.effects.some((e) => e.is(addUpload) || e.is(endUpload)) ? imageDecorations(tr.state) : decorations),
  provide: (field) => EditorView.decorations.from(field),
})

// ---------------------------------------------------------------------------
// Images: uploading

export type Uploader = (file: File, signal: AbortSignal) => Promise<string>
export type Failure = (file: File, error: unknown) => void

let uploadIds = 0
const controllers = new Map<number, AbortController>()

export const isImage = (file: File) => file.type.startsWith('image/')

/// Stops the upload [id]; its file is dropped with no message.
export function cancelUpload(id: number) {
  controllers.get(id)?.abort()
}

/// Uploads [file], drawn at [pos] while it goes, then calls [done] with its
/// URL and where it is now. Returns where the next one should go: after
/// what [done] put in, or where this one was.
async function run(view: EditorView, file: File, pos: number, replacing: string | null, upload: Uploader, failed: Failure, done: (url: string, at: Upload) => number | void) {
  const id = ++uploadIds
  const src = URL.createObjectURL(file)
  const controller = new AbortController()
  controllers.set(id, controller)
  view.dispatch({ effects: addUpload.of({ id, pos: Math.min(pos, view.state.doc.length), name: file.name, src, replacing }) })
  const current = () => view.state.field(uploads, false)?.find((u) => u.id === id)
  let next = pos
  try {
    const url = await upload(file, controller.signal)
    const at = current()
    if (at) next = done(url, at) ?? at.pos
  } catch (error) {
    if (!controller.signal.aborted) failed(file, error)
  } finally {
    controllers.delete(id)
    // The editor may be gone by now, with the page.
    const at = current()
    if (at) {
      next = at.pos
      view.dispatch({ effects: endUpload.of(id) })
    }
    URL.revokeObjectURL(src)
  }
  return next
}

/// Uploads [files] one after another, each drawn at [pos] while it goes,
/// then its markdown put there on a line of its own; the next goes after it.
export async function uploadImages(view: EditorView, files: File[], pos: number, upload: Uploader, failed: Failure) {
  let at = pos
  for (const file of files) {
    at = await run(view, file, at, null, upload, failed, (url, upload) => {
      const { state } = view
      const line = state.doc.lineAt(upload.pos)
      const insert = `${upload.pos === line.from ? '' : '\n'}![${file.name}](${url})\n`
      const main = state.selection.main
      view.dispatch({
        changes: { from: upload.pos, insert },
        effects: endUpload.of(upload.id),
        // The cursor follows only if it was still where the image went.
        selection: main.empty && main.head === upload.pos ? EditorSelection.cursor(upload.pos + insert.length) : undefined,
        userEvent: 'input.paste',
      })
      return upload.pos + insert.length
    })
  }
}

/// Uploads [file] in place of the image on the line starting at [pos], and
/// rewrites that image's URL, if it is still that image. One deleted while
/// the file uploads is left gone.
export function replaceImage(view: EditorView, pos: number, file: File, upload: Uploader, failed: Failure) {
  const was = IMAGE_URL.exec(view.state.doc.lineAt(pos).text)?.[2]
  if (!was) return Promise.resolve(pos)
  return run(view, file, pos, was, upload, failed, (url, at) => {
    const line = view.state.doc.lineAt(at.pos)
    const image = IMAGE_URL.exec(line.text)
    if (!image || image[2] !== was) return failed(file, new Error('The image changed while its replacement uploaded, so it was left as it is'))
    const from = line.from + image[1]!.length
    view.dispatch({ changes: { from, to: from + image[2]!.length, insert: url }, effects: endUpload.of(at.id), userEvent: 'input.replace' })
  })
}

/// Pasted or dropped images go to [onFiles], with where they go.
function imageEvents(onFiles: (files: File[], pos: number) => void) {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const files = [...(event.clipboardData?.files ?? [])].filter(isImage)
      if (!files.length) return false
      event.preventDefault()
      onFiles(files, view.state.selection.main.head)
      return true
    },
    dragover(event) {
      if (!event.dataTransfer?.types.includes('Files')) return false
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
      return true
    },
    drop(event, view) {
      if (!event.dataTransfer?.types.includes('Files')) return false
      event.preventDefault()
      const files = [...event.dataTransfer.files].filter(isImage)
      if (files.length) onFiles(files, view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head)
      return true
    },
  })
}

// ---------------------------------------------------------------------------
// Widgets: a card in place of each fence
//
// A ```widget fence (src/lib/widgets.ts) is drawn as a card: a block
// decoration over its lines whose element the editor fills with a React
// portal (src/components/editor/widgetCard.tsx), handed over through the
// cardHost facet. The fence's text stays the document: the card reads it,
// and every edit in its form is a transaction on it, so undo takes it back.
// "Source" shows a fence's lines as text again, with a way back to the card.

/// Where the editor draws cards: show() each time a card's fence is drawn
/// or changes, hide() when it goes.
export type CardHost = {
  show: (dom: HTMLElement, fence: { info: string; body: string }) => void
  hide: (dom: HTMLElement) => void
}

const cardHost = Facet.define<CardHost, CardHost | null>({ combine: (values) => values[0] ?? null })
const hosts = new WeakMap<HTMLElement, CardHost>()

/// Shows the fence starting at the position as its lines ([on] true) or as
/// its card again.
const asSource = StateEffect.define<{ pos: number; on: boolean }>()

const sources = StateField.define<number[]>({
  create: () => [],
  update(list, tr) {
    let next = tr.docChanged ? list.map((pos) => tr.changes.mapPos(pos, -1, MapMode.TrackDel)).filter((p): p is number => p !== null) : list
    for (const effect of tr.effects) {
      if (!effect.is(asSource)) continue
      next = effect.value.on ? [...next.filter((p) => p !== effect.value.pos), effect.value.pos] : next.filter((p) => p !== effect.value.pos)
    }
    return next
  },
})

class CardWidget extends WidgetType {
  constructor(
    readonly info: string,
    readonly body: string,
  ) {
    super()
  }
  eq(other: CardWidget) {
    return other.info === this.info && other.body === this.body
  }
  get estimatedHeight() {
    return 140
  }
  toDOM(view: EditorView) {
    const dom = el('div', 'cm-widget-card')
    const host = view.state.facet(cardHost)
    if (host) {
      hosts.set(dom, host)
      host.show(dom, { info: this.info, body: this.body })
    }
    return dom
  }
  updateDOM(dom: HTMLElement) {
    hosts.get(dom)?.show(dom, { info: this.info, body: this.body })
    return true
  }
  destroy(dom: HTMLElement) {
    hosts.get(dom)?.hide(dom)
    hosts.delete(dom)
  }
  ignoreEvent() {
    return true
  }
}

/// "show the card", at the end of a fence's first line shown as text.
class BackToCard extends WidgetType {
  constructor(readonly pos: number) {
    super()
  }
  eq(other: BackToCard) {
    return other.pos === this.pos
  }
  toDOM(view: EditorView) {
    const button = el('button', 'cm-widget-back', 'show the card')
    button.type = 'button'
    button.onmousedown = (e) => e.preventDefault()
    button.onclick = () => {
      const pos = view.state.doc.lineAt(view.posAtDOM(button)).from
      view.dispatch({ effects: asSource.of({ pos, on: false }) })
    }
    return button
  }
  ignoreEvent() {
    return true
  }
}

function cardDecorations(state: EditorState): DecorationSet {
  const shownAsText = state.field(sources)
  const ranges = []
  for (const fence of findFences(state.doc.toString())) {
    if (shownAsText.includes(fence.from)) {
      ranges.push(Decoration.widget({ widget: new BackToCard(fence.from), side: 1 }).range(state.doc.lineAt(fence.from).to))
      continue
    }
    ranges.push(Decoration.replace({ widget: new CardWidget(fence.info, fence.body), block: true }).range(fence.from, fence.to))
  }
  return Decoration.set(ranges, true)
}

const cards = StateField.define<DecorationSet>({
  create: cardDecorations,
  update: (decorations, tr) => (tr.docChanged || tr.effects.some((e) => e.is(asSource)) ? cardDecorations(tr.state) : decorations),
  provide: (field) => [EditorView.decorations.from(field), EditorView.atomicRanges.of((view) => view.state.field(field))],
})

/// The fence whose card is [dom], as it is in the document now.
export function fenceOf(view: EditorView, dom: HTMLElement): Fence | null {
  let pos: number
  try {
    pos = view.posAtDOM(dom)
  } catch {
    return null
  }
  return findFences(view.state.doc.toString()).find((f) => f.from === pos) ?? null
}

/// Rewrites [fence]'s body as [body], changing only what differs, as one
/// step undo can take back.
export function setFenceBody(view: EditorView, fence: Fence, body: string) {
  const a = fence.body
  if (a === body) return
  const opening = view.state.doc.lineAt(fence.from)
  const bodyFrom = opening.to + 1
  if (bodyFrom > view.state.doc.length) {
    view.dispatch({ changes: { from: opening.to, insert: `\n${body}` }, userEvent: 'input.widget' })
    return
  }
  if (a === '' && bodyFrom === view.state.doc.lineAt(fence.to).from) {
    // No line between the fence's: the body goes in as lines of its own.
    view.dispatch({ changes: { from: bodyFrom, insert: `${body}\n` }, userEvent: 'input.widget' })
    return
  }
  let start = 0
  while (start < a.length && start < body.length && a[start] === body[start]) start++
  let end = 0
  while (end < a.length - start && end < body.length - start && a[a.length - 1 - end] === body[body.length - 1 - end]) end++
  view.dispatch({ changes: { from: bodyFrom + start, to: bodyFrom + a.length - end, insert: body.slice(start, body.length - end) }, userEvent: 'input.widget' })
}

/// Pins [fence] to [pin] instead, rewriting its first line's info.
export function setFencePin(view: EditorView, fence: Fence, pin: string) {
  const opening = view.state.doc.lineAt(fence.from)
  const m = /^( {0,3}(?:`{3,}|~{3,})[ \t]*widget)(.*)$/.exec(opening.text)
  if (!m) return
  view.dispatch({ changes: { from: opening.from + m[1]!.length, to: opening.to, insert: ` ${pin}` }, userEvent: 'input.widget' })
}

/// Repins every fence pinning `{name}@dev` for a name in [versions] to the
/// version given, as one step undo can take back.
export function repinDev(view: EditorView, versions: Record<string, number>) {
  const changes: ChangeSpec[] = []
  for (const fence of findFences(view.state.doc.toString())) {
    const version = fence.pin?.version === 'dev' ? versions[fence.pin.name] : undefined
    if (version === undefined) continue
    const opening = view.state.doc.lineAt(fence.from)
    const m = /^( {0,3}(?:`{3,}|~{3,})[ \t]*widget)(.*)$/.exec(opening.text)
    if (m) changes.push({ from: opening.from + m[1]!.length, to: opening.to, insert: ` ${fence.pin!.name}@${version}` })
  }
  if (changes.length) view.dispatch({ changes, userEvent: 'input.widget' })
  return changes.length
}

/// Shows [fence] as its lines of text, with the cursor on its first line.
export function showSource(view: EditorView, fence: Fence) {
  const opening = view.state.doc.lineAt(fence.from)
  view.dispatch({ effects: asSource.of({ pos: fence.from, on: true }), selection: EditorSelection.cursor(opening.to), scrollIntoView: true })
  view.focus()
}

/// Puts [text] (a whole fence) on lines of its own at [pos], or in place of
/// the line at [replaceLine] (the slash that asked for it) while that line is
/// still just a slash. The cursor goes after it.
export function insertFence(view: EditorView, pos: number, text: string, replaceLine?: number) {
  const { doc } = view.state
  // The slash's line, while it is still just a slash, or an empty line,
  // takes the fence; else it goes after the cursor's line. Either way a
  // blank line keeps it from the text around it.
  const slash = replaceLine !== undefined && replaceLine <= doc.length ? doc.lineAt(replaceLine) : null
  const line = slash && slash.from === replaceLine && slash.text.trim() === '/' ? slash : doc.lineAt(Math.min(pos, doc.length))
  const replace = line === slash || !line.text.trim()
  const prev = line.number > 1 ? doc.line(line.number - 1) : null
  const next = line.number < doc.lines ? doc.line(line.number + 1) : null
  const before = !replace ? '\n\n' : prev?.text.trim() ? '\n' : ''
  const after = !next || next.text.trim() ? '\n' : ''
  const from = replace ? line.from : line.to
  view.dispatch({
    changes: { from, to: line.to, insert: `${before}${text}${after}` },
    selection: EditorSelection.cursor(from + before.length + text.length),
    userEvent: 'input.widget',
    scrollIntoView: true,
  })
}

/// Undo and redo in the body's history, for keys pressed inside a card.
export const undoBody = (view: EditorView) => undo(view)
export const redoBody = (view: EditorView) => redo(view)

/// A slash typed alone on a line: the picker opens there.
function slashes(onSlash: (lineFrom: number) => void) {
  return EditorView.updateListener.of((update) => {
    if (!update.docChanged || !update.transactions.some((tr) => tr.isUserEvent('input.type'))) return
    const { main } = update.state.selection
    if (!main.empty) return
    const line = update.state.doc.lineAt(main.head)
    if (line.text === '/' && main.head === line.to) onSlash(line.from)
  })
}

// ---------------------------------------------------------------------------
// The headings, for the preview to follow the cursor

const HEADING = /^(ATX|Setext)Heading\d$/

/// How many of the post's own headings (# and underlined, at the top level
/// as the preview's article has them) start at or before [pos]'s line, less
/// one: the index of the heading the cursor is under, or -1.
export function headingAt(state: EditorState, pos: number): number {
  const end = state.doc.lineAt(pos).to
  const tree = ensureSyntaxTree(state, end, 50) ?? syntaxTree(state)
  let count = -1
  for (let node = tree.topNode.firstChild; node && node.from <= end; node = node.nextSibling) {
    if (HEADING.test(node.name)) count++
  }
  return count
}

// ---------------------------------------------------------------------------
// The editor

export type BodyOptions = {
  doc: string
  parent: HTMLElement
  /// Called with the new text after every change.
  onChange: (text: string) => void
  /// Called when the cursor moves or the text changes.
  onCursor?: (state: EditorState) => void
  onFiles: (files: File[], pos: number) => void
  actions: ImageActions
  /// The id of the element that labels the body.
  labelledBy?: string
  /// What covers the window's top and bottom edges (fixed bars, the
  /// keyboard), so the cursor is kept clear of them.
  margins?: () => { top: number; bottom: number } | null
  /// Where widget fences' cards are drawn.
  cards?: CardHost
  /// A slash typed alone on a line, at the line's start.
  onSlash?: (lineFrom: number) => void
}

export function createBody(options: BodyOptions): EditorView {
  const extensions: Extension[] = [
    history(),
    keys,
    keymap.of([...defaultKeymap, ...historyKeymap]),
    markdown({ base: markdownLanguage, addKeymap: false, completeHTMLTags: false }),
    syntaxHighlighting(style),
    fences,
    uploads,
    images,
    actions.of(options.actions),
    imageEvents(options.onFiles),
    sources,
    cards,
    ...(options.cards ? [cardHost.of(options.cards)] : []),
    ...(options.onSlash ? [slashes(options.onSlash)] : []),
    highlightActiveLine(),
    EditorView.lineWrapping,
    placeholder('Write in markdown. Paste or drop images to upload them.'),
    EditorView.scrollMargins.of(() => options.margins?.() ?? null),
    EditorView.contentAttributes.of({
      spellcheck: 'true',
      autocorrect: 'on',
      autocapitalize: 'sentences',
      'aria-label': 'Content',
      ...(options.labelledBy ? { 'aria-labelledby': options.labelledBy } : {}),
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) options.onChange(update.state.doc.toString())
      if (update.docChanged || update.selectionSet) options.onCursor?.(update.state)
    }),
  ]
  return new EditorView({ parent: options.parent, state: EditorState.create({ doc: options.doc, extensions }) })
}

/// Brings the cursor into view, as when coming back to the body.
export function revealCursor(view: EditorView) {
  view.focus()
  view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: 'center' }) })
}

/// Puts [text] in place of the whole body, as one step undo can take back.
export function setBody(view: EditorView, text: string) {
  if (view.state.doc.toString() === text) return
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, userEvent: 'input.replace' })
}
