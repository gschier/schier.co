// What the admin does to posts: create, edit, publish, unpublish, unlist,
// delete, list and preview. Plain functions over the database with no HTTP
// in them; the admin MCP (src/server/mcp/server.ts) and the editor are built
// on these.
//
// Saving follows the Go site's routeBlogPostCreateOrUpdate
// (internal/routes_blog.go): titles are capitalised as Go's CapitalizeTitle
// does, tags lowercased, Windows line endings dropped, and a draft saved
// with no slug gets one made from its title as gosimple/slug makes it. A
// published post keeps its slug, since links point at it. Unlike Go,
// publishing sets the post's date to now (BRIEF.md, Newsletter), so a new
// post can go to the newsletter, which only sends posts from the last day.

import type { BlogPost, Prisma } from '#/generated/prisma/client'
import { db, newId } from '#/server/db'
import { renderMarkdown, summarize } from '#/server/markdown'

/// A refusal meant for the person or agent asking: a duplicate slug, a post
/// that does not exist. Its message is plain and is shown as it is; it is
/// not a fault of the site's, so it is not reported to Sentry.
export class PostActionError extends Error {
  readonly refusal = true
  constructor(message: string) {
    super(message)
    this.name = 'PostActionError'
  }
}

/// Whether [error] is a refusal (PostActionError) rather than a fault.
export const isRefusal = (error: unknown): error is PostActionError => (error as { refusal?: unknown } | null)?.refusal === true

// ---------------------------------------------------------------------------
// Titles, slugs and tags as the Go site made them.

/// Words a title keeps in lower case unless one starts it.
const LOWER_WORDS = new Set(['a', 'an', 'the', 'at', 'by', 'for', 'in', 'of', 'on', 'to', 'up', 'and', 'as', 'but', 'or', 'nor'])

/// Go's CapitalizeTitle (internal/helpers.go): every word's first letter
/// upper-cased, except the small words above after the first word, and
/// runs of whitespace made one space. A word that starts with something
/// other than a letter, digit or underscore (an emoji, a quote) is left
/// alone and does not count as the first word.
export function capitalizeTitle(title: string): string {
  const words = title.split(/\s+/).filter(Boolean)
  let first = true
  return words
    .map((w) => {
      const lower = w.toLowerCase()
      if (!first && LOWER_WORDS.has(lower)) return lower
      const head = w[0]!
      if (/\w/.test(head)) {
        first = false
        return head.toUpperCase() + w.slice(1)
      }
      return w
    })
    .join(' ')
}

/// gosimple/slug v1.9.0's substitutions for English, applied before
/// transliteration.
const SLUG_SUBSTITUTIONS: Record<string, string> = {
  '"': '',
  "'": '',
  '’': '',
  '‒': '-',
  '–': '-',
  '—': '-',
  '―': '-',
  '&': 'and',
  '@': 'at',
}

/// Letters NFKD does not take apart, as unidecode spells them.
const TRANSLITERATIONS: Record<string, string> = {
  ß: 'ss',
  æ: 'ae',
  Æ: 'AE',
  œ: 'oe',
  Œ: 'OE',
  ø: 'o',
  Ø: 'O',
  đ: 'd',
  Đ: 'D',
  ł: 'l',
  Ł: 'L',
  þ: 'th',
  Þ: 'TH',
  ð: 'd',
  Ð: 'D',
}

/// A slug from [text] as gosimple/slug's Make does: quotes dropped, & and
/// @ spelled out, accents taken off, lower case, anything but letters,
/// digits, - and _ made a dash, dashes run together, and none at either end.
/// Go transliterates every script with unidecode; here only accented Latin
/// letters are, and anything else becomes a dash.
export function slugify(text: string): string {
  let slug = [...text.trim()].map((c) => SLUG_SUBSTITUTIONS[c] ?? c).join('')
  slug = slug
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\x00-\x7f]/g, (c) => TRANSLITERATIONS[c] ?? c)
  return slug
    .toLowerCase()
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
}

/// Tags as Go saved them: lower case. Also trimmed, with empty ones and
/// repeats dropped.
export function cleanTags(tags: string[]): string[] {
  return [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))]
}

/// A slug the site can serve at /blog/{slug}: what slugify makes, and what
/// every existing post has.
const SLUG = /^[a-z0-9][a-z0-9_-]*$/

function checkSlug(slug: string) {
  if (slug.length > 200) throw new PostActionError('A slug is at most 200 characters')
  if (!SLUG.test(slug)) {
    throw new PostActionError(`"${slug}" is not a usable slug: use lower-case letters, digits, - and _ (for example "${slugify(slug) || 'my-post'}"), or leave it empty to make one from the title`)
  }
}

const lineEndings = (content: string) => content.replace(/\r\n/g, '\n')

// ---------------------------------------------------------------------------
// Finding posts.

/// The post with the slug or id [slugOrId], or null.
export function findPost(slugOrId: string): Promise<BlogPost | null> {
  const key = slugOrId.trim()
  if (!key) return Promise.resolve(null)
  return db.blogPost.findFirst({ where: { OR: [{ slug: key }, { id: key }] } })
}

