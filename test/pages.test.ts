// The public pages and routes:
//   node --test test/pages.test.ts
//
// Over a scratch database it makes and drops, with twelve listed posts, a
// draft and an unlisted post: the read queries and counters
// (src/server/posts.ts) called directly; the feed, the redirects, the
// counters' routes and the subscription form through their route handlers;
// and the pages themselves from a dev server of the site's own, started on
// a free port over the scratch database.

import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { handler, root, scratch, signedIn, site } from './help.ts'

type Posts = typeof import('../src/server/posts.ts')
type Mail = typeof import('../src/server/mail.ts')
type Db = typeof import('../src/server/db.ts')

const BASE = 'https://schier.test'
const DAY = 24 * 60 * 60 * 1000
const BOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

let s: Awaited<ReturnType<typeof scratch>>
let app: Awaited<ReturnType<typeof site>>
let posts: Posts
let mail: Mail
let db: Db['db']
let newId: Db['newId']

/// Twelve listed posts, newest first: listed-1 is a day old, listed-12
/// twelve days. Three carry the tag "tagx", one the tag "tutorial".
const LISTED = Array.from({ length: 12 }, (_, i) => `listed-${i + 1}`)

before(async () => {
  process.env.BASE_URL = BASE
  delete process.env.RESEND_API_KEY
  s = await scratch('pages')
  app = await site(s.url)
  posts = await app.load<Posts>('/src/server/posts.ts')
  mail = await app.load<Mail>('/src/server/mail.ts')
  ;({ db, newId } = await app.load<Db>('/src/server/db.ts'))
  const now = Date.now()
  for (const [i, slug] of LISTED.entries()) {
    await post(slug, {
      date: new Date(now - (i + 1) * DAY),
      tags: i < 3 ? ['tagx', 'programming'] : i === 5 ? ['tutorial'] : ['life'],
      content: i === 0 ? 'The opening paragraph with a needle in it.\n\n## A heading\n\nMore words here.' : `Words for ${slug}.\n\nAnd a second paragraph.`,
    })
  }
  await post('a-draft', { published: false, date: new Date(now - 2 * DAY), tags: ['drafty'] })
  await post('an-unlisted-one', { unlisted: true, date: new Date(now - 3 * DAY / 2), tags: ['hidden-tag'], content: 'Unlisted needle in a haystack.' })
})

after(async () => {
  mail?.setMailer(null)
  await app?.close()
  await s?.drop()
})

async function post(slug: string, fields: { published?: boolean; unlisted?: boolean; date?: Date; tags?: string[]; content?: string } = {}) {
  return db.blogPost.create({
    data: {
      id: newId('pst_'),
      slug,
      title: `Post ${slug}`,
      content: fields.content ?? `Words for ${slug}.`,
      image: '',
      published: fields.published ?? true,
      unlisted: fields.unlisted ?? false,
      date: fields.date ?? new Date(),
      tags: fields.tags ?? [],
    },
  })
}

const row = (slug: string) => db.blogPost.findUniqueOrThrow({ where: { slug } })

// ---------------------------------------------------------------------------

