#!/usr/bin/env node
// Compares two copies of the site page by page, for checking the port
// against the Go site before cutover (BRIEF.md, Verification):
//
//   node scripts/compare-sites.mjs [first] [second] [--strict]
//
// first defaults to the Go site (http://localhost:8084), second to the port
// (http://localhost:3200). Paths are collected from the first: every post in
// its RSS feed (?limit=0, all of them), the links on its home page, blog
// pages, tags page and navigation, and a fixed list of routes and redirects.
// Each path is fetched from both without following redirects, and a table
// gives the status on each side and whether the <title>s and the text of
// <main> (or, for a redirect, the Location) match. Then the two RSS feeds are compared item
// by item, with the sites' addresses normalised and code blocks reduced to
// their text (the Go site highlights with chroma, the port with Shiki).
// Both sites read a copy of the same data, so post ids and dates are
// compared as they are, only the channel's build dates normalised.
//
// Differences the port makes on purpose are listed under KNOWN with the
// reason, and do not count unless --strict. Exits 1 on any other
// difference.
//
// Requests say they are from a bot (a URL in the User-Agent), so neither
// site counts a view or a share, and nothing is posted: crawling changes
// neither database.

const args = process.argv.slice(2)
const strict = args.includes('--strict')
const [FIRST = 'http://localhost:8084', SECOND = 'http://localhost:3200'] = args.filter((a) => !a.startsWith('--')).map((u) => u.replace(/\/+$/, ''))
const UA = 'compare-sites (+https://schier.co)'

/// Differences the port makes on purpose, by path, with why.
const TIES = 'posts dated the same moment are in another order: Go left their order to Postgres (and could split them across two pages), the port orders them by id'
const RECOMMENDED_TIES = 'recommended posts with the same score (most score 0) are in another order: Go left it to Postgres, the port puts the newest first'

const KNOWN = {
  '/blog/drafts': 'Go answers 401 (admin only); the port has no /blog/drafts (the admin is at /admin), so it is a 404',
  '/blog/new': 'Go answers 401 (admin only); the port has no /blog/new (the admin is at /admin), so it is a 404',
  '/login': 'Go’s sign-in page; the port signs in at /admin, so it is a 404',
  '/register': 'Go’s registration page; registration is gone (BRIEF.md, Admin and auth)',
  '/newsletter/unsubscribe/sub_doesnotexist': 'Go answers 500 for an unknown subscriber; the port answers its 404 page',
  '/blog/page/0': 'Go answers 500 (a negative OFFSET); the port answers its 404 page',
  '/blog/simple-vanilla-javascript-typing-carousel':
    'the post writes &lt;span&gt; in its markdown, which blackfriday escaped twice; the port shows the <span> meant (BRIEF.md, Markdown)',
}

const decode = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

async function get(base, path) {
  try {
    const res = await fetch(base + path, { redirect: 'manual', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30000) })
    const body = await res.text()
    return { status: res.status, location: res.headers.get('location'), body, type: res.headers.get('content-type') ?? '' }
  } catch (error) {
    return { status: 0, location: null, body: String(error), type: '' }
  }
}

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', raquo: '»', laquo: '«', bull: '•', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…', times: '×', copy: '©', frasl: '⁄', centerdot: '·', middot: '·', trade: '™', reg: '®', deg: '°' }

/// The words a reader sees in the page's <main>: tags, scripts and every
/// bit of whitespace gone, entities decoded. The cheers messages, which the
/// Go page carried hidden and its script took out, are left out on both.
const mainText = (html) => {
  const main = (/<main[^>]*>([\s\S]*)<\/main>/i.exec(html)?.[1] ?? '').replace(/class="vote-messages"[\s\S]*?(?=<hr class="hr--spaced")/, '')
  return decode(
    main
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<svg[\s\S]*?<\/svg>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&([a-z]+);/gi, (m, name) => NAMED[name] ?? m),
  ).replace(/\s+/g, '')
}

