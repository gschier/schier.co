// The post editor (Go's templates/pages/blog/edit.html and frontend/editor),
// as a React page around a CodeMirror body (src/components/editor/
// codemirror.ts). What the old one did, it still does:
// - the title, then the other fields folded away: slug, tags, summary,
//   social image, the date, stage and unlisted, and the newsletter;
// - a markdown body with the keys CodeMirror gave it (Tab, Shift-Tab, Enter
//   keeping the indent), spelling checked, styled as markdown with every
//   mark left in;
// - an image pasted or dropped on the body, or picked with Upload image, is
//   uploaded and its markdown put at the cursor, and one pasted or dropped on
//   the social image field fills it in; an image on a line of its own shows
//   its thumbnail under the line, with Replace;
// - a live preview of the post as its page draws it, with the word count,
//   half a second after typing stops, scrolled to the heading the cursor is
//   under.
// On a wide window the body and the preview are side by side and fill it;
// on an iPad held upright or a phone one shows at a time, with a bar at the
// bottom (riding above the on-screen keyboard) and Other Fields as a sheet.
// Saving keeps you on the page (Cmd or Ctrl-S too); the first save of a new
// post gives the page its /admin/edit/{id} address. Every change is kept in
// the browser until it is saved (src/components/editor/draft.ts). Leaving
// with unsaved changes asks first. Refusals (a taken slug, a post too old to
// send) are shown beside the buttons.

import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type ReactNode } from 'react'
import type { EditorView } from '@codemirror/view'
import { Site, Tags, adminLinks, pageHead } from '#/components/site'
import { clearDraft, draftKey, readDraft, writeDraft, type Draft } from '#/components/editor/draft'
import { Ico } from '#/components/editor/icons'
import {
  deleteFn,
  newsletterStatusFn,
  previewFn,
  publishFn,
  savePostFn,
  sendNewsletterFn,
  setListedFn,
  unpublishFn,
} from '#/lib/adminFns'
import { articleInner } from '#/lib/html'
import type { PostView } from '#/lib/views'
import type { EditorData, EditorPost, NewsletterView, Outcome, Preview, SaveInput } from '#/server/editor'

type HeadContext = Parameters<typeof pageHead>[1]

/// The editor's <title> and meta, kept out of search engines.
export function editorHead(title: string, ctx: HeadContext) {
  const head = pageHead({ title: title ? `Edit ${title}` : 'Edit' }, ctx)
  return { ...head, meta: [...head.meta, { name: 'robots', content: 'noindex' }] }
}

// ---------------------------------------------------------------------------
// The form's fields

type Fields = {
  title: string
  slug: string
  content: string
  tags: string[]
  image: string
  summary: string
  /// As the date input holds it, in UTC: 2026-10-13T09:00. Empty for a new
  /// post, which is dated when it is saved.
  date: string
  stage: string
  unlisted: boolean
}

const EMPTY: Fields = { title: '', slug: '', content: '', tags: [], image: '', summary: '', date: '', stage: '0', unlisted: false }