describe('the read queries', () => {
  test('recent posts are the newest listed ones, without drafts or unlisted posts', async () => {
    assert.deepEqual(
      (await posts.recentPosts(5)).map((p) => p.slug),
      LISTED.slice(0, 5),
    )
    assert.equal((await posts.recentPosts(0)).length, 12, 'a limit of 0 is every listed post')
  })

  test('the blog pages ten at a time, as Go did', async () => {
    const one = (await posts.postsPage(1))!
    assert.deepEqual(one.posts.map((p) => p.slug), LISTED.slice(0, 10))
    assert.deepEqual([one.previous, one.page, one.next], [1, 1, 2])
    const two = (await posts.postsPage(2))!
    assert.deepEqual(two.posts.map((p) => p.slug), LISTED.slice(10))
    assert.deepEqual([two.previous, two.page, two.next], [1, 2, 2])
    assert.equal(await posts.postsPage(3), null, 'a page past the last is a 404')
    assert.equal(await posts.postsPage(0), null)
  })

  test('a tag page has its listed posts, and the tag counts leave out drafts and unlisted posts', async () => {
    assert.deepEqual((await posts.postsPage(1, 'tagx'))!.posts.map((p) => p.slug), LISTED.slice(0, 3))
    assert.deepEqual((await posts.postsPage(1, 'hidden-tag'))!.posts, [])
    assert.deepEqual(await posts.tagCounts(), [
      { name: 'life', count: 8 },
      { name: 'tagx', count: 3 },
      { name: 'programming', count: 3 },
      { name: 'tutorial', count: 1 },
    ])
  })

  test('search matches content, titles and tags, ignoring case, and leaves out unlisted posts', async () => {
    assert.deepEqual((await posts.searchPosts('NEEDLE')).map((p) => p.slug), ['listed-1'])
    assert.deepEqual((await posts.searchPosts('post listed-1')).map((p) => p.slug), ['listed-1', 'listed-10', 'listed-11', 'listed-12'])
    assert.deepEqual((await posts.searchPosts('TUTORIAL')).map((p) => p.slug), ['listed-6'])
    assert.deepEqual(await posts.searchPosts(''), [])
  })

  test('an unlisted post and a draft are found by slug', async () => {
    assert.equal((await posts.postBySlug('an-unlisted-one'))?.unlisted, true)
    assert.equal((await posts.postBySlug('a-draft'))?.published, false)
  })

  test('words and scores are counted as Go counted them', () => {
    assert.equal(posts.wordCount('Some **bold** words and a [link](https://x.y) here.'), 6)
    assert.equal(posts.readTime(199), 1)
    assert.equal(posts.readTime(400), 3)
    assert.equal(posts.calculateScore(DAY / 2, 0, 0, 500), 999999)
    assert.equal(posts.calculateScore(400 * DAY, 10, 10, 500), 0)
    assert.equal(posts.calculateScore(9 * DAY, 1, 600, 500), 100)
    assert.equal(posts.calculateScore(9 * DAY, 1, 600, 100), 50)
  })
})

describe('the counters', () => {
  test('a view counts for a reader, not for a bot, the admin or a draft', async () => {
    await db.blogPost.update({ where: { slug: 'listed-4' }, data: { views: 99 } })
    const before = (await row('listed-4')).views
    await posts.countView(await row('listed-4'), BROWSER, false)
    await posts.countView(await row('listed-4'), BOT, false)
    await posts.countView(await row('listed-4'), BROWSER, true)
    await posts.countView(await row('a-draft'), BROWSER, false)
    const after = await row('listed-4')
    assert.equal(after.views, before + 1)
    assert.equal((await row('a-draft')).views, 0)
    // 100 views over 4 days and a day, halved for under 200 words.
    assert.equal(after.score, 10, 'the score is worked out again')
  })

  test('a view does not count as an edit', async () => {
    const before = await row('listed-5')
    await posts.countView(before, BROWSER, false)
    assert.equal((await row('listed-5')).editedAt.getTime(), before.editedAt.getTime())
  })

  test('a cheer counts up to fifty from one reader, and not on a draft', async () => {
    assert.equal(await posts.vote('listed-7', 0), 1)
    assert.equal(await posts.vote('listed-7', 1), 2)
    assert.equal(await posts.vote('listed-7', 51), null)
    assert.equal(await posts.vote('a-draft', 0), null)
    assert.equal(await posts.vote('no-such-post', 0), undefined)
    const p = await row('listed-7')
    assert.deepEqual([p.votesTotal, p.votesUsers], [2, 1], 'only a first cheer counts a voter')
  })

  test('the bot test takes crawlers for bots and browsers for people', () => {
    assert.equal(posts.isBot(BOT), true)
    assert.equal(posts.isBot('Twitterbot/1.0'), true)
    assert.equal(posts.isBot('Some-Crawler (+https://example.com/bot)'), true)
    assert.equal(posts.isBot(BROWSER), false)
    assert.equal(posts.isBot('curl/8.4.0'), false)
  })
})