/// Whether two runs of list pages ([a] and [b], each the pages in order)
/// differ only in the order of posts dated the same moment, which the port
/// settles by id and Go left to Postgres: the same text before and after
/// each page's list, the same dates in the same order across the pages,
/// and the same posts under each date. Taken across pages, as a run of
/// posts with one date can cross from one page to the next.
function tieOrderOnly(a, b) {
  const parts = (html) => {
    const main = /<main[^>]*>([\s\S]*)<\/main>/i.exec(html)?.[1] ?? ''
    const [head, ...rest] = main.split(/<div class="content blog-post-preview"[^>]*>/)
    const last = rest.pop() ?? ''
    const cut = last.indexOf('<div class="pagination"')
    const blocks = [...rest, cut < 0 ? last : last.slice(0, cut)].map((block) => ({ date: /<time datetime="([^"]+)"/.exec(block)?.[1] ?? '', text: mainText(`<main>${block}</main>`) }))
    return { frame: mainText(`<main>${head}</main>`) + '|' + (cut < 0 ? '' : mainText(`<main>${last.slice(cut)}</main>`)), blocks }
  }
  const pa = a.map(parts)
  const pb = b.map(parts)
  if (pa.length !== pb.length || pa.some((p, i) => p.frame !== pb[i].frame || p.blocks.length !== pb[i].blocks.length)) return false
  const ba = pa.flatMap((p) => p.blocks)
  const bb = pb.flatMap((p) => p.blocks)
  if (ba.length < 2 || ba.some((block, i) => block.date !== bb[i].date)) return false
  const groups = (blocks) => {
    const by = new Map()
    for (const block of blocks) by.set(block.date, [...(by.get(block.date) ?? []), block.text].sort())
    return JSON.stringify([...by])
  }
  return groups(ba) === groups(bb)
}

/// The page's text with the post cards (recommended posts, which Go ordered
/// by score alone, most of them scoring 0) in a fixed order.
function cardsUnordered(html) {
  const card = /<div class="card card--clicky"[\s\S]*?Read Post (?:&raquo;|»)<\/a>/g
  const cards = [...html.matchAll(card)].map((m) => mainText(`<main>${m[0]}</main>`)).sort()
  let first = true
  return mainText(html.replace(card, () => (first ? ((first = false), cards.join('|')) : '')))
}

const titleOf = (html) => {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  return m ? decode(m[1]).replace(/\s+/g, ' ').trim() : null
}

/// A Location with either site's address taken off, so the two compare.
const place = (location, base) => {
  if (!location) return null
  let l = location
  for (const b of [FIRST, SECOND, base]) l = l.replaceAll(b, '').replaceAll(encodeURIComponent(b), '%BASE%')
  // Go's url.PathEscape of the address, as the share links carry it.
  for (const b of [FIRST, SECOND]) l = l.replaceAll(b.replace(/\//g, '%2F'), '%BASE%')
  return l
}

/// Internal links in [html]: paths on the site, without fragments.
function links(html) {
  const out = new Set()
  for (const m of html.matchAll(/href="([^"]*)"/g)) {
    let href = decode(m[1])
    if (href.startsWith(FIRST)) href = href.slice(FIRST.length)
    if (!href.startsWith('/') || href.startsWith('//')) continue
    href = href.replace(/#.*$/, '')
    if (!href || href.startsWith('/static') || href.startsWith('/media/')) continue
    out.add(href)
  }
  return out
}

async function collect() {
  const paths = new Set()
  const feed = await get(FIRST, '/blog/rss.xml?limit=0')
  const slugs = []
  for (const m of feed.body.matchAll(/<item>[\s\S]*?<link>([^<]*)<\/link>/g)) {
    const path = decode(m[1]).replace(FIRST, '')
    paths.add(path)
    slugs.push(path.replace('/blog/', ''))
  }
  for (const page of ['/', '/blog/page/1', '/blog/tags', '/projects']) {
    const res = await get(FIRST, page)
    for (const link of links(res.body)) paths.add(link)
  }
  const tagsPage = await get(FIRST, '/blog/tags')
  const tag = /href="\/blog\/tags\/([^"]+)"/.exec(tagsPage.body)?.[1] ?? 'programming'
  const slug = slugs[1] ?? 'diy-website-analytics'
  // Pages of the blog until one is past the last.
  let n = 1
  while (n < 100) {
    const res = await get(FIRST, `/blog/page/${n}`)
    paths.add(`/blog/page/${n}`)
    if (res.status !== 200) break
    n++
  }
  const fixed = [
    '/',
    '/blog',
    '/blog/page/0',
    '/blog/tags',
    `/blog/tags/${tag}`,
    '/blog/tags/no-such-tag',
    '/blog/search',
    '/blog/search?query=react',
    '/blog/search?query=JavaScript',
    '/blog/search?query=no-such-words-anywhere',
    `/blog/${slug}`,
    `/blog/${slug}.html`,
    `/blog/2015/01/02/${slug}`,
    `/blog/2015/01/02/${slug}.html`,
    `/post/${slug}`,
    `/tags/${tag}`,
    '/rss.xml',
    '/blog/rss.xml',
    '/blog/rss.xml?limit=5',
    `/blog/share/${slug}/twitter`,
    `/blog/share/${slug}/hn`,
    `/blog/share/${slug}/reddit`,
    `/blog/share/${slug}/email`,
    `/blog/donate/${slug}`,
    '/projects',
    '/books',
    '/newsletter',
    '/newsletter/thanks',
    '/newsletter/unsubscribe/sub_doesnotexist',
    '/robots.txt',
    '/blog/no-such-post',
    '/no/such/page',
    '/blog/drafts',
    '/blog/new',
    '/login',
    '/register',
    '/static/images/social/default.png',
    '/static/favicon/android-chrome-512x512.png',
  ]
  for (const p of fixed) paths.add(p)
  return [...paths]
}

async function pool(items, size, fn) {
  const results = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++
        results[i] = await fn(items[i])
      }
    }),
  )
  return results
}

