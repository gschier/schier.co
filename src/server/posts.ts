// The public site's reads of posts, and the counters a reader bumps, as the
// Go site did them (internal/routes.go, routes_blog.go, database.go).
//
// Where a post shows:
// - Lists (home, /blog, tag pages, the tag counts, search, recommended
//   posts, the 404 page and the RSS feed) hold published posts that are not
//   unlisted, newest first.
// - A post's own page shows any post by its slug, unlisted ones included.
//   A draft (unpublished) shows only to the admin; the Go site showed drafts
//   to anyone with the slug, which the port does not.

import type { BlogPost, Prisma } from '#/generated/prisma/client'
import { db } from '#/server/db'
import { summarize } from '#/server/markdown'

/// Posts on a page of /blog, as Go's routeBlogPosts.
export const PAGE_SIZE = 10

const listed = { published: true, unlisted: false } as const

/// Newest first. Go sorted by date alone, which leaves posts dated the same
/// moment (a dozen pairs and threes from 2012 to 2014) in whatever order
/// Postgres finds them, an order that changed as their rows were updated
/// and could split one across two pages. The id settles it.
const newest = [{ date: 'desc' }, { id: 'asc' }] as const satisfies Prisma.BlogPostOrderByWithRelationInput[]

/// The newest [limit] listed posts (Go's recentBlogPosts). A limit of 0 is
/// every one, as in Go, where a zero limit was no limit.
export function recentPosts(limit: number): Promise<BlogPost[]> {
  return db.blogPost.findMany({ where: listed, orderBy: [...newest], ...(limit > 0 ? { take: limit } : {}) })
}

export type Page = {
  posts: BlogPost[]
  page: number
  /// The page "Previous" links to; the page itself when there is none.
  previous: number
  /// The page "Next" links to; the page itself when there is none.
  next: number
}

/// A page of /blog/page/{page}, or with [tag] a tag's page, which Go always
/// served as page 1: its ten newest posts, with a "Next" link (to
/// /blog/page/2, as Go's template wrote it) when there are more. Null when
/// a page after the first has no posts, which Go answered with its 404.
export async function postsPage(page: number, tag?: string): Promise<Page | null> {
  const skip = (page - 1) * PAGE_SIZE
  if (skip < 0) return null
  const posts = await db.blogPost.findMany({
    where: tag ? { ...listed, tags: { has: tag } } : listed,
    orderBy: [...newest],
    skip,
    take: PAGE_SIZE + 1,
  })
  if (posts.length === 0 && page > 1) return null
  const more = posts.length > PAGE_SIZE
  return { posts: posts.slice(0, PAGE_SIZE), page, previous: page > 1 ? page - 1 : page, next: more ? page + 1 : page }
}

/// The post at [slug], drafts and unlisted posts included.
export function postBySlug(slug: string): Promise<BlogPost | null> {
  return db.blogPost.findUnique({ where: { slug } })
}

/// Up to three listed posts to read next, highest score first, from the
/// last four years, leaving out [excludeId] (Go's recommendedBlogPosts).
export function recommendedPosts(excludeId: string, limit = 3): Promise<BlogPost[]> {
  return db.blogPost.findMany({
    where: { ...listed, id: { not: excludeId }, createdAt: { gt: new Date(Date.now() - 4 * 365 * DAY) } },
    orderBy: [{ score: 'desc' }, ...newest],
    take: limit,
  })
}

export type TagCount = { name: string; count: number }

/// Every tag of the listed posts with how many posts carry it, most used
/// first and, between equals, in reverse alphabetical order, as Go's allTags
/// sorted them.
export async function tagCounts(): Promise<TagCount[]> {
  const posts = await db.blogPost.findMany({ where: listed, select: { tags: true } })
  const counts = new Map<string, number>()
  for (const { tags } of posts) for (const tag of tags) if (tag) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => (a.count === b.count ? (a.name > b.name ? -1 : a.name < b.name ? 1 : 0) : b.count - a.count))
}