// ---------------------------------------------------------------------------

const get = (path: string, init: RequestInit = {}) => new Request(BASE + path, init)

async function call(route: string, method: string, request: Request, params: Record<string, string> = {}) {
  return (await handler(app.load, route, method))({ request, params })
}

describe('the feed', () => {
  test('is well-formed XML with the newest twenty listed posts, as Go wrote it', async () => {
    const res = await call('/src/routes/blog/rss[.]xml.ts', 'GET', get('/blog/rss.xml'))
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'application/xml')
    const xml = await res.text()
    assertWellFormed(xml)
    assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">'))
    const links = [...xml.matchAll(/<item>\s*<title>[^<]*<\/title>\s*<link>([^<]*)<\/link>/g)].map((m) => m[1])
    assert.deepEqual(links, LISTED.map((slug) => `${BASE}/blog/${slug}`))
    const first = await row('listed-1')
    assert.match(xml, new RegExp(`<guid>${BASE}/blog/${first.id}</guid>`))
    assert.match(xml, /<content:encoded><!\[CDATA\[<p>The opening paragraph/)
    assert.match(xml, /<pubDate>\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} \+0000<\/pubDate>/)
  })

  test('takes a limit', async () => {
    const xml = await (await call('/src/routes/blog/rss[.]xml.ts', 'GET', get('/blog/rss.xml?limit=5'))).text()
    assert.equal(xml.match(/<item>/g)?.length, 5)
  })
})

describe('the redirects', () => {
  const cases: [string, string, Request, Record<string, string>, number, string][] = [
    ['/rss.xml', '/src/routes/rss[.]xml.ts', get('/rss.xml'), {}, 303, '/blog/rss.xml'],
    ['/blog', '/src/routes/blog/index.tsx', get('/blog'), {}, 303, '/blog/page/1'],
    ['/tags/{tag}', '/src/routes/tags/$tag.ts', get('/tags/js'), { tag: 'js' }, 301, '/blog/tags/js'],
    ['/post/{slug}', '/src/routes/post/$slug.ts', get('/post/listed-1'), { slug: 'listed-1' }, 301, '/blog/listed-1'],
    [
      '/blog/{y}/{m}/{d}/{slug}.html',
      '/src/routes/blog/$year/$month/$day/$slug.ts',
      get('/blog/2013/01/02/listed-1.html'),
      { year: '2013', month: '01', day: '02', slug: 'listed-1.html' },
      301,
      '/blog/listed-1',
    ],
  ]
  for (const [name, route, request, params, status, location] of cases) {
    test(`${name} goes to ${location}`, async () => {
      const res = await call(route, 'GET', request, params)
      assert.equal(res.status, status)
      assert.equal(res.headers.get('location'), location)
    })
  }

  test('a share link counts the share and goes on to the platform', async () => {
    const res = await call('/src/routes/blog/share/$slug/$platform.ts', 'GET', get('/blog/share/listed-2/twitter', { headers: { 'user-agent': BROWSER } }), {
      slug: 'listed-2',
      platform: 'twitter',
    })
    assert.equal(res.status, 303)
    assert.equal(res.headers.get('location'), `https://twitter.com/share?url=https:%2F%2Fschier.test%2Fblog%2Flisted-2&text=Post%20listed-2&via=GregorySchier`)
    assert.equal((await row('listed-2')).shares, 1)
    await call('/src/routes/blog/share/$slug/$platform.ts', 'GET', get('/blog/share/listed-2/hn', { headers: { 'user-agent': BOT } }), { slug: 'listed-2', platform: 'hn' })
    assert.equal((await row('listed-2')).shares, 1, 'a bot is not counted')
  })

  test('the donate link counts and goes to GitHub Sponsors', async () => {
    const res = await call('/src/routes/blog/donate/$slug.ts', 'GET', get('/blog/donate/listed-6', { headers: { 'user-agent': BROWSER } }), { slug: 'listed-6' })
    assert.equal(res.status, 303)
    assert.equal(res.headers.get('location'), 'https://github.com/sponsors/gschier')
    assert.equal((await row('listed-6')).shares, 1)
  })

  test('robots.txt is the Go site’s', async () => {
    const text = await (await call('/src/routes/robots[.]txt.ts', 'GET', get('/robots.txt'))).text()
    assert.match(text, /^\nUser-agent: \*\nDisallow: \/open\n/)
  })
})

