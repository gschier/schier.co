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
//   half done.

import { EditorSelection, EditorState, Facet, Prec, StateEffect, StateField, type ChangeSpec, type Extension } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType, highlightActiveLine, keymap, placeholder, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language'
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
  replace: boolean
}

const addUpload = StateEffect.define<Upload>()
const endUpload = StateEffect.define<number>()

const uploads = StateField.define<Upload[]>({
  create: () => [],
  update(list, tr) {
    let next = tr.docChanged ? list.map((u) => ({ ...u, pos: tr.changes.mapPos(u.pos, u.replace ? -1 : 1) })) : list
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

/// `![alt](url)` or `![alt](url "title")`, alone on its line.
const IMAGE_LINE = /^\s*!\[([^\]]*)\]\(([^\s)]+)(?:\s+"[^"]*")?\)\s*$/
/// The part of an image line before its URL, and the URL.
const IMAGE_URL = /^(\s*!\[[^\]]*\]\()([^\s)]+)/

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
    const replacing = pending.find((u) => u.replace && state.doc.lineAt(u.pos).number === n) ?? null
    ranges.push(Decoration.widget({ widget: new ImageWidget(image[1]!, image[2]!, replacing), block: true, side: 1 }).range(line.to))
  }
  for (const upload of pending) {
    if (!upload.replace) ranges.push(Decoration.widget({ widget: new PendingWidget(upload), block: true, side: 1 }).range(state.doc.lineAt(upload.pos).to))
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

async function run(view: EditorView, file: File, pos: number, replace: boolean, upload: Uploader, failed: Failure, done: (url: string, at: Upload) => void) {
  const id = ++uploadIds
  const src = URL.createObjectURL(file)
  const controller = new AbortController()
  controllers.set(id, controller)
  view.dispatch({ effects: addUpload.of({ id, pos, name: file.name, src, replace }) })
  const current = () => view.state.field(uploads, false)?.find((u) => u.id === id)
  try {
    const url = await upload(file, controller.signal)
    const at = current()
    if (at) done(url, at)
  } catch (error) {
    if (!controller.signal.aborted) failed(file, error)
  } finally {
    controllers.delete(id)
    // The editor may be gone by now, with the page.
    if (current()) view.dispatch({ effects: endUpload.of(id) })
    URL.revokeObjectURL(src)
  }
}

/// Uploads [files] one after another, each drawn at [pos] while it goes,
/// then its markdown put there on a line of its own.
export async function uploadImages(view: EditorView, files: File[], pos: number, upload: Uploader, failed: Failure) {
  for (const file of files) {
    await run(view, file, pos, false, upload, failed, (url, at) => {
      const { state } = view
      const line = state.doc.lineAt(at.pos)
      const insert = `${at.pos === line.from ? '' : '\n'}![${file.name}](${url})\n`
      const main = state.selection.main
      view.dispatch({
        changes: { from: at.pos, insert },
        effects: endUpload.of(at.id),
        // The cursor follows only if it was still where the image went.
        selection: main.empty && main.head === at.pos ? EditorSelection.cursor(at.pos + insert.length) : undefined,
        userEvent: 'input.paste',
      })
    })
  }
}

/// Uploads [file] in place of the image on the line starting at [pos], and
/// rewrites that image's URL.
export function replaceImage(view: EditorView, pos: number, file: File, upload: Uploader, failed: Failure) {
  return run(view, file, pos, true, upload, failed, (url, at) => {
    const line = view.state.doc.lineAt(at.pos)
    const image = IMAGE_URL.exec(line.text)
    if (!image) return failed(file, new Error('The image line changed while it uploaded'))
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
// The headings, for the preview to follow the cursor

/// How many ATX headings (outside code fences) start at or before [pos]'s
/// line, less one: the index of the heading the cursor is under, or -1.
export function headingAt(state: EditorState, pos: number): number {
  const last = state.doc.lineAt(pos).number
  let count = -1
  let fence: string | null = null
  for (let n = 1; n <= last; n++) {
    const text = state.doc.line(n).text
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(text)?.[1]
    if (marker) {
      if (fence === null) fence = marker
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null
    } else if (fence === null && /^ {0,3}#{1,6}(\s|$)/.test(text)) count++
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

/// Puts [text] in place of the whole body, as one step undo can take back.
export function setBody(view: EditorView, text: string) {
  if (view.state.doc.toString() === text) return
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, userEvent: 'input.replace' })
}
