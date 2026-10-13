// Pieces of the Go templates written as HTML strings, for the places where
// a post's rendered markdown sits beside them in one element: a post's
// article holds its header, notices and content as siblings, which the
// stylesheet's `.content > p` rules rely on, so it is drawn as one string.

import type { MetaView, PostView } from '#/lib/views'

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&#34;', "'": '&#39;' }

/// Text made safe for HTML, as pongo2's autoescape wrote it.
export const esc = (text: string | number) => String(text).replace(/[&<>"']/g, (c) => ESCAPES[c]!)

/// The sanitize filter (internal/templates.go) for titles: everything but
/// ASCII letters, digits, _, whitespace and - – — : " ' ! ? removed, then
/// trimmed. Emoji go, for one.
export const sanitizeTitle = (title: string) => title.replace(/[^\w\t\n\f\r \-–—:"'!?]/g, '').trim()

export type MetaOptions = {
  admin: boolean
  /// The fire for a post readers are voting for (post lists).
  hot?: boolean
  noViews?: boolean
  noVotes?: boolean
  showWordCount?: boolean
  /// How many the newsletter went to, for the admin.
  notified?: number | null
}

/// The inside of templates/partials/blog_post_meta.html's <div class="meta">.
export function metaInner(meta: MetaView, o: MetaOptions): string {
  let html = `<time datetime="${esc(meta.dateTime)}" title="${esc(meta.dateTime)}">${esc(meta.dateLabel)}</time> `
  html += `<span title="${meta.words} words">&bull; ${meta.readMinutes} min read</span>`
  if (o.showWordCount) html += ` &bull; ${meta.words} words`
  if (!o.noVotes && o.admin && meta.votesTotal > 0) {
    const fire = o.hot && ((meta.votesUsers > 10 && meta.fresh7) || (meta.votesUsers > 30 && meta.fresh30)) ? ' <span style="opacity:0.5">🔥</span>' : ''
    html += ` <span title="${meta.votesUsers} readers voted">&bull; ${meta.votesTotal} votes${fire}</span>`
  }
  if (!o.noViews && o.admin && meta.published) html += ` <span title="${meta.score} score">&bull; ${meta.views} views</span>`
  if (!meta.published) html += ' &bull; Draft'
  if (o.admin && o.notified != null) html += ` &bull; ${o.notified} Notified`
  return html
}

/// Everything inside a post's <article class="content blog-post">.
export function articleInner(post: PostView, admin: boolean, editHref: string): string {
  let html = ''
  if (admin) html += `<div class="notice notice--warning"><a href="${esc(editHref)}" class="btn btn--warning btn--sm">Edit</a></div>`
  html += `<header><h1>${esc(post.title)}</h1><div class="meta ">${metaInner(post.meta, { admin, notified: post.notified })}</div></header>`
  if (post.outOfDate) {
    html += `<p class="notice notice--warning">This post was last updated <code>${esc(post.outOfDate)}</code> and may be out of date </p>`
  }
  html += post.html
  if (post.tags.includes('tutorial')) {
    html += `<p class="notice notice--info">If you enjoyed this tutorial, please consider <a href="/blog/donate/${esc(post.slug)}">sponsoring my work on GitHub</a> 🤗 </p>`
  }
  return html
}