/// The listed posts whose content or title holds [query], ignoring case, or
/// that carry it (lower-cased) as a tag, newest first; none for an empty
/// query. As Go's routeBlogPostSearch, which matched with ILIKE, so % and _
/// in a query are wildcards there too.
export async function searchPosts(query: string): Promise<BlogPost[]> {
  if (!query) return []
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM blog_posts
    WHERE published AND NOT unlisted
      AND (content ILIKE '%' || ${query} || '%' OR title ILIKE '%' || ${query} || '%' OR tags @> ARRAY[${query.toLowerCase()}]::text[])`
  if (rows.length === 0) return []
  return db.blogPost.findMany({ where: { id: { in: rows.map((r) => r.id) } }, orderBy: [...newest] })
}

// ---------------------------------------------------------------------------
// Counters. Go saved the whole post to bump one, and its update hook set
// updated_at and edited_at to now every time, so a view or a share showed as
// an edit. The port bumps only the counter, so editedAt still means an edit.

const DAY = 24 * 60 * 60 * 1000

/// Counts a reader's view of [post] and works its score out again, as
/// renderBlogPost did; not for a draft, a bot or the admin.
export async function countView(post: BlogPost, userAgent: string, admin: boolean): Promise<void> {
  if (!post.published || isBot(userAgent) || admin) return
  const views = post.views + 1
  const score = calculateScore(Date.now() - post.date.getTime(), post.votesUsers + post.shares, views, wordCount(post.content))
  await db.$executeRaw`UPDATE blog_posts SET views = views + 1, score = ${score} WHERE id = ${post.id}`
}

/// Where /blog/share/{slug}/{platform} sends a reader, or '' for a platform
/// it does not know (Go's routeBlogShare).
export function shareUrl(post: Pick<BlogPost, 'slug' | 'title'>, platform: string): string {
  const postUrl = pathEscape(`${process.env.BASE_URL ?? ''}/blog/${post.slug}`)
  const title = pathEscape(summarize(post.title))
  switch (platform) {
    case 'twitter':
      return `https://twitter.com/share?url=${postUrl}&text=${title}&via=GregorySchier`
    case 'hn':
      return `https://news.ycombinator.com/submitlink?u=${postUrl}&t=${title}`
    case 'reddit':
      return `https://reddit.com/submit?url=${postUrl}&title=${title}`
    case 'email':
      return `mailto:?subject=${postUrl}&body=${title}`
  }
  return ''
}

/// Counts a share (or a click on the donate link, which Go also counted as
/// a share) of the post [id].
export async function countShare(id: string): Promise<void> {
  await db.$executeRaw`UPDATE blog_posts SET shares = shares + 1 WHERE id = ${id}`
}

/// A cheer on the post at [slug] from a reader who has cheered it [count]
/// times before (Go's routeVote): the new total, null when it is not
/// counted (a draft, or more than 50 from one reader), and undefined when
/// there is no such post. A reader's first cheer counts them as a voter too.
export async function vote(slug: string, count: number): Promise<number | null | undefined> {
  const post = await postBySlug(slug)
  if (!post) return undefined
  if (count > 50 || !post.published) return null
  const rows = await db.$queryRaw<{ votes_total: number }[]>`
    UPDATE blog_posts SET votes_total = votes_total + 1, votes_users = votes_users + ${count === 0 ? 1 : 0}
    WHERE id = ${post.id} RETURNING votes_total`
  return rows[0]?.votes_total ?? null
}

/// Go's CalculateScore (internal/helpers.go): votes and views over the age
/// in whole days; a post under a day old is on fire, one over a year old
/// scores nothing, and a short one (under 200 words) half.
export function calculateScore(ageMs: number, votes: number, views: number, words: number): number {
  const days = Math.trunc(ageMs / DAY)
  if (days < 1) return 999999
  if (days > 365) return 0
  let score = (votes * 400 + views) / (days + 1)
  if (words < 200) score /= 2
  return Math.trunc(score)
}