// ---------------------------------------------------------------------------
// Feeds

/// A feed's items with what may differ between the sites taken out.
function feedItems(xml, base) {
  const items = []
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const field = (name) => new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(m[1])?.[1] ?? ''
    const content = field('content:encoded').replace(/^<!\[CDATA\[|\]\]>$/g, '')
    items.push({
      title: field('title'),
      link: field('link').replaceAll(base, ''),
      // The same database behind both, so ids and dates are compared as they are.
      guid: field('guid').replaceAll(base, ''),
      pubDate: field('pubDate'),
      author: field('author'),
      description: field('description'),
      content: normaliseHtml(content),
    })
  }
  return items
}

/// HTML with code blocks as their text, void elements written one way
/// (blackfriday wrote <hr />, the port writes <hr>; the same HTML) and
/// whitespace between tags gone.
function normaliseHtml(html) {
  return html
    .replace(/<(area|br|col|embed|hr|img|input|link|meta|source|track|wbr)\b([^>]*?)\s*\/?>/g, '<$1$2>')
    .replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/g, (_, inner) => `<pre>${decode(inner.replace(/<[^>]+>/g, '')).trimEnd()}</pre>`)
    .replace(/>\s+</g, '><')
    .trim()
}

function channel(xml, base) {
  const head = xml.split('<item>')[0].replaceAll(base, 'BASE')
  return head.replace(/<(pubDate|lastBuildDate)>[^<]*</g, '<$1>DATE<')
}

function firstDifference(a, b) {
  let i = 0
  while (i < a.length && a[i] === b[i]) i++
  return `at ${i}: first «${a.slice(Math.max(0, i - 60), i + 80)}»\n        second «${b.slice(Math.max(0, i - 60), i + 80)}»`
}

async function compareFeeds() {
  const [a, b] = await Promise.all([get(FIRST, '/blog/rss.xml'), get(SECOND, '/blog/rss.xml')])
  const problems = []
  if (channel(a.body, FIRST) !== channel(b.body, SECOND)) problems.push(`channel: ${firstDifference(channel(a.body, FIRST), channel(b.body, SECOND))}`)
  const ia = feedItems(a.body, FIRST)
  const ib = feedItems(b.body, SECOND)
  if (ia.length !== ib.length) problems.push(`items: ${ia.length} and ${ib.length}`)
  for (let i = 0; i < Math.min(ia.length, ib.length); i++) {
    for (const key of Object.keys(ia[i])) {
      if (ia[i][key] !== ib[i][key]) problems.push(`item ${i + 1} (${ia[i].link}) ${key}: ${firstDifference(ia[i][key], ib[i][key])}`)
    }
  }
  return { problems, count: ia.length }
}

