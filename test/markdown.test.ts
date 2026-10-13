// The markdown renderer against the Go site's:
//   node --test test/markdown.test.ts
//
// Every published post in the local database (DATABASE_URL in .env, read
// only) is rendered by src/server/markdown.ts and by the Go site on
// localhost:8084 (POST /blog/render with partial=true), and the two are
// compared after the same normalisation: both parsed and re-serialised as
// HTML, whitespace between tags collapsed, trimmed. Skipped when the Go site
// is not running (GO_SITE_URL points the test at another address).
//
// Code blocks are the one known difference: the Go site highlights with
// chroma, the port with Shiki, so their token markup cannot match. Each
// block's code must still match exactly; the markup difference is listed,
// not failed. MARKDOWN_DUMP=dir writes both sides of every post there.
//
// Summaries are checked against the description on each post's page on the
// Go site, for every post without a summary of its own.

import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { config } from 'dotenv'
import type { Element, ElementContent, Root, RootContent } from 'hast'
import pg from 'pg'
import rehypeParse from 'rehype-parse'
import rehypeStringify from 'rehype-stringify'
import { unified } from 'unified'
import { renderMarkdown, summarize } from '../src/server/markdown.ts'

const GO = process.env.GO_SITE_URL ?? 'http://localhost:8084'
const root = new URL('..', import.meta.url).pathname

type Post = { slug: string; title: string; content: string; summary: string; date: Date }

async function posts(): Promise<Post[]> {
  config({ path: join(root, '.env'), quiet: true })
  const url = new URL(process.env.DATABASE_URL ?? '')
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname), `posts are read from localhost only, not ${url.hostname}`)
  const db = new pg.Client({ connectionString: url.href })
  await db.connect()
  try {
    await db.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY')
    const { rows } = await db.query<Post>('SELECT slug, title, content, summary, date FROM blog_posts WHERE published ORDER BY date, slug')
    return rows
  } finally {
    await db.end()
  }
}

/// A session on the Go site: its CSRF cookie and token, from the home page.
async function goSession(): Promise<{ cookie: string; token: string } | undefined> {
  let res: Response
  try {
    res = await fetch(`${GO}/`, { signal: AbortSignal.timeout(5000) })
  } catch {
    return undefined
  }
  const html = await res.text()
  const token = /data-csrf-token="([^"]*)"/.exec(html)?.[1]
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
  assert.ok(token && cookie, 'the Go site gave no CSRF token')
  return { cookie, token: decodeEntities(token) }
}

/// The Go site's rendering of a post's markdown: the post partial's
/// article, between its header and its end. The date is now, so the partial
/// adds no "may be out of date" notice, and no tags, so no tutorial notice.
async function goRender(session: { cookie: string; token: string }, post: Post): Promise<string> {
  const body = new URLSearchParams({
    content: post.content,
    slug: post.slug,
    title: post.title,
    date: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    partial: 'true',
  })
  const res = await fetch(`${GO}/blog/render`, {
    method: 'POST',
    headers: { cookie: session.cookie, 'X-CSRF-Token': session.token, 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  const html = await res.text()
  assert.equal(res.status, 200, `the Go site would not render ${post.slug}: ${html.slice(0, 200)}`)
  const start = html.indexOf('</header>')
  const end = html.lastIndexOf('</article>', html.indexOf('<div class="clap-button">'))
  assert.ok(start >= 0 && end > start, `no article in the Go site's partial for ${post.slug}`)
  return html.slice(start + '</header>'.length, end)
}

/// Character references in an attribute value, as pongo2 and Go's html
/// package write them.
function decodeEntities(s: string) {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, ref: string) =>
    ref[0] === '#' ? String.fromCodePoint(ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10)) : (named[ref] ?? m),
  )
}

type CodeBlock = { text: string; markup: string }

/// HTML in a comparable form: parsed and serialised again (so entity and
/// quoting choices do not count), each code block replaced by its plain
/// text, whitespace between tags collapsed, trimmed.
function normalise(html: string): { html: string; code: CodeBlock[] } {
  const tree = unified().use(rehypeParse, { fragment: true }).parse(html) as Root
  const code: CodeBlock[] = []
  const visit = (children: (RootContent | ElementContent)[]) => {
    for (let i = 0; i < children.length; i++) {
      const node = children[i]!
      if (node.type !== 'element') continue
      if (node.tagName === 'pre') {
        const text = textOf(node).replace(/\s+$/, '')
        code.push({ text, markup: serialise({ type: 'root', children: [node] }) })
        children[i] = { type: 'element', tagName: 'pre', properties: { dataCode: String(code.length) }, children: [{ type: 'text', value: text }] }
        continue
      }
      visit(node.children)
    }
  }
  visit(tree.children)
  return { html: collapse(serialise(tree)), code }
}

const serialise = (tree: Root) => unified().use(rehypeStringify, { characterReferences: { useNamedReferences: true } }).stringify(tree)
const collapse = (html: string) => html.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim()
const textOf = (node: Element | ElementContent): string =>
  node.type === 'text' ? node.value : node.type === 'element' ? node.children.map(textOf).join('') : ''

