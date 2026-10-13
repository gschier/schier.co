// The admin's pages on the server: the list of drafts and posts at /admin,
// and what the editor at /admin/new and /admin/edit/{id} asks for. Each is a
// plain function over the post actions (src/server/postActions.ts) and the
// newsletter (src/server/newsletter.ts); src/lib/adminFns.ts makes them the
// server functions the pages call.
//
// Every one checks for a signed-in session first (src/server/auth.ts). A
// page's data is null without one, so the page is the site's 404; an action
// throws, so its server function answers an error. A refusal (a taken slug,
// a post too old to send) comes back as { ok: false, error } for the editor
// to show beside its buttons; anything else is a fault and is thrown.

import { z } from 'zod'
import type { BlogPost } from '#/generated/prisma/client'
import { isAdmin } from '#/server/admin'
import { db } from '#/server/db'
import { MAX_POST_AGE_MS, sendPost, sendStatus } from '#/server/newsletter'
import {
  createPost,
  deletePost,
  findPost,
  getPost,
  isRefusal,
  listPosts,
  PostActionError,
  publishPost,
  renderPreview,
  setUnlisted,
  unpublishPost,
  updatePost,
  type PostSummary,
} from '#/server/postActions'
import { readTime, tagCounts, wordCount } from '#/server/posts'
import { goTime, isoformat } from '#/server/views'

/// Thrown by an action asked for without a signed-in session. It says no more
/// than a 404 would.
export class NotAdmin extends Error {
  constructor() {
    super('Not found')
    this.name = 'NotAdmin'
  }
}

export async function requireAdmin() {
  if (!(await isAdmin())) throw new NotAdmin()
}

/// What an action gives the editor: its value, or a refusal's message.
export type Outcome<T> = { ok: true; value: T } | { ok: false; error: string }

async function attempt<T>(action: () => Promise<T>): Promise<Outcome<T>> {
  await requireAdmin()
  try {
    return { ok: true, value: await action() }
  } catch (error) {
    if (isRefusal(error)) return { ok: false, error: error.message }
    throw error
  }
}

// ---------------------------------------------------------------------------
// The list

export type PostState = 'draft' | 'published' | 'unlisted'

export type ListRow = {
  id: string
  slug: string
  title: string
  /// ISO 8601.
  date: string
  state: PostState
  views: number
  stage: number
}

const stateOf = (post: Pick<BlogPost, 'published' | 'unlisted'>): PostState => (!post.published ? 'draft' : post.unlisted ? 'unlisted' : 'published')

const row = (post: PostSummary): ListRow => ({
  id: post.id,
  slug: post.slug,
  title: post.title,
  date: post.date.toISOString(),
  state: stateOf(post),
  views: post.views,
  stage: post.stage,
})

/// Drafts, furthest along and then last edited first, as the Go site's
/// drafts page had them; then every published post, newest first. Null
/// without a signed-in session.
export async function adminList(): Promise<{ drafts: ListRow[]; posts: ListRow[] } | null> {
  if (!(await isAdmin())) return null
  const [drafts, posts] = await Promise.all([listPosts({ drafts: 'only', limit: 500 }), listPosts({ drafts: 'exclude', limit: 500 })])
  return { drafts: drafts.posts.map(row), posts: posts.posts.map(row) }
}

// ---------------------------------------------------------------------------
// The editor

/// A post as the editor holds it.
export type EditorPost = {
  id: string
  slug: string
  title: string
  content: string
  tags: string[]
  image: string
  summary: string
  /// ISO 8601.
  date: string
  stage: number
  unlisted: boolean
  published: boolean
  views: number
}

export const editorPost = (post: BlogPost): EditorPost => ({
  id: post.id,
  slug: post.slug,
  title: post.title,
  content: post.content,
  tags: post.tags,
  image: post.image,
  summary: post.summary,
  date: post.date.toISOString(),
  stage: post.stage,
  unlisted: post.unlisted,
  published: post.published,
  views: post.views,
})

/// Whether a post can go to the newsletter, as the editor's newsletter
/// section shows it.
export type NewsletterView = {
  canSend: boolean
  /// Why not, when it cannot.
  reason: string | null
  /// The send that took it out, if one did.
  sent: { at: string; recipients: number } | null
  /// Who a send would go to now.
  subscribers: number
}

async function newsletterView(post: BlogPost): Promise<NewsletterView> {
  const [status, subscribers] = await Promise.all([sendStatus(post), db.newsletterSubscriber.count({ where: { unsubscribed: false } })])
  return {
    canSend: status.canSend,
    reason: status.reason,
    sent: status.send ? { at: status.send.createdAt.toISOString(), recipients: status.send.recipients } : null,
    subscribers,
  }
}

export type EditorData = {
  /// Null for a new post.
  post: EditorPost | null
  /// The post's content rendered, so the page arrives with its preview.
  preview: Preview
  /// Tags to pick from: the most used ones, as Go's editor offered them, and
  /// the post's own.
  tags: string[]
  newsletter: NewsletterView | null
}

/// What the editor opens with: the post [id], or nothing for a new post.
/// Null without a signed-in session, or for an id no post has, so the page is
/// a 404.
export async function editorData(id: string | null): Promise<EditorData | null> {
  if (!(await isAdmin())) return null
  const post = id === null ? null : await findPost(id)
  if (id !== null && (!post || post.id !== id)) return null
  const counts = await tagCounts()
  const tags = [...new Set([...counts.slice(0, 16).map((t) => t.name), ...(post?.tags ?? [])])]
  const [shown, newsletter] = await Promise.all([previewOf(post?.content ?? '', post?.date ?? new Date()), post && newsletterView(post)])
  return { post: post && editorPost(post), preview: shown, tags, newsletter }
}

