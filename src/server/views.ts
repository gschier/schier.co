// Posts made into what the pages draw (src/lib/views.ts), with the Go
// templates' filters (internal/templates.go and pongo2's builtins) done the
// way Go did them.

import type { BlogPost } from '#/generated/prisma/client'
import type { CardView, MetaView, PostView, PreviewView } from '#/lib/views'
import { isKnownAdmin } from '#/server/admin'
import { renderMarkdown, summarize } from '#/server/markdown'
import { readTime, wordCount } from '#/server/posts'

const DAY = 24 * 60 * 60 * 1000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const pad = (n: number, size = 2) => String(n).padStart(size, '0')

/// A time as Go's time.Time printed one read from the database
/// ("2024-05-09 20:18:12.498 +0000 +0000"): the timestamps are UTC with no
/// zone, which lib/pq read as a zone with no name.
export function goTime(date: Date): string {
  const ms = date.getUTCMilliseconds()
  const fraction = ms ? `.${pad(ms, 3)}`.replace(/0+$/, '') : ''
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}${fraction} +0000 +0000`
  )
}

/// The start of [date]'s day, as Go's filters took a time: by its
/// year-month-day only.
const dayOf = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())

/// Go's "Jan _2, 2006": the day padded with a space, not a zero.
function longDate(day: number): string {
  const d = new Date(day)
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, ' ')}, ${d.getUTCFullYear()}`
}

/// The isoformat filter: "Today" for today, "Jan  2" within 200 days, else
/// "Jan  2, 2006"; with [long], always the last.
export function isoformat(date: Date, long = false, now = Date.now()): string {
  const day = dayOf(date)
  const full = longDate(day)
  if (long) return full
  if (now - day < DAY) return 'Today'
  if (now - day < 200 * DAY) return full.slice(0, -6)
  return full
}

/// The isodateolderdays filter: whether [date]'s day began over [days] days ago.
export const olderThanDays = (date: Date, days: number, now = Date.now()) => dayOf(date) < now - days * DAY

/// pongo2's truncatechars: cut to [length] characters with "..." in the
/// last three when it is longer.
export function truncateChars(text: string, length: number): string {
  const chars = [...text]
  if (length >= chars.length) return text
  return length >= 3 ? chars.slice(0, length - 3).join('') + '...' : chars.slice(0, length).join('')
}

/// A post's summary for its page's description: its summary field, else
/// the opening of its content.
export const description = (post: Pick<BlogPost, 'summary' | 'content'>) => post.summary || summarize(post.content)

/// Whether this request is the admin's, as the request middleware found
/// (src/start.ts); false outside a request (tests).
const admin = (): boolean => isKnownAdmin()

/// The meta line's facts. Views and score are the admin's to see, so
/// nobody else's page carries them.
export function meta(post: BlogPost, now = Date.now()): MetaView {
  const words = wordCount(post.content)
  const own = admin()
  return {
    dateTime: goTime(post.date),
    dateLabel: isoformat(post.date, false, now),
    words,
    readMinutes: readTime(words),
    published: post.published,
    votesTotal: post.votesTotal,
    votesUsers: post.votesUsers,
    views: own ? post.views : 0,
    score: own ? post.score : 0,
    fresh7: !olderThanDays(post.date, 7, now),
    fresh30: !olderThanDays(post.date, 30, now),
  }
}

export const card = (post: BlogPost): CardView => ({ slug: post.slug, title: truncateChars(post.title, 50), meta: meta(post) })

export const preview = (post: BlogPost): PreviewView => ({
  slug: post.slug,
  title: post.title,
  meta: meta(post),
  summary: truncateChars(summarize(post.content), 340),
  tags: post.tags,
})

export async function postView(post: BlogPost, notified: number | null): Promise<PostView> {
  const edited = post.editedAt ?? post.date
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    meta: meta(post),
    html: await renderMarkdown(post.content),
    tags: post.tags,
    published: post.published,
    votesTotal: post.votesTotal,
    votesUsers: post.votesUsers,
    outOfDate: olderThanDays(edited, 365) ? isoformat(edited) : null,
    notified,
  }
}
