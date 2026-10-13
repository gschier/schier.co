// The newsletter's two emails, as plain text and HTML: the welcome on
// subscribing, and a new post. Minimal on purpose; Greg means to rework
// what the newsletter sends (BRIEF.md, Newsletter). Every link is absolute,
// from BASE_URL, and every email carries its subscriber's unsubscribe link.

import type { BlogPost, NewsletterSubscriber } from '#/generated/prisma/client'
import { escapeHtml } from '#/server/mail'

export type Rendered = { subject: string; text: string; html: string }
type Subscriber = Pick<NewsletterSubscriber, 'id' | 'name'>
type Post = Pick<BlogPost, 'slug' | 'title' | 'summary' | 'content'>

/// The site's address with no trailing slash. An email with a relative or
/// localhost link is useless, so a missing BASE_URL is an error.
export function baseUrl(): string {
  const base = process.env.BASE_URL?.trim().replace(/\/+$/, '')
  if (!base) throw new Error('BASE_URL is not set, so an email cannot link back to the site')
  return base
}

export const postUrl = (slug: string) => `${baseUrl()}/blog/${encodeURIComponent(slug)}`
export const unsubscribeUrl = (subscriber: Subscriber) => `${baseUrl()}/newsletter/unsubscribe/${encodeURIComponent(subscriber.id)}`

/// Markdown reduced to its words, crudely: code blocks, images, HTML and
/// markup go, link text stays. Good enough for a summary, not a renderer.
export function stripMarkdown(md: string): string {
  return md
    .replace(/\r\n/g, '\n')
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/^\s*\[[^\]]+\]:\s+\S+.*$/gm, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>+|[-*+]|\d+\.)\s+/gm, '')
    .replace(/^\s*([-*_]\s*){3,}$/gm, ' ')
    // Twice, for emphasis inside emphasis (**_like this_**).
    .replace(/(\*\*|__|\*|_|~~)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(/(\*\*|__|\*|_|~~)(?=\S)([\s\S]*?\S)\1/g, '$2')
    // Dashes as the Go site's summaries had them.
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    .replace(/\s+/g, ' ')
    .replace(/ ([.,;:!?])/g, '$1')
    .trim()
}

const SUMMARY_WORDS = 50

/// The post's summary column, else the first fifty words of its content.
export function postSummary(post: Pick<Post, 'summary' | 'content'>): string {
  if (post.summary.trim()) return post.summary.trim()
  const words = stripMarkdown(post.content).split(' ').filter(Boolean)
  if (words.length <= SUMMARY_WORDS) return words.join(' ')
  return words.slice(0, SUMMARY_WORDS).join(' ') + '…'
}

/// Minutes to read, as the Go site counted them: 200 words a minute, plus one.
export function readMinutes(content: string): number {
  const words = stripMarkdown(content).split(' ').filter(Boolean).length
  return Math.floor(words / 200) + 1
}

const footerText = (subscriber: Subscriber) =>
  `You are getting this because you subscribed to Gregory Schier's newsletter.\nUnsubscribe: ${unsubscribeUrl(subscriber)}`

function layout(body: string, subscriber: Subscriber): string {
  const unsubscribe = escapeHtml(unsubscribeUrl(subscriber))
  return `<!doctype html>
<html>
<body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#222;background:#fff">
<div style="max-width:560px;margin:0 auto">
${body}
<hr style="border:none;border-top:1px solid #ddd;margin:32px 0 16px">
<p style="font-size:13px;color:#777">You are getting this because you subscribed to Gregory Schier's newsletter. <a href="${unsubscribe}" style="color:#777">Unsubscribe</a></p>
</div>
</body>
</html>`
}

/// Sent once, when someone first subscribes.
export function welcomeEmail(subscriber: Subscriber): Rendered {
  const hi = subscriber.name.trim() ? `Hi ${subscriber.name.trim()},` : 'Hi,'
  const blog = `${baseUrl()}/blog`
  const text = `${hi}

Thanks for subscribing to my newsletter. I will send you an email when I publish a new post: ${blog}

Greg

--
${footerText(subscriber)}
`
  const html = layout(
    `<p>${escapeHtml(hi)}</p>
<p>Thanks for subscribing to my newsletter. I will send you an email when I publish a <a href="${escapeHtml(blog)}">new post</a>.</p>
<p>Greg</p>`,
    subscriber,
  )
  return { subject: 'Thanks for subscribing', text, html }
}

/// A new post, to every subscriber.
export function newPostEmail(post: Post, subscriber: Subscriber): Rendered {
  const url = postUrl(post.slug)
  const summary = postSummary(post)
  const minutes = readMinutes(post.content)
  const readTime = `${minutes} minute read`
  const text = `${post.title}
${readTime}

${summary}

Read it: ${url}

--
${footerText(subscriber)}
`
  const html = layout(
    `<h1 style="font-size:24px;line-height:1.3;margin:0 0 4px"><a href="${escapeHtml(url)}" style="color:#222">${escapeHtml(post.title)}</a></h1>
<p style="margin:0 0 16px;color:#777;font-size:14px">${readTime}</p>
<p>${escapeHtml(summary)}</p>
<p><a href="${escapeHtml(url)}">Read the post</a></p>`,
    subscriber,
  )
  return { subject: post.title, text, html }
}