describe('the subscription form', () => {
  const form = (fields: Record<string, string>) =>
    get('/forms/newsletter/subscribe', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() })

  test('subscribes the address, sends the welcome and goes to the thanks page', async () => {
    const recorder = new mail.RecordingMailer()
    mail.setMailer(recorder)
    const res = await call('/src/routes/forms/newsletter/subscribe.ts', 'POST', form({ email: 'reader@example.com', username: '' }))
    assert.equal(res.status, 303)
    assert.equal(res.headers.get('location'), '/newsletter/thanks')
    const subscriber = await db.newsletterSubscriber.findFirst({ where: { email: 'reader@example.com' } })
    assert.ok(subscriber)
    assert.equal(recorder.sent.length, 1)
  })

  test('a filled-in honeypot goes to the thanks page and subscribes nobody', async () => {
    const res = await call('/src/routes/forms/newsletter/subscribe.ts', 'POST', form({ email: 'bot@example.com', username: 'gotcha' }))
    assert.equal(res.status, 303)
    assert.equal(await db.newsletterSubscriber.count({ where: { email: 'bot@example.com' } }), 0)
  })

  test('no address is a 400', async () => {
    const res = await call('/src/routes/forms/newsletter/subscribe.ts', 'POST', form({ email: '' }))
    assert.equal(res.status, 400)
  })
})

// ---------------------------------------------------------------------------