/// The post with the slug or id [slugOrId]; refuses when there is none.
export async function getPost(slugOrId: string): Promise<BlogPost> {
  const post = await findPost(slugOrId)
  if (!post) throw new PostActionError(`No post has the slug or id "${slugOrId}"`)
  return post
}

async function refuseTakenSlug(slug: string, exceptId?: string) {
  const other = await db.blogPost.findUnique({ where: { slug }, select: { id: true, title: true } })
  if (other && other.id !== exceptId) throw new PostActionError(`Another post already has the slug "${slug}" ("${other.title}", ${other.id}); choose another slug`)
}

/// Prisma's unique violation on the slug, from two saves at once.
function slugRace(error: unknown, slug: string): never {
  if ((error as { code?: string } | null)?.code === 'P2002') throw new PostActionError(`Another post already has the slug "${slug}"; choose another slug`)
  throw error
}

// ---------------------------------------------------------------------------
// Saving.

/// What a post can be given when it is created or edited. Fields left out
/// are left as they are (or as their defaults, on create).
export type PostFields = {
  title?: string
  /// Empty makes one from the title, on create and for a draft.
  slug?: string
  /// Markdown.
  content?: string
  tags?: string[]
  /// An image for previews and the page's social card, usually /media/...
  image?: string
  /// A summary for lists and the newsletter; empty uses the opening.
  summary?: string
  /// When the post is dated. A draft's date is set to now each time it is
  /// saved without one, as on the Go site, and publishing sets it to now.
  date?: Date | string
  /// How far along a draft is (the Go site's drafts page sorts by it).
  stage?: number
  /// An unlisted post is published at its URL but left out of lists, feeds
  /// and search.
  unlisted?: boolean
}

function toDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new PostActionError(`"${String(value)}" is not a date; use an ISO 8601 date such as 2026-10-13T09:00:00Z`)
  return date
}

function checkStage(stage: number) {
  if (!Number.isInteger(stage)) throw new PostActionError('The stage is a whole number')
}

/// The author every post has: Greg, the one user carried over from the Go
/// site (BRIEF.md, Admin and auth). Null on a database with no users.
async function author(): Promise<string | null> {
  const user = await db.user.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } })
  return user?.id ?? null
}

/// Creates a draft. Its slug is [fields.slug], or made from the title when
/// that is empty; a slug another post has is refused.
export async function createPost(fields: PostFields): Promise<BlogPost> {
  const title = capitalizeTitle(fields.title ?? '')
  const slug = fields.slug?.trim() || slugify(title)
  if (!slug) throw new PostActionError('A post needs a title or a slug')
  checkSlug(slug)
  if (fields.stage !== undefined) checkStage(fields.stage)
  await refuseTakenSlug(slug)
  const now = new Date()
  try {
    return await db.blogPost.create({
      data: {
        id: newId('pst_'),
        userId: await author(),
        slug,
        title,
        content: lineEndings(fields.content ?? ''),
        image: fields.image?.trim() ?? '',
        summary: fields.summary ?? '',
        tags: cleanTags(fields.tags ?? []),
        date: fields.date !== undefined ? toDate(fields.date) : now,
        editedAt: now,
        stage: fields.stage ?? 0,
        unlisted: fields.unlisted ?? false,
        published: false,
      },
    })
  } catch (error) {
    slugRace(error, slug)
  }
}

/// Edits the post [slugOrId] with [fields]. A draft given an empty slug
/// gets one from its title; a published post's slug cannot change, since
/// links point at it (unpublish it first). editedAt moves when the content
/// changes.
export async function updatePost(slugOrId: string, fields: PostFields): Promise<BlogPost> {
  const post = await getPost(slugOrId)
  const data: Prisma.BlogPostUpdateInput = {}

  const title = fields.title !== undefined ? capitalizeTitle(fields.title) : post.title
  if (fields.title !== undefined) data.title = title

  if (fields.slug !== undefined) {
    const slug = fields.slug.trim() || (post.published ? post.slug : slugify(title))
    if (!slug) throw new PostActionError('A post needs a title or a slug')
    if (slug !== post.slug) {
      if (post.published) throw new PostActionError(`"${post.slug}" is published, so its slug cannot change; unpublish it first`)
      checkSlug(slug)
      await refuseTakenSlug(slug, post.id)
      data.slug = slug
    }
  }

  if (fields.content !== undefined) {
    const content = lineEndings(fields.content)
    if (content !== post.content) {
      data.content = content
      data.editedAt = new Date()
    }
  }
  if (fields.tags !== undefined) data.tags = cleanTags(fields.tags)
  if (fields.image !== undefined) data.image = fields.image.trim()
  if (fields.summary !== undefined) data.summary = fields.summary
  if (fields.stage !== undefined) {
    checkStage(fields.stage)
    data.stage = fields.stage
  }
  if (fields.unlisted !== undefined) data.unlisted = fields.unlisted
  if (fields.date !== undefined) data.date = toDate(fields.date)
  else if (!post.published) data.date = new Date()

  try {
    return await db.blogPost.update({ where: { id: post.id }, data })
  } catch (error) {
    slugRace(error, String(data.slug ?? post.slug))
  }
}