/// An ISO date as a datetime-local input's value, in UTC.
const toInput = (iso: string) => iso.slice(0, 16)
/// A datetime-local input's value, read as UTC, as ISO 8601.
const fromInput = (value: string) => {
  const date = new Date(`${value}Z`)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

const fieldsOf = (post: EditorPost | null): Fields =>
  post
    ? {
        title: post.title,
        slug: post.slug,
        content: post.content,
        tags: post.tags,
        image: post.image,
        summary: post.summary,
        date: toInput(post.date),
        stage: String(post.stage),
        unlisted: post.unlisted,
      }
    : EMPTY

const same = (a: Fields, b: Fields) => JSON.stringify(a) === JSON.stringify(b)

/// What Save sends. The date goes only when it was changed here, so a draft
/// saved without touching it is dated then, as on the Go site.
function saveInput(fields: Fields, baseline: Fields, id: string | undefined): SaveInput {
  const stage = Number.parseInt(fields.stage, 10)
  return {
    id,
    title: fields.title,
    slug: fields.slug,
    content: fields.content,
    tags: fields.tags,
    image: fields.image,
    summary: fields.summary,
    date: fields.date && fields.date !== baseline.date ? fromInput(fields.date) : undefined,
    stage: Number.isNaN(stage) ? 0 : stage,
    unlisted: fields.unlisted,
  }
}

// ---------------------------------------------------------------------------
// Images

/// The body's module (src/components/editor/codemirror.ts), loaded with the
/// editor.
type Body = typeof import('#/components/editor/codemirror')

const imagesIn = (files: FileList | null | undefined) => [...(files ?? [])].filter((file) => file.type.startsWith('image/'))

/// Uploads [file] (src/routes/api/admin/upload.ts) and returns its /media/ path.
async function upload(file: File, signal?: AbortSignal): Promise<string> {
  const body = new FormData()
  body.append('file', file)
  const res = await fetch('/api/admin/upload', { method: 'POST', body, signal })
  const answer = (await res.json().catch(() => null)) as { url?: string; error?: string } | null
  if (!res.ok || !answer?.url) throw new Error(answer?.error ?? `The upload failed (${res.status})`)
  return answer.url
}

/// What the post page's script does to a post: an image's alt text as a
/// caption below it.
function caption(article: HTMLElement) {
  article.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
    if (!img.alt || img.parentElement?.tagName === 'FIGURE') return
    const figure = document.createElement('figure')
    const text = document.createElement('figcaption')
    text.innerHTML = img.alt
    img.parentNode!.appendChild(figure)
    figure.appendChild(img)
    figure.appendChild(text)
  })
}

/// The preview's headings from the post's markdown, in order (not the
/// title's, which sits in the article's header).
const HEADINGS = ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6'

// ---------------------------------------------------------------------------
// The page

type Message = { kind: 'error' | 'done'; text: string }

const reason = (error: unknown) => (error instanceof Error && error.message ? error.message : 'Something went wrong')

const STATE_LABELS = { draft: 'Draft', published: 'Published', unlisted: 'Unlisted' }

const subscribers = (n: number) => `${n} subscriber${n === 1 ? '' : 's'}`

/// Where one pane is shown at a time (iPad upright and phones).
const ONE_PANE = '(max-width: 999px)'