/// Whether [userAgent] is a crawler, close to how Go's
/// mileusna/useragent judged it: Googlebot, a UA that carries a URL (as
/// most crawlers' do), Twitterbot and facebookexternalhit, or one that is
/// no browser it knows and calls itself a bot.
export function isBot(userAgent: string): boolean {
  if (/Googlebot|Twitterbot|facebookexternalhit|https?:\/\//i.test(userAgent)) return true
  const browser = /\b(Chrome|CriOS|Firefox|FxiOS|Safari|OPR|Opera|Edge|EdgA|MSIE|Vivaldi|SamsungBrowser)\b/.test(userAgent)
  return !browser && /bot/i.test(userAgent)
}

/// Go's url.PathEscape: everything but letters, digits, -_.~ and $&+:=@ is
/// percent-encoded, byte by byte.
export function pathEscape(text: string): string {
  let out = ''
  for (const byte of new TextEncoder().encode(text)) {
    const c = String.fromCharCode(byte)
    out += /[A-Za-z0-9\-_.~$&+:=@]/.test(c) ? c : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
  }
  return out
}

// ---------------------------------------------------------------------------
// Words

/// The number of words in a post as Go counted them (WordCount in
/// internal/helpers.go): the spaces left once go-strip-markdown has run.
export function wordCount(markdown: string): number {
  return stripMarkdown(markdown).split(' ').length - 1
}

/// Minutes to read [words], as Go's CalculateReadTime.
export const readTime = (words: number) => Math.floor(words / 200) + 1

// RE2's \s and \S, which are ASCII only.
const S = '[\\t\\n\\f\\r ]'
const N = '[^\\t\\n\\f\\r ]'

/// github.com/writeas/go-strip-markdown v2.0.1, rule for rule. The same
/// table as src/server/markdown.ts's summaries, which does not export it.
const STRIP: [RegExp, string][] = [
  [new RegExp(`^(${S}*)([*\\-+]|\\d\\.)${S}+`, 'gm'), '$1'],
  [/\n={2,}/g, '\n'],
  [/~~/g, ''],
  [/`{3}.*\n/g, ''],
  [/\*\*([^*]+)\*\*/g, '$1'],
  [/\*([^*]+)\*/g, '$1'],
  [/__([^_]+)__/g, '$1'],
  [/_([^_]+)_/g, '$1'],
  [/<(.*?)>/g, '$1'],
  [new RegExp(`^[=\\-]{2,}${S}*$`, 'g'), ''],
  [/\[\^.+?\](: .*?$)?/g, ''],
  [new RegExp(`${S}{0,2}\\[.*?\\]: .*?$`, 'g'), ''],
  [new RegExp(`!\\[(.*?)\\]${S}?[[(].*?[\\])]`, 'g'), '$1'],
  [/\[(.*?)\][[(].*?[\])]/g, '$1'],
  [new RegExp(`>${S}*`, 'g'), '  '],
  [new RegExp(`^${S}{1,2}\\[(.*?)\\]: (${N}+)( ".*?")?${S}*$`, 'g'), ''],
  [/^#{1,6}[\t\n\f\r ]*([^#]+)[\t\n\f\r ]*(#{1,6})?$/gm, '$1'],
  [new RegExp(`([*_]{1,3})(${N}.*?${N})?P1`, 'g'), '$2'],
  [/(`{3,})(.*?)?P1/gm, '$2'],
  [new RegExp(`^-{3,}${S}*$`, 'g'), ''],
  [/`(.+?)`/g, '$1'],
  [/\n{2,}/g, '\n\n'],
]

function stripMarkdown(md: string): string {
  return STRIP.reduce((s, [re, to]) => s.replace(re, to), md)
}