/// Publishes the post [slugOrId] and dates it now, so it is new on the blog
/// and can go to the newsletter. A post that is already published is left
/// as it is, date included.
export async function publishPost(slugOrId: string): Promise<BlogPost> {
  const post = await getPost(slugOrId)
  if (post.published) return post
  if (!post.title.trim()) throw new PostActionError(`"${post.slug}" has no title; give it one before publishing`)
  if (!post.content.trim()) throw new PostActionError(`"${post.slug}" has no content; write something before publishing`)
  return db.blogPost.update({ where: { id: post.id }, data: { published: true, date: new Date() } })
}

/// Makes the post [slugOrId] a draft again: gone from the site until it is
/// published once more.
export async function unpublishPost(slugOrId: string): Promise<BlogPost> {
  const post = await getPost(slugOrId)
  if (!post.published) return post
  return db.blogPost.update({ where: { id: post.id }, data: { published: false } })
}

/// Unlists the post [slugOrId] (still at its URL, out of lists, feeds and
/// search), or lists it again with [unlisted] false.
export async function setUnlisted(slugOrId: string, unlisted: boolean): Promise<BlogPost> {
  const post = await getPost(slugOrId)
  if (post.unlisted === unlisted) return post
  return db.blogPost.update({ where: { id: post.id }, data: { unlisted } })
}

/// Deletes the post [slugOrId] for good, returning it as it was.
export async function deletePost(slugOrId: string): Promise<BlogPost> {
  const post = await getPost(slugOrId)
  await db.blogPost.delete({ where: { id: post.id } })
  return post
}

// ---------------------------------------------------------------------------
// Listing and previewing.

/// Whether a list has some kind of post in it, alone, or not at all.
export type Including = 'include' | 'exclude' | 'only'

export type ListOptions = {
  /// Drafts (unpublished posts). Default include.
  drafts?: Including
  /// Unlisted posts. Default include.
  unlisted?: Including
  /// Words to find in the title, slug or content, or a tag.
  query?: string
  /// At most this many (default 50, at most 500).
  limit?: number
  offset?: number
}

/// A post without its content, for lists.
export type PostSummary = Pick<BlogPost, 'id' | 'slug' | 'title' | 'published' | 'unlisted' | 'stage' | 'date' | 'editedAt' | 'tags' | 'image' | 'views'> & {
  /// The post's summary, else the opening of its content.
  summary: string
}

const SUMMARY_WORDS = 50

export function summaryOf(post: BlogPost): PostSummary {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    published: post.published,
    unlisted: post.unlisted,
    stage: post.stage,
    date: post.date,
    editedAt: post.editedAt,
    tags: post.tags,
    image: post.image,
    views: post.views,
    summary: post.summary.trim() || summarize(post.content, SUMMARY_WORDS),
  }
}

/// Posts newest first, as summaries: drafts alone are sorted as the Go
/// site's drafts page sorts them, furthest along and then last edited
/// first. [total] counts every post that matched, before limit and offset.
export async function listPosts(options: ListOptions = {}): Promise<{ total: number; posts: PostSummary[] }> {
  const drafts = options.drafts ?? 'include'
  const unlisted = options.unlisted ?? 'include'
  const limit = Math.min(Math.max(Math.floor(options.limit ?? 50), 1), 500)
  const offset = Math.max(Math.floor(options.offset ?? 0), 0)

  const and: Prisma.BlogPostWhereInput[] = []
  if (drafts === 'exclude') and.push({ published: true })
  if (drafts === 'only') and.push({ published: false })
  if (unlisted === 'exclude') and.push({ unlisted: false })
  if (unlisted === 'only') and.push({ unlisted: true })
  const query = options.query?.trim()
  if (query) {
    and.push({
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { slug: { contains: query, mode: 'insensitive' } },
        { content: { contains: query, mode: 'insensitive' } },
        { tags: { has: query.toLowerCase() } },
      ],
    })
  }
  const where: Prisma.BlogPostWhereInput = { AND: and }
  const orderBy: Prisma.BlogPostOrderByWithRelationInput[] =
    drafts === 'only' ? [{ stage: 'desc' }, { editedAt: 'desc' }, { id: 'asc' }] : [{ date: 'desc' }, { id: 'asc' }]

  const [total, posts] = await Promise.all([db.blogPost.count({ where }), db.blogPost.findMany({ where, orderBy, take: limit, skip: offset })])
  return { total, posts: posts.map(summaryOf) }
}

/// [markdown] as the post page renders it, and the summary it would get
/// without one of its own.
export async function renderPreview(markdown: string): Promise<{ html: string; summary: string }> {
  return { html: await renderMarkdown(markdown), summary: summarize(markdown) }
}