const saveInput = z.object({
  /// The post to save; none creates one.
  id: z.string().max(25).optional(),
  title: z.string().max(500),
  slug: z.string().max(300),
  content: z.string().max(5_000_000),
  tags: z.array(z.string().max(100)).max(100),
  image: z.string().max(2000),
  summary: z.string().max(5000),
  /// Only when the editor changed it; a draft saved without one is dated now.
  date: z.string().max(100).optional(),
  stage: z.number().int().min(-1000).max(1000),
  unlisted: z.boolean(),
})

export type SaveInput = z.input<typeof saveInput>

/// Thrown for input no editor would send; a fault, not a refusal.
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) throw new Error(`Invalid input: ${result.error.issues.map((i) => `${i.path.join('.') || 'input'} ${i.message}`).join('; ')}`)
  return result.data
}

/// Saves the editor's fields: creates the post when there is no id, else
/// updates it. Returns the post as saved (title capitalised, slug made).
export async function savePost(input: SaveInput): Promise<Outcome<EditorPost>> {
  await requireAdmin()
  const { id, ...fields } = parse(saveInput, input)
  return attempt(async () => editorPost(id ? await updatePost(id, fields) : await createPost(fields)))
}

const idInput = z.string().min(1).max(25)

export const publish = (id: string) => attempt(async () => editorPost(await publishPost(parse(idInput, id))))
export const unpublish = (id: string) => attempt(async () => editorPost(await unpublishPost(parse(idInput, id))))
export const remove = (id: string) => attempt(async () => editorPost(await deletePost(parse(idInput, id))))

const listedInput = z.object({ id: idInput, unlisted: z.boolean() })

export async function setListed(input: { id: string; unlisted: boolean }): Promise<Outcome<EditorPost>> {
  await requireAdmin()
  const { id, unlisted } = parse(listedInput, input)
  return attempt(async () => editorPost(await setUnlisted(id, unlisted)))
}

export type Preview = {
  html: string
  words: number
  readMinutes: number
  /// The date as the post's meta line shows it.
  dateTime: string
  dateLabel: string
}

const previewInput = z.object({ markdown: z.string().max(5_000_000), date: z.string().max(100).optional() })

/// [markdown] as the post page renders it, and the meta line's word count
/// and date, for the editor's live preview.
export async function preview(input: { markdown: string; date?: string }): Promise<Preview> {
  await requireAdmin()
  const { markdown, date } = parse(previewInput, input)
  return previewOf(markdown, date && !Number.isNaN(new Date(date).getTime()) ? new Date(date) : new Date())
}

async function previewOf(markdown: string, date: Date): Promise<Preview> {
  const { html } = await renderPreview(markdown)
  const words = wordCount(markdown)
  return { html, words, readMinutes: readTime(words), dateTime: goTime(date), dateLabel: isoformat(date) }
}

// ---------------------------------------------------------------------------
// The newsletter

export async function newsletterStatus(id: string): Promise<NewsletterView> {
  await requireAdmin()
  return newsletterView(await getPost(parse(idInput, id)))
}

const sendInput = z.object({
  id: idInput,
  /// A test send to this one subscriber.
  to: z.string().max(320).optional(),
  /// Render and count, sending and recording nothing.
  dryRun: z.boolean().optional(),
})

export type Sent = {
  recipients: number
  failed: number
  dryRun: boolean
  /// The email the first recipient gets.
  email: { to: string; subject: string; text: string; html: string } | null
  newsletter: NewsletterView
}

/// Sends the post [id] to the newsletter, or with [to] to one subscriber as
/// a test. What sendPost would refuse is checked first, as the MCP tool does,
/// so a refusal is shown in the editor and what sendPost still throws is a
/// fault.
export async function sendNewsletter(input: { id: string; to?: string; dryRun?: boolean }): Promise<Outcome<Sent>> {
  await requireAdmin()
  const { id, to, dryRun } = parse(sendInput, input)
  return attempt(async () => {
    const post = await getPost(id)
    const address = to?.trim()
    if (address) {
      if (!post.published) throw new PostActionError(`"${post.slug}" is not published`)
      if (Date.now() - post.date.getTime() > MAX_POST_AGE_MS) throw new PostActionError(`"${post.slug}" is dated more than a day ago; only a new post goes to the newsletter`)
      const subscriber = await db.newsletterSubscriber.findFirst({ where: { email: { equals: address, mode: 'insensitive' } } })
      if (!subscriber) throw new PostActionError(`No subscriber has the address ${address}; subscribe it first at /newsletter`)
      if (subscriber.unsubscribed) throw new PostActionError(`${subscriber.email} has unsubscribed`)
    } else {
      const status = await sendStatus(post)
      if (!status.canSend) throw new PostActionError(status.reason ?? `"${post.slug}" cannot be sent`)
    }
    const result = await sendPost(post.slug, { to: address || undefined, dryRun: !!dryRun })
    const sample = result.sample
    return {
      recipients: result.recipients,
      failed: result.failed,
      dryRun: result.dryRun,
      email: sample ? { to: sample.to, subject: sample.subject, text: sample.text, html: sample.html } : null,
      newsletter: await newsletterView(post),
    }
  })
}