/// When a kept copy was made, as a person says it.
const keptAt = (at: number) => new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export function Editor({ data }: { data: EditorData }) {
  const [saved, setSaved] = useState<EditorPost | null>(data.post)
  const [baseline, setBaseline] = useState<Fields>(() => fieldsOf(data.post))
  const [fields, setFields] = useState<Fields>(() => fieldsOf(data.post))
  const [offered, setOffered] = useState<string[]>(data.tags)
  const [preview, setPreview] = useState<Preview>(data.preview)
  const [newsletter, setNewsletter] = useState<NewsletterView | null>(data.newsletter)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const [uploading, setUploading] = useState(0)
  const [full, setFull] = useState(false)
  const [view, setView] = useState<'write' | 'preview'>('write')
  const [other, setOther] = useState(false)
  const [onePane, setOnePane] = useState(false)
  const [kept, setKept] = useState<Draft<Fields> | null>(null)
  const [ready, setReady] = useState(false)
  const [testTo, setTestTo] = useState('')
  const [newTag, setNewTag] = useState('')

  const host = useRef<HTMLDivElement>(null)
  const body = useRef<EditorView | null>(null)
  const cm = useRef<Body | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const article = useRef<HTMLElement>(null)
  const replacing = useRef<number | null>(null)
  const replacer = useRef<HTMLInputElement>(null)
  const heading = useRef(-1)
  const unaligned = useRef(false)
  const current = useRef(fields)
  current.current = fields
  const leaving = useRef(false)
  // Nothing is kept in the browser until the copy already there has been
  // looked at, and while it is offered back.
  const holding = useRef(true)

  const dirty = !saved || !same(fields, baseline)
  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => setFields((f) => ({ ...f, [key]: value }))
  const fail = (file: File, error: unknown) => setMessage({ kind: 'error', text: `${file.name}: ${reason(error)}` })

  // The body. Made once the page is in the browser, with CodeMirror loaded
  // then, so the public pages never carry it; the server draws the text
  // alone until then.
  useEffect(() => {
    let editor: EditorView | null = null
    let gone = false
    void import('#/components/editor/codemirror').then((mod) => {
      if (gone || !host.current) return
      cm.current = mod
      editor = mount(mod, host.current)
      body.current = editor
      setReady(true)
    })
    return () => {
      gone = true
      editor?.destroy()
      body.current = null
    }
  }, [])

  function mount(mod: Body, parent: HTMLElement): EditorView {
    const editor: EditorView = mod.createBody({
      doc: current.current.content,
      parent,
      labelledBy: 'l-content',
      // One pane: the app bar above, and the bottom bar (with the keyboard
      // under it) below.
      margins: () => {
        if (!window.matchMedia(ONE_PANE).matches) return null
        const top = document.querySelector('.editor__appbar')?.getBoundingClientRect().bottom ?? 0
        const bar = document.querySelector('.editor__actionbar')?.getBoundingClientRect().top
        return { top: top + 8, bottom: bar === undefined ? 0 : window.innerHeight - bar + 8 }
      },
      onChange: (text) => setFields((f) => (f.content === text ? f : { ...f, content: text })),
      onCursor: (state) => follow(mod.headingAt(state, state.selection.main.head)),
      onFiles: (files, pos) => void mod.uploadImages(editor, files, pos, upload, fail),
      actions: {
        replace: (_, pos) => {
          replacing.current = pos
          replacer.current?.click()
        },
        cancel: mod.cancelUpload,
      },
    })
    return editor
  }

  // One pane or two, as the window is.
  useEffect(() => {
    const query = window.matchMedia(ONE_PANE)
    const read = () => {
      setOnePane(query.matches)
      // Full screen is for two panes; one pane is the page already.
      if (query.matches) setFull(false)
    }
    read()
    query.addEventListener('change', read)
    return () => query.removeEventListener('change', read)
  }, [])

  // The on-screen keyboard's height, so the bottom bar rides above it.
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const root = document.documentElement
    const measure = () => root.style.setProperty('--kb', `${Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop))}px`)
    measure()
    viewport.addEventListener('resize', measure)
    viewport.addEventListener('scroll', measure)
    return () => {
      viewport.removeEventListener('resize', measure)
      viewport.removeEventListener('scroll', measure)
      root.style.removeProperty('--kb')
    }
  }, [])

  // A copy kept in this browser, offered back when it differs from the
  // server's and is newer than the server's last change.
  const key = draftKey(saved?.id)
  useEffect(() => {
    const copy = readDraft<Fields>(draftKey(data.post?.id))
    const fresh = copy && { ...copy, fields: { ...EMPTY, ...copy.fields } }
    if (fresh && !same(fresh.fields, fieldsOf(data.post)) && (!data.post || fresh.at > Date.parse(data.post.updatedAt))) setKept(fresh)
    else holding.current = false
  }, [])

  // Every change is kept until it is saved.
  useEffect(() => {
    if (holding.current) return
    if (same(fields, baseline)) clearDraft(key)
    else writeDraft(key, fields)
  }, [fields, baseline, key, kept])

  function restore() {
    if (!kept) return
    holding.current = false
    setKept(null)
    setFields(kept.fields)
    if (body.current) cm.current?.setBody(body.current, kept.fields.content)
  }

  function discard() {
    holding.current = false
    setKept(null)
  }

  // The live preview, half a second after the body or date last changed.
  const previewed = useRef({ content: fields.content, date: fields.date })
  const asked = useRef(0)
  useEffect(() => {
    if (previewed.current.content === fields.content && previewed.current.date === fields.date) return
    const timer = setTimeout(async () => {
      const ask = ++asked.current
      previewed.current = { content: fields.content, date: fields.date }
      try {
        const shown = await previewFn({ data: { markdown: fields.content, date: fields.date ? fromInput(fields.date) : undefined } })
        if (ask === asked.current) setPreview(shown)
      } catch (error) {
        if (ask === asked.current) setMessage({ kind: 'error', text: `The preview failed: ${reason(error)}` })
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [fields.content, fields.date])

  // The post as its page draws it (src/lib/html.ts), as the Go editor's
  // preview showed it: dated, with the word count, and never a draft.
  const post: PostView = {
    id: saved?.id ?? '',
    slug: fields.slug,
    title: fields.title,
    meta: {
      dateTime: preview.dateTime,
      dateLabel: preview.dateLabel,
      words: preview.words,
      readMinutes: preview.readMinutes,
      published: true,
      votesTotal: 0,
      votesUsers: 0,
      views: 0,
      score: 0,
      fresh7: true,
      fresh30: true,
    },
    html: preview.html,
    tags: fields.tags,
    published: true,
    votesTotal: 0,
    votesUsers: 0,
    outOfDate: null,
    notified: null,
  }
  const articleHtml = articleInner(post, false, '')
  useEffect(() => {
    if (article.current) caption(article.current)
    // A heading typed before the preview had drawn it is gone to now.
    if (unaligned.current) showHeading(false)
  }, [articleHtml])

  /// Scrolls the preview to the heading the cursor is under, or its top.
  /// Until the preview has that heading, it stays where it is and goes there
  /// when the preview is drawn again.
  function showHeading(smooth: boolean) {
    const box = scroller.current
    const page = article.current
    if (!box || !page || box.offsetParent === null) return
    const target = heading.current < 0 ? null : page.querySelectorAll<HTMLElement>(HEADINGS)[heading.current]
    unaligned.current = heading.current >= 0 && !target
    if (unaligned.current) return
    const behavior = smooth ? 'smooth' : 'instant'
    if (window.matchMedia(ONE_PANE).matches) {
      // One pane: the page scrolls, under the app bar.
      const bar = document.querySelector<HTMLElement>('.editor__appbar')?.offsetHeight ?? 0
      window.scrollTo({ top: target ? target.getBoundingClientRect().top + window.scrollY - bar - 12 : 0, behavior })
    } else {
      box.scrollTo({ top: target ? target.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 12 : 0, behavior })
    }
  }

  /// The preview follows the cursor from heading to heading.
  function follow(index: number) {
    if (index === heading.current) return
    heading.current = index
    showHeading(true)
  }

  // Switching between Write and Preview on one pane keeps the place.
  useEffect(() => {
    if (!onePane) return
    if (view === 'preview') showHeading(false)
    else if (body.current) cm.current?.revealCursor(body.current)
  }, [view])

  // Unsaved changes are not lost by leaving the page.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (!dirty || leaving.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // Full screen hides the page behind it, as does the sheet.
  const covered = full || (other && onePane)
  useEffect(() => {
    if (!covered) return
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
    }
  }, [covered])
  useEffect(() => {
    if (full) body.current?.focus()
  }, [full])

  // Cmd or Ctrl-S saves, wherever the cursor is; Escape leaves full screen
  // and closes the sheet.
  const saveKey = useRef<() => void>(() => {})
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveKey.current()
      } else if (e.key === 'Escape') {
        setFull(false)
        if (window.matchMedia(ONE_PANE).matches) setOther(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /// Takes the post as the server has it. The form follows unless it was
  /// edited while the server was answering, which then stays unsaved.
  function accept(post: EditorPost, sent?: Fields) {
    const fresh = fieldsOf(post)
    setSaved(post)
    setBaseline(fresh)
    if (!sent || same(current.current, sent)) {
      setFields(fresh)
      if (body.current) cm.current?.setBody(body.current, fresh.content)
    }
    setOffered((tags) => [...new Set([...tags, ...post.tags])])
    if (!saved || saved.id !== post.id) {
      // A new post has its own address now, and its own kept copy. The page
      // stays as it is, so the cursor and what is being typed are not
      // disturbed.
      clearDraft(draftKey(undefined))
      // The browser's own replaceState: the router patches the one on
      // window.history to navigate, which would make the editor anew and
      // lose the body's undo history and any upload under way.
      History.prototype.replaceState.call(window.history, window.history.state, '', adminLinks.edit(post.id))
    }
  }

  /// Saves what is in the form, if anything changed. Null when refused.
  async function persist(): Promise<EditorPost | null> {
    if (saved && same(current.current, baseline)) return saved
    const sent = current.current
    const out = await savePostFn({ data: saveInput(sent, baseline, saved?.id) })
    if (!out.ok) {
      setMessage({ kind: 'error', text: out.error })
      return null
    }
    accept(out.value, sent)
    return out.value
  }

  /// Saves, then does [action] to the saved post and says [done].
  async function run(name: string, action: ((post: EditorPost) => Promise<string | null>) | null, done: string) {
    if (busy) return
    setBusy(name)
    setMessage(null)
    try {
      const post = await persist()
      if (!post) return
      const said = action ? await action(post) : done
      if (said) setMessage({ kind: 'done', text: said })
    } catch (error) {
      setMessage({ kind: 'error', text: reason(error) })
    } finally {
      setBusy(null)
    }
  }

  /// [out]'s value, or null with its refusal shown.
  function check<T>(out: Outcome<T>): T | null {
    if (out.ok) return out.value
    setMessage({ kind: 'error', text: out.error })
    return null
  }

  /// An action's outcome: the post taken, or its refusal shown.
  async function apply(out: Outcome<EditorPost>, done: string): Promise<string | null> {
    const post = check(out)
    if (!post) return null
    accept(post)
    setNewsletter(await newsletterStatusFn({ data: post.id }))
    return done
  }

  // Not while a kept copy waits for Restore or Discard.
  const save = () => (kept ? undefined : run('save', null, 'Saved'))
  saveKey.current = save

  const publish = () =>
    run('publish', async (post) => (post.published ? apply(await unpublishFn({ data: post.id }), 'Unpublished: back to a draft') : apply(await publishFn({ data: post.id }), 'Published and dated now')), '')

  const toggleListed = () =>
    run('list', async (post) => apply(await setListedFn({ data: { id: post.id, unlisted: !post.unlisted } }), post.unlisted ? 'Listed' : 'Unlisted'), '')

  async function remove() {
    if (!saved || busy) return
    if (!window.confirm(`Delete "${saved.title || saved.slug}" for good? This cannot be undone.`)) return
    setBusy('delete')
    setMessage(null)
    try {
      const out = await deleteFn({ data: saved.id })
      if (!out.ok) return setMessage({ kind: 'error', text: out.error })
      leaving.current = true
      clearDraft(draftKey(saved.id))
      window.location.href = adminLinks.drafts
    } catch (error) {
      setMessage({ kind: 'error', text: reason(error) })
    } finally {
      setBusy(null)
    }
  }

  const testSend = () =>
    run(
      'test',
      async (post) => {
        const sent = check(await sendNewsletterFn({ data: { id: post.id, to: testTo } }))
        if (!sent) return null
        setNewsletter(sent.newsletter)
        return sent.failed ? `The test email to ${testTo} failed (see the log)` : `Test email sent to ${testTo}`
      },
      '',
    )

  const send = () =>
    run(
      'send',
      async (post) => {
        const dry = check(await sendNewsletterFn({ data: { id: post.id, dryRun: true } }))
        if (!dry) return null
        if (!window.confirm(`Email "${post.title}" to ${subscribers(dry.recipients)}? A post goes out once.`)) return null
        const sent = check(await sendNewsletterFn({ data: { id: post.id } }))
        if (!sent) return null
        setNewsletter(sent.newsletter)
        return `Sent to ${subscribers(sent.recipients)}${sent.failed ? `; ${sent.failed} failed (see the log)` : ''}`
      },
      '',
    )

  // Images picked with Upload image go where the cursor is.
  function uploadToBody(files: File[]) {
    const editor = body.current
    if (!editor || !cm.current || !files.length) return
    void cm.current.uploadImages(editor, files, editor.state.selection.main.head, upload, fail)
  }

  function replaceWith(files: File[]) {
    const editor = body.current
    const pos = replacing.current
    replacing.current = null
    if (!editor || !cm.current || pos === null || !files[0]) return
    void cm.current.replaceImage(editor, pos, files[0], upload, fail)
  }

  async function uploadToImage(files: File[]) {
    const file = files[0]
    if (!file) return
    setUploading((n) => n + 1)
    try {
      set('image', await upload(file))
    } catch (error) {
      fail(file, error)
    } finally {
      setUploading((n) => n - 1)
    }
  }

  const imageEvents = (to: (files: File[]) => void) => ({
    onPaste: (e: ClipboardEvent) => {
      const files = imagesIn(e.clipboardData?.files)
      if (!files.length) return
      e.preventDefault()
      to(files)
    },
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    },
    onDrop: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return
      const files = imagesIn(e.dataTransfer.files)
      e.preventDefault()
      to(files)
    },
  })

  function toggleTag(tag: string) {
    set('tags', fields.tags.includes(tag) ? fields.tags.filter((t) => t !== tag) : [...fields.tags, tag])
  }

  function addTags(text: string) {
    const tags = text
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
    if (!tags.length) return
    setOffered((o) => [...new Set([...o, ...tags])])
    setFields((f) => ({ ...f, tags: [...new Set([...f.tags, ...tags])] }))
    setNewTag('')
  }

  const state = !saved ? null : !saved.published ? 'draft' : saved.unlisted ? 'unlisted' : 'published'
  const pill = state && <span className={`admin-state admin-state--${state}`}>{STATE_LABELS[state]}</span>
  const tagsShown = [...new Set([...offered, ...fields.tags])]
  const can = !busy
  const said = [fields.slug, fields.tags.join(', '), fields.stage !== '0' && `stage ${fields.stage}`].filter(Boolean).join(' · ')
  const clean = !!saved && !dirty

  const pickImages = (e: React.ChangeEvent<HTMLInputElement>, to: (files: File[]) => void) => {
    const files = imagesIn(e.target.files)
    e.target.value = ''
    to(files)
  }

  const saveButton = (
    <button type="submit" className={`btn editor__save${clean ? ' editor__save--clean' : ''}`} disabled={!can}>
      {clean && busy !== 'save' && <Ico name="check" />}
      {busy === 'save' ? 'Saving…' : !saved ? 'Create' : dirty ? (saved.published ? 'Save' : 'Save Draft') : 'Saved'}
    </button>
  )
  const publishButton = (
    <button type="button" className="btn btn--gray" disabled={!can} onClick={publish}>
      {saved?.published ? 'Unpublish' : 'Publish'}
    </button>
  )
  const listButton = saved && (
    <button type="button" className="btn btn--gray" disabled={!can} onClick={toggleListed}>
      {saved.unlisted ? 'List' : 'Unlist'}
    </button>
  )
  const viewLink = saved && (
    <a className="btn btn--gray" href={`/blog/${saved.slug}`} target="_blank" rel="noopener">
      View
    </a>
  )
  const deleteButton = saved && (
    <button type="button" className="btn btn--danger" disabled={!can} onClick={remove}>
      Delete
    </button>
  )

  return (
    <Site>
      <form
        className={`editor${full ? ' editor--full' : ''}${other ? ' editor--other' : ''}`}
        data-view={view}
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        {/* One pane: the way back and the post's state, at the top. */}
        <div className="editor__appbar">
          <div className="editor__appbar-in">
            <a href={adminLinks.drafts} className="editor__back">
              <Ico name="back" />
              Posts
            </a>
            {pill}
          </div>
        </div>

        <div className="editor__title">
          <div className="editor__title-top">
            <label htmlFor="i-title">Title</label>
            {pill}
            <a href={adminLinks.drafts} className="editor__back">
              <Ico name="back" />
              All posts
            </a>
          </div>
          <input id="i-title" name="title" type="text" value={fields.title} placeholder="My Blog Post" autoFocus={!saved} readOnly={!!kept} onChange={(e) => set('title', e.target.value)} />
        </div>

        {kept && (
          <div className="notice notice--info editor__kept" role="status">
            <p>This browser kept changes from {keptAt(kept.at)} that were not saved. Restore or discard them to go on writing.</p>
            <div>
              <button type="button" className="btn btn--sm" onClick={restore}>
                Restore
              </button>
              <button type="button" className="btn btn--sm btn--gray" onClick={discard}>
                Discard
              </button>
            </div>
          </div>
        )}

        {/* Nothing can be changed while a kept copy waits for Restore or
            Discard, so no change goes unkept. */}
        <details className="editor__other" open={other} inert={!!kept} onToggle={(e) => setOther(e.currentTarget.open)}>
          <summary>
            <Ico name="chevron" />
            <span className="editor__other-name">Other Fields</span>
            <span className="editor__other-said">{said}</span>
          </summary>
          <div className="editor__scrim" onClick={() => setOther(false)} />
          <div className="editor__sheet" role={onePane ? 'dialog' : undefined} aria-label={onePane ? 'Other Fields' : undefined}>
            <div className="editor__sheet-head">
              <span className="editor__grabber" />
              <h2>Other Fields</h2>
              <button type="button" onClick={() => setOther(false)}>
                Done
              </button>
            </div>
            <div className="editor__fields">
              <div className="form-row f-slug">
                <label htmlFor="i-slug">Slug</label>
                <input
                  id="i-slug"
                  name="slug"
                  type="text"
                  value={fields.slug}
                  placeholder="Made from the title when empty"
                  readOnly={!!saved?.published}
                  title={saved?.published ? 'A published post keeps its slug; unpublish it to change it' : undefined}
                  onChange={(e) => set('slug', e.target.value)}
                />
                {saved?.published && <small className="editor__hint">Published, so the slug stays; unpublish to change it.</small>}
              </div>
              <div className="form-row f-summary">
                <label htmlFor="i-summary">Summary</label>
                <input id="i-summary" name="summary" type="text" value={fields.summary} placeholder="The opening paragraph when empty" onChange={(e) => set('summary', e.target.value)} />
              </div>
              <div className="form-row f-tags">
                <label>Tags</label>
                <div className="checkbox-buttons">
                  {tagsShown.map((tag) => (
                    <div key={tag} className="checkbox-buttons__button">
                      <input type="checkbox" id={`tag-${tag}`} name="tags" value={tag} checked={fields.tags.includes(tag)} onChange={() => toggleTag(tag)} />
                      <label htmlFor={`tag-${tag}`}>{tag}</label>
                    </div>
                  ))}
                </div>
                <input
                  type="text"
                  className="editor__new-tag"
                  aria-label="New tags"
                  value={newTag}
                  placeholder="Another tag, then Enter"
                  onChange={(e) => (e.target.value.endsWith(',') ? addTags(e.target.value) : setNewTag(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addTags(newTag)
                    }
                  }}
                  onBlur={() => addTags(newTag)}
                />
              </div>
              <div className="form-row f-image">
                <label htmlFor="i-image">Social Image</label>
                <div className="editor__image-field">
                  {fields.image && <img className="editor__image-thumb" src={fields.image} alt="" />}
                  <input
                    id="i-image"
                    name="image"
                    type="text"
                    value={fields.image}
                    placeholder="A URL, or paste or drop an image here"
                    onChange={(e) => set('image', e.target.value)}
                    {...imageEvents(uploadToImage)}
                  />
                </div>
                {uploading > 0 && <small className="editor__hint">Uploading&hellip;</small>}
              </div>
              <div className="editor__pair">
                <div className="form-row f-date">
                  <label htmlFor="i-date">Date, UTC</label>
                  <input id="i-date" name="date" type="datetime-local" value={fields.date} onChange={(e) => set('date', e.target.value)} />
                  <small className="editor__hint">{saved?.published ? 'When it was published.' : 'A draft is dated when saved; publishing dates it now.'}</small>
                </div>
                <div className="form-row f-stage">
                  <label htmlFor="i-stage">Stage</label>
                  <input id="i-stage" name="stage" type="number" step={1} value={fields.stage} onChange={(e) => set('stage', e.target.value)} />
                  <small className="editor__hint">How far along a draft is; the list puts the furthest first.</small>
                </div>
              </div>
              <div className="form-row f-unlisted">
                <label>Listing</label>
                <div className="checkbox-buttons">
                  <div className="checkbox-buttons__button">
                    <input type="checkbox" id="i-unlisted" name="unlisted" checked={fields.unlisted} onChange={(e) => set('unlisted', e.target.checked)} />
                    <label htmlFor="i-unlisted">Unlisted</label>
                  </div>
                </div>
                <small className="editor__hint">At its address, but left out of lists, feeds and search.</small>
              </div>
              {saved && (
                <Newsletter view={newsletter} published={saved.published}>
                  <div className="button-input">
                    <input type="email" aria-label="Test address" placeholder="A subscriber's address" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                    <button type="button" className="btn" disabled={!can || !saved.published || !testTo.trim()} onClick={testSend}>
                      Test send
                    </button>
                  </div>
                  <button type="button" className="btn" disabled={!can || !newsletter?.canSend} onClick={send}>
                    Send to {subscribers(newsletter?.subscribers ?? 0)}
                  </button>
                </Newsletter>
              )}
            </div>
            {saved && (
              <div className="editor__sheet-actions">
                {viewLink}
                {listButton}
                {deleteButton}
              </div>
            )}
          </div>
        </details>

        <div className="editor__panes" inert={!!kept}>
          <section className="editor__pane editor__pane--write">
            <div className="editor__bar">
              <span id="l-content" className="editor__label">
                Content
              </span>
              <span className="editor__count">
                {preview.words} words &middot; {preview.readMinutes} min read
              </span>
              <label className="btn btn--sm btn--gray editor__upload" title="Upload image">
                <Ico name="image" />
                <span className="editor__btn-label">Upload image</span>
                <input type="file" accept="image/*" multiple aria-label="Upload image" onChange={(e) => pickImages(e, uploadToBody)} />
              </label>
              <button type="button" className="btn btn--sm btn--gray editor__full" aria-label={full ? 'Exit full screen' : 'Full screen'} title={full ? 'Exit full screen' : 'Full screen'} onClick={() => setFull(!full)}>
                <Ico name={full ? 'shrink' : 'expand'} />
                <span className="editor__btn-label">{full ? 'Exit full screen' : 'Full screen'}</span>
              </button>
            </div>
            <div className="editor__body">
              <div ref={host} className="editor__cm" />
              {!ready && <pre className="editor__loading">{fields.content}</pre>}
            </div>
            <input ref={replacer} type="file" accept="image/*" hidden onChange={(e) => pickImages(e, replaceWith)} />

            <div className="editor__foot">
              {message && (
                <div className={`notice notice--${message.kind === 'error' ? 'danger' : 'info'} editor__message`} role={message.kind === 'error' ? 'alert' : 'status'}>
                  <p>{message.text}</p>
                  <button type="button" className="editor__message-close" aria-label="Close" onClick={() => setMessage(null)}>
                    &times;
                  </button>
                </div>
              )}
              <div className="editor__actions">
                <div>
                  {viewLink}
                  {deleteButton}
                </div>
                <div>
                  {listButton}
                  {publishButton}
                  {saveButton}
                </div>
              </div>
            </div>
          </section>

          <section className="editor__pane editor__pane--preview">
            <div className="editor__bar">
              <span className="editor__label">Preview</span>
              <span className="editor__count editor__count--end">Follows the cursor</span>
            </div>
            <div ref={scroller} className="editor__preview">
              <article ref={article} className="content blog-post" dangerouslySetInnerHTML={{ __html: articleHtml }} />
              <Tags tags={fields.tags} />
            </div>
          </section>
        </div>

        {/* One pane: Write or Preview, an image, Publish and Save, at the
            thumb and above the keyboard. */}
        <div className="editor__actionbar" inert={!!kept}>
          <div className="editor__actionbar-in">
            <button type="button" className="editor__icon-btn" onClick={() => setView(view === 'write' ? 'preview' : 'write')}>
              <Ico name={view === 'write' ? 'eye' : 'pencil'} />
              {view === 'write' ? 'Preview' : 'Write'}
            </button>
            <label className="editor__icon-btn" title="Upload image">
              <Ico name="image" />
              <span className="editor__sr">Upload image</span>
              <input type="file" accept="image/*" multiple onChange={(e) => pickImages(e, uploadToBody)} />
            </label>
            <span className="editor__spacer" />
            {publishButton}
            {saveButton}
          </div>
        </div>
      </form>
    </Site>
  )
}

/// Whether the post can go to the newsletter, and the buttons that send it.
/// A test send can go to one subscriber whenever the post is new enough,
/// even after the real one.
function Newsletter({ view, published, children }: { view: NewsletterView | null; published: boolean; children: ReactNode }) {
  const status = !view
    ? null
    : view.sent
      ? `Sent ${new Date(view.sent.at).toUTCString().replace(/ GMT$/, ' UTC')} to ${subscribers(view.sent.recipients)}.`
      : view.canSend
        ? `Ready to send to ${subscribers(view.subscribers)}.`
        : !published
          ? 'Publish the post to send it.'
          : 'Too old to send: only a post published in the last day goes out.'
  return (
    <div className="editor__newsletter">
      <label>Newsletter</label>
      <p className="editor__hint">{status}</p>
      {published && <div className="editor__send">{children}</div>}
    </div>
  )
}