// ---------------------------------------------------------------------------

const paths = await collect()
const rows = await pool(paths, 6, async (path) => {
  const [a, b] = await Promise.all([get(FIRST, path), get(SECOND, path)])
  let same = a.status === b.status
  let what = ''
  let known = KNOWN[path]
  if (a.status >= 300 && a.status < 400) {
    const la = place(a.location, FIRST)
    const lb = place(b.location, SECOND)
    if (la !== lb) {
      same = false
      what = `location ${la} / ${lb}`
    } else what = `→ ${la}`
  } else if (a.type.includes('html') || b.type.includes('html')) {
    const ta = titleOf(a.body)
    const tb = titleOf(b.body)
    const xa = mainText(a.body)
    const xb = mainText(b.body)
    if (ta !== tb) {
      same = false
      what = `title «${ta}» / «${tb}»`
    } else if (xa !== xb && tieOrderOnly([a.body], [b.body])) {
      same = false
      known = TIES
      what = 'same posts, ties in another order'
    } else if (xa !== xb && cardsUnordered(a.body) === cardsUnordered(b.body)) {
      same = false
      known = RECOMMENDED_TIES
      what = 'same recommended posts, ties in another order'
    } else if (xa !== xb) {
      same = false
      what = `text ${firstDifference(xa, xb)}`
    } else what = 'title and text same'
  } else if (a.status === 200 && b.status === 200) {
    what = a.type.split(';')[0] === b.type.split(';')[0] ? a.type.split(';')[0] : `type ${a.type} / ${b.type}`
    if (a.type.split(';')[0] !== b.type.split(';')[0]) same = false
  }
  return { path, a: a.status, b: b.status, same, what, known, bodies: path.startsWith('/blog/page/') ? [a.body, b.body] : null }
})

// The blog's pages, taken together for posts dated the same moment.
const pages = rows.filter((r) => r.bodies && r.a === 200).sort((x, y) => Number(x.path.split('/').pop()) - Number(y.path.split('/').pop()))
if (pages.some((r) => !r.same && !r.known) && tieOrderOnly(pages.map((r) => r.bodies[0]), pages.map((r) => r.bodies[1]))) {
  for (const r of pages) {
    if (r.same) continue
    r.known = TIES
    r.what = 'same posts across the pages, ties in another order'
  }
}

rows.sort((x, y) => x.path.localeCompare(y.path))
const width = Math.min(60, Math.max(...rows.map((r) => r.path.length)))
console.log(`${'path'.padEnd(width)}  first  second  ${''}`)
for (const r of rows) {
  const mark = r.same ? '  ' : r.known ? '~ ' : '✗ '
  console.log(`${mark}${r.path.slice(0, width).padEnd(width)}  ${String(r.a).padEnd(5)}  ${String(r.b).padEnd(6)}  ${r.what}`)
}

const different = rows.filter((r) => !r.same)
const known = different.filter((r) => r.known)
const unknown = different.filter((r) => !r.known)
console.log(`\n${rows.length} paths, ${different.length} different (${known.length} known, ${unknown.length} not)`)
if (known.length) {
  console.log('\nKnown differences:')
  const byReason = new Map()
  for (const r of known) byReason.set(r.known, [...(byReason.get(r.known) ?? []), r.path])
  for (const [reason, list] of byReason) console.log(`  ${list.length > 3 ? `${list.length} paths (${list.slice(0, 3).join(', ')}, ...)` : list.join(', ')}: ${reason}`)
}

const feeds = await compareFeeds()
console.log(`\nRSS feeds (${feeds.count} items, addresses normalised, code blocks as text): ${feeds.problems.length ? `${feeds.problems.length} differences` : 'the same'}`)
for (const p of feeds.problems) console.log(`  ${p}`)

const failed = unknown.length + feeds.problems.length + (strict ? known.length : 0)
process.exit(failed ? 1 : 0)