describe('the pages, from a dev server', () => {
  let server: ChildProcess | undefined
  let base = ''
  let output = ''

  before(async () => {
    const port = await freePort()
    base = `http://localhost:${port}`
    server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'dev', '--port', String(port), '--strictPort'], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: s.url, BASE_URL: base },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    server.stdout!.on('data', (d) => (output += d))
    server.stderr!.on('data', (d) => (output += d))
    const deadline = Date.now() + 60000
    while (Date.now() < deadline) {
      try {
        if ((await fetch(`${base}/debug/health`)).ok) return
      } catch {
        // Not up yet.
      }
      await new Promise((r) => setTimeout(r, 250))
    }
    throw new Error(`the dev server did not start:\n${output}`)
  })

  after(() => {
    server?.kill('SIGTERM')
  })

  const page = async (path: string, headers: Record<string, string> = {}) => {
    const res = await fetch(base + path, { redirect: 'manual', headers: { 'user-agent': BOT, ...headers } })
    return { status: res.status, location: res.headers.get('location'), html: await res.text() }
  }
  const slugs = (html: string, kind: 'card' | 'preview') =>
    [...html.matchAll(kind === 'card' ? /<div class="card__body"[^>]*>Post ([\w-]+)</g : /<h2[^>]*><a href="\/blog\/([\w-]+)"/g)].map((m) => m[1])

  test('the home page lists the five newest posts', async () => {
    const { status, html } = await page('/')
    assert.equal(status, 200)
    assert.deepEqual(slugs(html, 'card'), LISTED.slice(0, 5))
    assert.match(html, /<title>Gregory Schier<\/title>/)
  })

  test('the blog pages, with Previous and Next', async () => {
    const one = await page('/blog/page/1')
    assert.deepEqual(slugs(one.html, 'preview'), LISTED.slice(0, 10))
    assert.match(one.html, /href="\/blog\/page\/2"[^>]*>Next/)
    assert.doesNotMatch(one.html, /an-unlisted-one|a-draft/)
    const two = await page('/blog/page/2')
    assert.deepEqual(slugs(two.html, 'preview'), LISTED.slice(10))
    assert.match(two.html, /href="\/blog\/page\/1"[^>]*>« Previous/)
    assert.match(two.html, /<title>Blog Page 2 – Gregory Schier<\/title>/)
    assert.equal((await page('/blog/page/3')).status, 404)
  })

  test('a tag page and the tags page', async () => {
    const tag = await page('/blog/tags/tagx')
    assert.equal(tag.status, 200)
    assert.deepEqual(slugs(tag.html, 'preview'), LISTED.slice(0, 3))
    assert.match(tag.html, /<title>Blog tagx Tag – Gregory Schier<\/title>/)
    const tags = await page('/blog/tags')
    assert.match(tags.html.replace(/<!-- -->/g, ''), /life \(8\)/)
    assert.doesNotMatch(tags.html, /hidden-tag|drafty/)
  })

  test('a draft is a 404 for the public and shows to the admin', async () => {
    const pub = await page('/blog/a-draft')
    assert.equal(pub.status, 404)
    assert.match(pub.html, /Page Not Found/)
    const admin = await page('/blog/a-draft', { cookie: (await signedIn(s)).cookie })
    assert.equal(admin.status, 200)
    assert.match(admin.html, /&bull; Draft/)
  })

  test('an unlisted post is hidden from the lists but reachable by its slug', async () => {
    const res = await page('/blog/an-unlisted-one')
    assert.equal(res.status, 200)
    assert.match(res.html, /<h1>Post an-unlisted-one<\/h1>/)
    assert.doesNotMatch((await page('/')).html, /an-unlisted-one/)
    assert.doesNotMatch((await page('/blog/search?query=needle')).html, /an-unlisted-one/)
  })

  test('a post shows its meta, cheers, tags and the tutorial notice', async () => {
    const { html } = await page('/blog/listed-6')
    assert.match(html, /<title>Post listed-6 – Gregory Schier<\/title>/)
    assert.match(html, /<span title="\d+ words">&bull; 1 min read<\/span>/)
    assert.match(html, /class="clap-button"/)
    assert.match(html, /href="\/blog\/tags\/tutorial"/)
    assert.match(html, /sponsoring my work on GitHub/)
  })

  test('the old .html address and unknown pages', async () => {
    const html = await page('/blog/listed-1.html')
    assert.equal(html.status, 302)
    assert.equal(new URL(html.location!, base).pathname, '/blog/listed-1')
    const missing = await page('/no/such/page')
    assert.equal(missing.status, 404)
    assert.deepEqual(slugs(missing.html, 'card'), LISTED.slice(0, 6))
  })
})

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, () => {
      const { port } = probe.address() as { port: number }
      probe.close(() => resolve(port))
    })
  })
}

/// A small check that [xml] is well-formed: one root, every element closed
/// in order, and no bare & or < outside CDATA.
function assertWellFormed(xml: string) {
  const rest = xml.replace(/^<\?xml[^>]*\?>/, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
  assert.doesNotMatch(rest, /&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/, 'a bare & outside CDATA')
  const stack: string[] = []
  let roots = 0
  for (const m of rest.matchAll(/<(\/?)([\w:.-]+)([^<>]*?)(\/?)>|</g)) {
    assert.ok(m[2], `a bare < at ${m.index}`)
    const [, close, name, , selfClose] = m
    if (close) assert.equal(stack.pop(), name, `</${name}> closes the wrong element`)
    else if (!selfClose) {
      if (stack.length === 0) roots++
      stack.push(name!)
    }
  }
  assert.deepEqual(stack, [], 'every element is closed')
  assert.equal(roots, 1, 'one root element')
}
