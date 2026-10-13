// The blog's RSS feed, written as the Go site's gorilla/feeds v1.1.1 wrote
// it (Feed.ToRss, encoding/xml with two-space indents), so feed readers see
// the same items with the same ids.

import type { BlogPost } from '#/generated/prisma/client'
import { renderMarkdown } from '#/server/markdown'

const AUTHOR = 'Gregory Schier'
const EMAIL = 'greg@schier.co'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number) => String(n).padStart(2, '0')

/// Go's time.RFC1123Z, for the database's UTC times.
export function rfc1123z(d: Date): string {
  return `${DAYS[d.getUTCDay()]}, ${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} +0000`
}

const XML_ESCAPES: Record<string, string> = { '"': '&#34;', "'": '&#39;', '&': '&amp;', '<': '&lt;', '>': '&gt;', '\t': '&#x9;', '\n': '&#xA;', '\r': '&#xD;' }

/// Text as encoding/xml escapes it.
export const xmlText = (text: string) => text.replace(/["'&<>\t\n\r]/g, (c) => XML_ESCAPES[c]!)

/// encoding/xml's CDATA, with any "]]>" split across two sections.
const cdata = (text: string) => `<![CDATA[${text.replaceAll(']]>', ']]]]><![CDATA[>')}]]>`

/// The feed of [posts], newest first, with links from [baseUrl]. Images
/// kept by the site itself (/media/...) are made absolute, as a feed reader
/// cannot resolve a path against the site.
export async function rssFeed(posts: BlogPost[], baseUrl: string): Promise<string> {
  const updated = rfc1123z(posts[0]!.date)
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">`,
    `  <channel>`,
    `    <title>${AUTHOR}</title>`,
    `    <link>${xmlText(`${baseUrl}/blog`)}</link>`,
    `    <description>Recent content from me</description>`,
    `    <copyright>${AUTHOR}</copyright>`,
    `    <managingEditor>${EMAIL} (${AUTHOR})</managingEditor>`,
    `    <pubDate>${updated}</pubDate>`,
    `    <lastBuildDate>${updated}</lastBuildDate>`,
    `    <image>`,
    `      <url>${xmlText(`${baseUrl}/static/favicon/android-chrome-512x512.png`)}</url>`,
    `      <title>${AUTHOR}</title>`,
    `      <link>${xmlText(`${baseUrl}/blog`)}</link>`,
    `    </image>`,
  ]
  for (const post of posts) {
    const html = (await renderMarkdown(post.content)).replace(/(<(?:img|a|source|video)\b[^>]*\s(?:src|href)=")\/media\//g, `$1${baseUrl}/media/`)
    lines.push(
      `    <item>`,
      `      <title>${xmlText(post.title.replaceAll('–', '&ndash;'))}</title>`,
      `      <link>${xmlText(`${baseUrl}/blog/${post.slug}`)}</link>`,
      `      <description></description>`,
      `      <content:encoded>${cdata(html)}</content:encoded>`,
      `      <author>${AUTHOR}</author>`,
      `      <guid>${xmlText(`${baseUrl}/blog/${post.id}`)}</guid>`,
      `      <pubDate>${rfc1123z(post.date)}</pubDate>`,
      `    </item>`,
    )
  }
  lines.push(`  </channel>`, `</rss>`)
  return lines.join('\n')
}
