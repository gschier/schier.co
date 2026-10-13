// The post editor (Go's templates/pages/blog/edit.html and frontend/editor),
// as a plain React page. What the old one did, it still does:
// - the title, then the other fields folded away: slug, tags, summary,
//   social image, and here also the date, stage and unlisted;
// - a markdown body with the keys CodeMirror gave it: Tab indents (a tab
//   with nothing selected, two spaces a line with a selection), Shift-Tab
//   takes it back, Enter keeps the line's indent; spelling checked;
// - an image pasted or dropped on the body is uploaded and its markdown put
//   at the cursor, and one pasted or dropped on the social image field fills
//   it in;
// - a live preview of the post as its page draws it, with the word count,
//   half a second after typing stops, below the form or beside the body in
//   full screen.
// Saving keeps you on the page (Cmd or Ctrl-S too); the first save of a new
// post gives the page its /admin/edit/{id} address. Leaving with unsaved
// changes asks first. Refusals (a taken slug, a post too old to send) are
// shown beside the buttons.

import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Site, Tags, adminLinks, pageHead } from '#/components/site'
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
// The body: inserting text as typing does, so undo still works

/// Puts [text] in place of the selection, through the browser's own editing
/// so Cmd-Z takes it back, and so React hears of it as typing.
function insertText(el: HTMLTextAreaElement, text: string) {
  el.focus()
  if (document.execCommand?.('insertText', false, text)) return
  el.setRangeText(text, el.selectionStart, el.selectionEnd, 'end')
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

/// CodeMirror's keys, as the old editor had them.
function onBodyKey(e: KeyboardEvent<HTMLTextAreaElement>) {
  const el = e.currentTarget
  const { selectionStart: start, selectionEnd: end, value } = el
  if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault()
    if (!e.shiftKey && start === end) return insertText(el, '\t')
    // The lines the selection touches, indented or taken back.
    const from = value.lastIndexOf('\n', start - 1) + 1
    const last = end > start && value[end - 1] === '\n' ? end - 1 : end
    const newline = value.indexOf('\n', last)
    const to = newline < 0 ? value.length : newline
    const lines = value.slice(from, to).split('\n')
    const changed = lines.map((line) => (e.shiftKey ? line.replace(/^( {1,2}|\t)/, '') : `  ${line}`)).join('\n')
    if (changed === value.slice(from, to)) return
    el.setSelectionRange(from, to)
    insertText(el, changed)
    el.setSelectionRange(from, from + changed.length)
    return
  }
  if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && !e.nativeEvent.isComposing) {
    const from = value.lastIndexOf('\n', start - 1) + 1
    const indent = /^[ \t]*/.exec(value.slice(from, start))![0]
    if (indent) {
      e.preventDefault()
      insertText(el, `\n${indent}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Images

const imagesIn = (files: FileList | null | undefined) => [...(files ?? [])].filter((f) => f.type.startsWith('image/'))

/// Uploads [file] (src/routes/api/admin/upload.ts) and returns its /media/ path.
async function upload(file: File): Promise<string> {
  const body = new FormData()
  body.append('file', file)
  const res = await fetch('/api/admin/upload', { method: 'POST', body })
  const answer = (await res.json().catch(() => null)) as { url?: string; error?: string } | null
  if (!res.ok || !answer?.url) throw new Error(answer?.error ?? `The upload failed (${res.status})`)
  return answer.url
}

const markdownImage = (url: string, name: string) => `![${name}](${url})`

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

// ---------------------------------------------------------------------------
// The page

type Message = { kind: 'error' | 'done'; text: string }

const reason = (error: unknown) => (error instanceof Error && error.message ? error.message : 'Something went wrong')

const STATE_LABELS = { draft: 'Draft', published: 'Published', unlisted: 'Unlisted' }

const subscribers = (n: number) => `${n} subscriber${n === 1 ? '' : 's'}`

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
  const [testTo, setTestTo] = useState('')
  const [newTag, setNewTag] = useState('')

  const body = useRef<HTMLTextAreaElement>(null)
  const article = useRef<HTMLElement>(null)
  const current = useRef(fields)
  current.current = fields
  const leaving = useRef(false)

  const dirty = !saved || !same(fields, baseline)
  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => setFields((f) => ({ ...f, [key]: value }))

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
  const view: PostView = {
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
  const articleHtml = articleInner(view, false, '')
  useEffect(() => {
    if (article.current) caption(article.current)
  }, [articleHtml])

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

  // Full screen hides the page behind it, as Go's did.
  useEffect(() => {
    if (!full) return
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    body.current?.focus()
    return () => {
      document.body.style.overflow = overflow
    }
  }, [full])

  // Cmd or Ctrl-S saves, wherever the cursor is; Escape leaves full screen.
  const saveKey = useRef<() => void>(() => {})
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveKey.current()
      } else if (e.key === 'Escape') {
        setFull(false)
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
    if (!sent || same(current.current, sent)) setFields(fresh)
    setOffered((tags) => [...new Set([...tags, ...post.tags])])
    if (!saved || saved.id !== post.id) {
      // A new post has its own address now. The page stays as it is, so
      // the cursor and what is being typed are not disturbed.
      window.history.replaceState(window.history.state, '', adminLinks.edit(post.id))
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

  const save = () => run('save', null, 'Saved')
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

  // Images on the body: uploaded, and their markdown put at the cursor.
  async function uploadToBody(files: File[]) {
    const el = body.current
    if (!el || !files.length) return
    setUploading((n) => n + files.length)
    for (const file of files) {
      try {
        const url = await upload(file)
        insertText(el, `\n${markdownImage(url, file.name)}\n`)
      } catch (error) {
        setMessage({ kind: 'error', text: `${file.name}: ${reason(error)}` })
      } finally {
        setUploading((n) => n - 1)
      }
    }
  }

  async function uploadToImage(files: File[]) {
    const file = files[0]
    if (!file) return
    setUploading((n) => n + 1)
    try {
      set('image', await upload(file))
    } catch (error) {
      setMessage({ kind: 'error', text: `${file.name}: ${reason(error)}` })
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
  const tagsShown = [...new Set([...offered, ...fields.tags])]
  const can = !busy

  return (
    <Site>
      <div className={`container editor${full ? ' editor--full' : ''}`}>
        <div className="editor__head">
          <h1>{fields.title.trim() || (saved ? 'Untitled' : 'New Post')}</h1>
          {state && <span className={`admin-state admin-state--${state}`}>{STATE_LABELS[state]}</span>}
          <a href={adminLinks.drafts} className="editor__back">
            All posts
          </a>
        </div>

        <form
          className="editor__form"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <div className="form-row">
            <label htmlFor="i-title">Title</label>
            <input id="i-title" name="title" type="text" value={fields.title} placeholder="My Blog Post" autoFocus={!saved} onChange={(e) => set('title', e.target.value)} />
          </div>

          <details className="form-row editor__other">
            <summary>Other Fields</summary>
            <div className="form-row">
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
            <div className="form-row">
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
            <div className="form-row">
              <label htmlFor="i-summary">Summary</label>
              <input id="i-summary" name="summary" type="text" value={fields.summary} placeholder="The opening paragraph when empty" onChange={(e) => set('summary', e.target.value)} />
            </div>
            <div className="form-row">
              <label htmlFor="i-image">Social Image</label>
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
            <div className="editor__pair">
              <div className="form-row">
                <label htmlFor="i-date">Date, UTC</label>
                <input id="i-date" name="date" type="datetime-local" value={fields.date} onChange={(e) => set('date', e.target.value)} />
                <small className="editor__hint">{saved?.published ? 'When it was published.' : 'A draft is dated when saved; publishing dates it now.'}</small>
              </div>
              <div className="form-row">
                <label htmlFor="i-stage">Stage</label>
                <input id="i-stage" name="stage" type="number" step={1} value={fields.stage} onChange={(e) => set('stage', e.target.value)} />
                <small className="editor__hint">How far along a draft is; the list puts the furthest first.</small>
              </div>
            </div>
            <div className="form-row checkbox-buttons">
              <div className="checkbox-buttons__button">
                <input type="checkbox" id="i-unlisted" name="unlisted" checked={fields.unlisted} onChange={(e) => set('unlisted', e.target.checked)} />
                <label htmlFor="i-unlisted">Unlisted</label>
              </div>
              <small className="editor__hint">At its address, but left out of lists, feeds and search.</small>
            </div>
          </details>

          <div className="editor__panes">
            <div className="editor__edit">
              <div className="editor__bar">
                <label htmlFor="i-content">Content</label>
                <span className="editor__count">
                  {preview.words} words &middot; {preview.readMinutes} min read
                </span>
                {uploading > 0 && <span className="editor__count">Uploading&hellip;</span>}
                <label className="btn btn--sm btn--gray editor__upload">
                  Upload image
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      const files = imagesIn(e.target.files)
                      e.target.value = ''
                      void uploadToBody(files)
                    }}
                  />
                </label>
                <button type="button" className="btn btn--sm btn--gray" onClick={() => setFull(!full)}>
                  {full ? 'Exit full screen' : 'Full screen'}
                </button>
              </div>
              <textarea
                ref={body}
                id="i-content"
                name="content"
                rows={20}
                spellCheck
                value={fields.content}
                placeholder="Write in markdown. Paste or drop images to upload them."
                onChange={(e) => set('content', e.target.value)}
                onKeyDown={onBodyKey}
                {...imageEvents(uploadToBody)}
              />

              {message && (
                <p className={`notice notice--${message.kind === 'error' ? 'danger' : 'info'} editor__message`} role={message.kind === 'error' ? 'alert' : 'status'}>
                  {message.text}
                </p>
              )}

              <div className="form-actions editor__actions">
                <div>
                  {saved && (
                    <>
                      <a className="btn btn--gray" href={`/blog/${saved.slug}`} target="_blank" rel="noopener">
                        View
                      </a>{' '}
                      <button type="button" className="btn btn--danger" disabled={!can} onClick={remove}>
                        Delete
                      </button>
                    </>
                  )}
                </div>
                <div>
                  {saved && (
                    <>
                      <button type="button" className="btn btn--gray" disabled={!can} onClick={toggleListed}>
                        {saved.unlisted ? 'List' : 'Unlist'}
                      </button>{' '}
                    </>
                  )}
                  <button type="button" className="btn btn--gray" disabled={!can} onClick={publish}>
                    {saved?.published ? 'Unpublish' : 'Publish'}
                  </button>{' '}
                  <button type="submit" className="btn" disabled={!can}>
                    {busy === 'save' ? 'Saving…' : !saved ? 'Create' : dirty ? (saved.published ? 'Save' : 'Save Draft') : 'Saved'}
                  </button>
                </div>
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

            <div className="editor__preview">
              <h2 className="editor__preview-title">Preview</h2>
              <article ref={article} className="content blog-post" dangerouslySetInnerHTML={{ __html: articleHtml }} />
              <Tags tags={fields.tags} />
            </div>
          </div>
        </form>
      </div>
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