/// Where two strings first part, with some context either side.
function firstDifference(a: string, b: string): string {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  const from = Math.max(0, i - 120)
  const show = (s: string) => (from > 0 ? '…' : '') + s.slice(from, i + 200) + (i + 200 < s.length ? '…' : '')
  return `at character ${i}:\n    go:   ${show(a)}\n    port: ${show(b)}`
}

// Posts whose Go rendering the brief accepts as different (BRIEF.md,
// Markdown). The Go site is wrong on these and the port is not made to copy it.
const ACCEPTED: Record<string, string> = {
  'simple-vanilla-javascript-typing-carousel': 'blackfriday escapes &lt; and &gt; in the source a second time, showing readers the entity text',
}

test('every published post renders as the Go site renders it', async (t) => {
  const session = await goSession()
  if (!session) {
    t.skip(`the Go site is not running on ${GO} (docker compose up at the repo root)`)
    return
  }
  const all = await posts()
  assert.ok(all.length > 0, 'no published posts in the local database to compare')

  const dump = process.env.MARKDOWN_DUMP
  if (dump) mkdirSync(dump, { recursive: true })

  const failures: string[] = []
  const highlighted: string[] = []
  for (const post of all) {
    if (ACCEPTED[post.slug]) {
      t.diagnostic(`${post.slug} skipped: ${ACCEPTED[post.slug]}`)
      continue
    }
    const [goHtml, portHtml] = await Promise.all([goRender(session, post), renderMarkdown(post.content)])
    if (dump) {
      writeFileSync(join(dump, `${post.slug}.go.html`), goHtml)
      writeFileSync(join(dump, `${post.slug}.port.html`), portHtml)
    }
    const go = normalise(goHtml)
    const port = normalise(portHtml)
    if (go.html !== port.html) {
      failures.push(`${post.slug} ${firstDifference(go.html, port.html)}`)
      continue
    }
    const codeDiffers = go.code.findIndex((c, i) => c.text !== port.code[i]?.text)
    if (codeDiffers >= 0 || go.code.length !== port.code.length) {
      const i = Math.max(codeDiffers, 0)
      failures.push(`${post.slug} code block ${i + 1} ${firstDifference(go.code[i]?.text ?? '', port.code[i]?.text ?? '')}`)
      continue
    }
    const restyled = go.code.filter((c, i) => c.markup !== port.code[i]!.markup).length
    if (restyled) highlighted.push(`${post.slug} (${restyled})`)
  }

  t.diagnostic(`${all.length} posts compared, ${all.length - failures.length} match`)
  if (highlighted.length) {
    t.diagnostic(
      `${highlighted.length} of the matching posts have code blocks highlighted by Shiki where the Go site uses chroma ` +
        `(blocks in brackets); the code matches, the highlighting markup does not: ${highlighted.join(', ')}`,
    )
  }
  assert.equal(failures.length, 0, `${failures.length} of ${all.length} posts render differently:\n\n${failures.join('\n\n')}`)
})

test('summaries follow the Go site\'s own examples (internal/routes_blog_test.go)', () => {
  const md = '\nThis is a nice paragraph -- with some _formatting_ and a [link](https://schier.co).\n\n- this\n- is\n- a\n- list\n'
  assert.equal(summarize(md), 'This is a nice paragraph \u2013 with some formatting and a link.')
  const more =
    '\nThis is a nice paragraph -- with some _formatting_ and a [link](https://schier.co).\n\nAnd a second paragraph.\n\n<!--more-->\n\n- this\n- is\n- a\n- list\n'
  assert.equal(summarize(more), 'This is a nice paragraph \u2013 with some formatting and a link. And a second paragraph.')
  assert.equal(summarize(md, 4), 'This is a nice\u2026')
  assert.equal(summarize(md, 40), summarize(md))
})

test('every published post without a summary of its own is summarised as the Go site describes it', async (t) => {
  // The post page's description on the Go site is Summary(content).
  const session = await goSession()
  if (!session) {
    t.skip(`the Go site is not running on ${GO} (docker compose up at the repo root)`)
    return
  }
  const all = (await posts()).filter((p) => p.summary === '')
  assert.ok(all.length > 0, 'no published posts without a summary to compare')
  const failures: string[] = []
  for (const post of all) {
    const res = await fetch(`${GO}/blog/${encodeURIComponent(post.slug)}`)
    const html = await res.text()
    const content = /<meta name="description" content="([^"]*)">/.exec(html)?.[1]
    if (res.status !== 200 || content === undefined) {
      failures.push(`${post.slug}: the Go site's page has no description (status ${res.status})`)
      continue
    }
    const go = decodeEntities(content)
    const port = summarize(post.content)
    if (go !== port) failures.push(`${post.slug} ${firstDifference(go, port)}`)
  }
  t.diagnostic(`${all.length} summaries compared, ${all.length - failures.length} match`)
  assert.equal(failures.length, 0, `${failures.length} of ${all.length} summaries differ:\n\n${failures.join('\n\n')}`)
})
