// What the public pages are given about posts: everything worked out on the
// server (dates as the Go templates printed them, word counts, summaries,
// rendered markdown), so the browser is sent no markdown and draws the same
// thing the server did.

/// The line under a post's title (templates/partials/blog_post_meta.html).
export type MetaView = {
  /// The date as Go printed a time.Time, for the datetime and title.
  dateTime: string
  /// The date as Go's isoformat filter wrote it: "Today", "Jan  2" or "Jan  2, 2006".
  dateLabel: string
  words: number
  readMinutes: number
  published: boolean
  votesTotal: number
  votesUsers: number
  views: number
  score: number
  /// Dated within the last 7 and 30 days, for the admin's fire.
  fresh7: boolean
  fresh30: boolean
}

/// A post on a card (templates/partials/post-cards.html).
export type CardView = { slug: string; title: string; meta: MetaView }

/// A post in a list (templates/partials/blog_post_preview.html).
export type PreviewView = { slug: string; title: string; meta: MetaView; summary: string; tags: string[] }

/// A post's own page (templates/partials/blog_post.html).
export type PostView = {
  id: string
  slug: string
  title: string
  meta: MetaView
  html: string
  tags: string[]
  published: boolean
  votesTotal: number
  votesUsers: number
  /// The date of the last edit when it is over a year ago, for the "may be
  /// out of date" notice; null otherwise.
  outOfDate: string | null
  /// How many the newsletter went to, shown to the admin; null if unsent.
  notified: number | null
}

/// What every page's head is built from (src/components/site.tsx, pageHead).
export type HeadView = {
  title?: string
  description?: string
  image?: string
  publishedTime?: string
  modifiedTime?: string
}
