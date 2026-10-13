// The admin MCP and the post actions under it:
//   node --test test/mcp.test.ts
//
// Over a scratch database it makes and drops, with a RecordingMailer in
// place of Resend and storage() in a scratch directory (no bucket). The
// server (src/server/mcp/server.ts) is driven through the MCP SDK's own
// client over an in-memory transport, as an agent would call it; the route
// (src/routes/mcp.ts) is called as the server calls it, for its auth and
// to see it answer over HTTP.

import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, beforeEach, describe, test } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { handler, scratch, site, type Handler } from './help.ts'

type Mail = typeof import('../src/server/mail.ts')
type Newsletter = typeof import('../src/server/newsletter.ts')
type Server = typeof import('../src/server/mcp/server.ts')
type Storage = typeof import('../src/server/storage.ts')

let s: Awaited<ReturnType<typeof scratch>>
let app: Awaited<ReturnType<typeof site>>
let mail: Mail
let newsletter: Newsletter
let mcp: Server
let store: Storage
let recorder: InstanceType<Mail['RecordingMailer']>
let client: Client
let route: Handler
let assets: string

const AWS = ['AWS_ENDPOINT_URL', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET_NAME', 'AWS_DEFAULT_REGION'] as const
const savedToken = process.env.MCP_TOKEN

before(async () => {
  delete process.env.RESEND_API_KEY
  for (const k of AWS) delete process.env[k]
  delete process.env.ASSETS_FALLBACK_URL
  assets = await mkdtemp(join(tmpdir(), 'sc-mcp-media-'))
  process.env.ASSETS_DIR = assets
  process.env.BASE_URL = 'https://schier.test/'
  s = await scratch('mcp')
  app = await site(s.url)
  mail = await app.load<Mail>('/src/server/mail.ts')
  newsletter = await app.load<Newsletter>('/src/server/newsletter.ts')
  mcp = await app.load<Server>('/src/server/mcp/server.ts')
  store = await app.load<Storage>('/src/server/storage.ts')
  route = await handler(app.load, '/src/routes/mcp.ts', 'POST')

  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await mcp.createAdminServer().connect(serverSide)
  client = new Client({ name: 'test', version: '0.0.0' })
  await client.connect(clientSide)
})

beforeEach(async () => {
  recorder = new mail.RecordingMailer()
  mail.setMailer(recorder)
  await s.rows('DELETE FROM newsletter_sends')
  await s.rows('DELETE FROM newsletter_subscribers')
  await s.rows('DELETE FROM blog_posts')
})

after(async () => {
  if (savedToken === undefined) delete process.env.MCP_TOKEN
  else process.env.MCP_TOKEN = savedToken
  await client?.close()
  mail?.setMailer(null)
  await app?.close()
  await s?.drop()
  if (assets) await rm(assets, { recursive: true, force: true })
})

type Result = { isError?: boolean; content: { type: string; text: string }[] }

/// The tool [name]'s answer, parsed; fails the test if it is an error.
async function call<T = any>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const result = (await client.callTool({ name, arguments: args })) as Result
  assert.ok(!result.isError, `${name} failed: ${result.content[0]?.text}`)
  return JSON.parse(result.content[0]!.text) as T
}

/// The tool [name]'s error message; fails the test if it did not fail.
async function refused(name: string, args: Record<string, unknown> = {}): Promise<string> {
  const result = (await client.callTool({ name, arguments: args })) as Result
  assert.equal(result.isError, true, `${name} did not fail: ${result.content[0]?.text}`)
  const message = result.content[0]!.text
  assert.doesNotMatch(message, /\n\s+at /, 'a plain message, not a stack')
  return message
}

const near = (iso: string, ms = 10_000) => Math.abs(new Date(iso).getTime() - Date.now()) < ms

test('every tool is listed with a title, a description and a schema', async () => {
  const { tools } = await client.listTools()
  assert.deepEqual(tools.map((t) => t.name).sort(), [
    'create_post',
    'delete_post',
    'get_post',
    'list_posts',
    'newsletter_status',
    'publish_post',
    'render_preview',
    'send_newsletter',
    'unlist_post',
    'unpublish_post',
    'update_post',
    'upload_image',
  ])
  for (const t of tools) {
    assert.ok(t.title, `${t.name} has a title`)
    assert.ok((t.description ?? '').length > 40, `${t.name} has a description`)
    assert.equal(t.inputSchema.type, 'object')
  }
})

test('create_post makes a draft with a slug from the title, and get_post finds it by slug or id', async () => {
  const created = await call('create_post', {
    title: 'the  art of writing a post',
    content: '# Hello\r\n\r\nSome words.',
    tags: ['JavaScript', ' Writing ', 'javascript', ''],
  })
  assert.match(created.id, /^pst_[a-z0-9]{12}$/)
  assert.equal(created.title, 'The Art of Writing a Post')
  assert.equal(created.slug, 'the-art-of-writing-a-post')
  assert.equal(created.content, '# Hello\n\nSome words.')
  assert.deepEqual(created.tags, ['javascript', 'writing'])
  assert.equal(created.published, false)
  assert.equal(created.unlisted, false)
  assert.ok(near(created.date))

  const bySlug = await call('get_post', { post: 'the-art-of-writing-a-post' })
  const byId = await call('get_post', { post: created.id })
  assert.deepEqual(bySlug, created)
  assert.deepEqual(byId, created)

  // Slugs as gosimple/slug made them.
  assert.equal((await call('create_post', { title: 'Rock & Roll @ "Home" — Part 2' })).slug, 'rock-and-roll-at-home-part-2')
  assert.equal((await call('create_post', { title: 'Café Déjà Vu' })).slug, 'cafe-deja-vu')
  assert.equal((await call('create_post', { title: 'x', slug: 'my-own_slug2' })).slug, 'my-own_slug2')

  assert.match(await refused('create_post', { title: 'Another', slug: 'the-art-of-writing-a-post' }), /already has the slug "the-art-of-writing-a-post"/)
  assert.match(await refused('create_post', { title: 'Bad', slug: 'Not A Slug' }), /not a usable slug/)
  assert.match(await refused('create_post', { content: 'no title' }), /needs a title or a slug/)
  assert.match(await refused('get_post', { post: 'nope' }), /No post has the slug or id "nope"/)
})

test('update_post changes what it is given, refuses a slug another post has, and moves editedAt only for content', async () => {
  const first = await call('create_post', { title: 'First post' })
  const second = await call('create_post', { title: 'Second post', content: 'Words.' })

  assert.match(await refused('update_post', { post: second.id, slug: 'first-post' }), /Another post already has the slug "first-post"/)
  assert.equal((await call('get_post', { post: second.id })).slug, 'second-post')

  const retitled = await call('update_post', { post: second.id, title: 'a better title', tags: ['Go'], summary: 'In short.', stage: 2 })
  assert.equal(retitled.title, 'A Better Title')
  assert.equal(retitled.slug, 'second-post', 'the slug stays unless one is given')
  assert.deepEqual(retitled.tags, ['go'])
  assert.equal(retitled.summary, 'In short.')
  assert.equal(retitled.stage, 2)
  assert.equal(retitled.content, 'Words.')
  assert.equal(retitled.editedAt, second.editedAt, 'editedAt stays when the content does not change')

  // An empty slug on a draft makes one from the title, as Go did.
  const reslugged = await call('update_post', { post: second.id, slug: '' })
  assert.equal(reslugged.slug, 'a-better-title')

  await new Promise((r) => setTimeout(r, 20))
  const edited = await call('update_post', { post: 'a-better-title', content: 'New words.' })
  assert.equal(edited.content, 'New words.')
  assert.ok(new Date(edited.editedAt) > new Date(second.editedAt), 'editedAt moves with the content')

  // A published post keeps its slug.
  await call('update_post', { post: first.id, content: 'Something.' })
  await call('publish_post', { post: first.id })
  assert.match(await refused('update_post', { post: first.id, slug: 'renamed' }), /is published, so its slug cannot change/)
  assert.match(await refused('update_post', { post: first.id, date: 'tomorrow' }), /is not a date/)
})

test('publish_post publishes and dates the post now; unpublish_post makes it a draft again', async () => {
  const draft = await call('create_post', { title: 'Old idea', content: 'Written long ago.', date: '2020-01-02T03:04:05Z' })
  assert.equal(draft.date, '2020-01-02T03:04:05.000Z')
  assert.match(await refused('publish_post', { post: (await call('create_post', { title: 'Empty' })).id }), /has no content/)

  const published = await call('publish_post', { post: 'old-idea' })
  assert.equal(published.published, true)
  assert.ok(near(published.date), `dated now, not ${published.date}`)

  // Publishing again leaves it as it is.
  const again = await call('publish_post', { post: 'old-idea' })
  assert.equal(again.date, published.date)

  const unpublished = await call('unpublish_post', { post: 'old-idea' })
  assert.equal(unpublished.published, false)
  assert.equal(unpublished.date, published.date)
})

test('unlist_post hides a post from lists and unlisted false brings it back', async () => {
  await call('create_post', { title: 'Shown', content: 'a' })
  await call('create_post', { title: 'Hidden', content: 'b' })
  await call('publish_post', { post: 'shown' })
  await call('publish_post', { post: 'hidden' })

  const unlisted = await call('unlist_post', { post: 'hidden' })
  assert.equal(unlisted.unlisted, true)
  const listed = await call('list_posts', { unlisted: 'exclude' })
  assert.deepEqual(listed.posts.map((p: { slug: string }) => p.slug), ['shown'])
  assert.deepEqual((await call('list_posts', { unlisted: 'only' })).posts.map((p: { slug: string }) => p.slug), ['hidden'])

  assert.equal((await call('unlist_post', { post: 'hidden', unlisted: false })).unlisted, false)
  assert.equal((await call('list_posts', { unlisted: 'exclude' })).total, 2)
})

test('delete_post deletes for good', async () => {
  const post = await call('create_post', { title: 'Gone soon', content: 'Bye.' })
  const { deleted } = await call('delete_post', { post: 'gone-soon' })
  assert.equal(deleted.id, post.id)
  assert.equal(deleted.content, 'Bye.')
  assert.match(await refused('get_post', { post: post.id }), /No post has/)
  assert.match(await refused('delete_post', { post: post.id }), /No post has/)
  assert.deepEqual(await s.rows('SELECT id FROM blog_posts'), [])
})

test('list_posts filters drafts, searches, pages, and leaves out content', async () => {
  for (const [title, publish] of [
    ['Alpha', true],
    ['Bravo', false],
    ['Charlie', true],
    ['Delta draft', false],
  ] as const) {
    await call('create_post', { title, content: `About ${title.toLowerCase()}.\n\nMore words.`, tags: publish ? ['live'] : [] })
    if (publish) await call('publish_post', { post: title.toLowerCase() })
    await new Promise((r) => setTimeout(r, 5))
  }

  const all = await call('list_posts')
  assert.equal(all.total, 4)
  assert.ok(all.posts.every((p: object) => !('content' in p)), 'summaries, not content')
  assert.equal(all.posts.find((p: { slug: string }) => p.slug === 'alpha').summary, 'About alpha.')

  const live = await call('list_posts', { drafts: 'exclude' })
  assert.deepEqual(live.posts.map((p: { slug: string }) => p.slug), ['charlie', 'alpha'])
  const drafts = await call('list_posts', { drafts: 'only' })
  assert.deepEqual(drafts.posts.map((p: { slug: string }) => p.slug).sort(), ['bravo', 'delta-draft'])

  assert.deepEqual((await call('list_posts', { query: 'CHARLIE' })).posts.map((p: { slug: string }) => p.slug), ['charlie'])
  assert.equal((await call('list_posts', { query: 'live' })).total, 2, 'a tag matches')

  const page = await call('list_posts', { limit: 1, offset: 1, drafts: 'exclude' })
  assert.equal(page.total, 2)
  assert.deepEqual(page.posts.map((p: { slug: string }) => p.slug), ['alpha'])

  assert.match(await refused('list_posts', { drafts: 'some' }), /drafts/)
})

test('render_preview returns the HTML and the summary, saving nothing', async () => {
  const preview = await call('render_preview', { markdown: 'Some **bold** words and a [link](https://example.com).\n\n## A heading\n\nMore.' })
  assert.match(preview.html, /<strong>bold<\/strong>/)
  assert.match(preview.html, /<a href="https:\/\/example.com" target="_blank"/)
  assert.match(preview.html, /<h2 id="a-heading">A heading<\/h2>/)
  assert.equal(preview.summary, 'Some bold words and a link.')
  assert.deepEqual(await s.rows('SELECT id FROM blog_posts'), [])
})

test('upload_image stores the image and returns its /media/ path', async () => {
  const png = Buffer.from('\x89PNG\r\n\x1a\nnot really a png, but bytes all the same', 'latin1')
  const from = Math.floor(Date.now() / 1000)
  const uploaded = await call('upload_image', { data: png.toString('base64'), contentType: 'image/png', fileName: 'Screen Shot.png' })
  const match = /^\/media\/(images\/a\/(\d+)\.png)$/.exec(uploaded.path)
  assert.ok(match, uploaded.path)
  assert.ok(Number(match[2]) >= from)
  assert.equal(uploaded.bytes, png.length)

  const stored = await store.storage().get(match[1]!)
  assert.ok(stored, 'stored')
  assert.equal(stored.contentType, 'image/png')
  assert.deepEqual(Buffer.from(await new Response(stored.body).arrayBuffer()), png)
  assert.ok(store.storage() instanceof store.DirectoryStorage)

  assert.match(await refused('upload_image', { data: png.toString('base64'), contentType: 'text/html', fileName: 'x.html' }), /not an image type/)
  assert.match(await refused('upload_image', { data: 'not base64!', contentType: 'image/png', fileName: 'x.png' }), /not base64/)
})

describe('the newsletter', () => {
  async function ready(slug = 'fresh-post') {
    await call('create_post', { title: 'Fresh post', slug, content: 'Fresh words for the list.\n\nAnd more.' })
    await call('publish_post', { post: slug })
    for (const email of ['ann@example.com', 'bob@example.com']) await newsletter.subscribe(email)
    await newsletter.unsubscribe((await newsletter.subscribe('gone@example.com')).subscriber.id)
    recorder.sent.length = 0
  }

  test('send_newsletter is a dry run by default: it sends and records nothing and returns the email', async () => {
    await ready()
    const dry = await call('send_newsletter', { post: 'fresh-post' })
    assert.equal(dry.dryRun, true)
    assert.equal(dry.recipients, 2)
    assert.equal(dry.failed, 0)
    assert.equal(dry.email.to, 'ann@example.com')
    assert.equal(dry.email.subject, 'Fresh Post')
    assert.ok(dry.email.text.includes('https://schier.test/blog/fresh-post'))
    assert.match(dry.email.html, /Fresh words for the list\./)
    assert.equal(recorder.sent.length, 0)
    assert.deepEqual(await s.rows('SELECT id FROM newsletter_sends'), [])

    const status = await call('newsletter_status', { post: 'fresh-post' })
    assert.deepEqual(status.subscribers, { subscribed: 2, unsubscribed: 1 })
    assert.equal(status.canSend, true)
    assert.deepEqual(status.sends, [])
  })

  test('a real send goes to every subscriber and is recorded, and a second is refused', async () => {
    await ready()

    // A test send first, which does not block the real one.
    const trial = await call('send_newsletter', { post: 'fresh-post', dryRun: false, to: 'BOB@example.com' })
    assert.equal(trial.recipients, 1)
    assert.deepEqual(recorder.sent.map((e) => e.to), ['bob@example.com'])
    assert.match(await refused('send_newsletter', { post: 'fresh-post', dryRun: false, to: 'nobody@example.com' }), /No subscriber has the address/)
    assert.match(await refused('send_newsletter', { post: 'fresh-post', dryRun: false, to: 'gone@example.com' }), /has unsubscribed/)
    recorder.sent.length = 0

    const sent = await call('send_newsletter', { post: 'fresh-post', dryRun: false })
    assert.equal(sent.dryRun, false)
    assert.equal(sent.recipients, 2)
    assert.deepEqual(recorder.sent.map((e) => e.to).sort(), ['ann@example.com', 'bob@example.com'])
    const rows = await s.rows<{ key: string; recipients: number }>(`SELECT key, recipients FROM newsletter_sends WHERE key NOT LIKE 'TEST:%'`)
    assert.deepEqual(rows, [{ key: 'post:fresh-post', recipients: 2 }])

    assert.match(await refused('send_newsletter', { post: 'fresh-post', dryRun: false }), /already went out for "fresh-post"/)
    assert.match(await refused('send_newsletter', { post: 'fresh-post' }), /already went out/, 'a dry run is refused too')
    assert.equal(recorder.sent.length, 2)

    const status = await call('newsletter_status', { post: 'fresh-post' })
    assert.equal(status.canSend, false)
    assert.match(status.reason, /already went out/)
    assert.deepEqual(status.sends.map((x: { key: string }) => x.key.startsWith('TEST:')), [true, false])
  })

  test('send_newsletter refuses a draft and an old post', async () => {
    await call('create_post', { title: 'Draft', content: 'Not yet.' })
    assert.match(await refused('send_newsletter', { post: 'draft' }), /is not published/)
    await call('create_post', { title: 'Old', content: 'Long ago.' })
    await call('publish_post', { post: 'old' })
    await call('update_post', { post: 'old', date: '2020-01-01T00:00:00Z' })
    assert.match(await refused('send_newsletter', { post: 'old' }), /dated more than a day ago/)
    assert.match(await refused('send_newsletter', { post: 'old', to: 'ann@example.com' }), /dated more than a day ago/)
  })
})

describe('the /mcp route', () => {
  const rpc = (body: unknown, auth?: string) =>
    route({
      request: new Request('http://localhost/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(auth ? { authorization: auth } : {}) },
        body: JSON.stringify(body),
      }),
      params: {},
    })
  const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } }

  test('is off (503) without MCP_TOKEN', async () => {
    delete process.env.MCP_TOKEN
    const res = await rpc(initialize, 'Bearer anything')
    assert.equal(res.status, 503)
    assert.deepEqual(await res.json(), { error: 'MCP_TOKEN is not configured' })
  })

  test('refuses (401) no token and a wrong one', async () => {
    process.env.MCP_TOKEN = 'the-secret'
    for (const auth of [undefined, 'Bearer wrong', 'Bearer the-secre', 'the-secret', 'Basic the-secret', 'Bearer ']) {
      const res = await rpc(initialize, auth)
      assert.equal(res.status, 401, String(auth))
      assert.equal(res.headers.get('www-authenticate'), 'Bearer realm="schier-co-admin"')
    }
  })

  test('answers in JSON with the right token', async () => {
    process.env.MCP_TOKEN = 'the-secret'
    const init = await rpc(initialize, 'Bearer the-secret')
    assert.equal(init.status, 200)
    assert.match(init.headers.get('content-type') ?? '', /application\/json/)
    const body = await init.json()
    assert.equal(body.result.serverInfo.name, 'schier-co-admin')

    await call('create_post', { title: 'Over http', content: 'Hi.' })
    const res = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_posts', arguments: {} } }, 'Bearer the-secret')
    assert.equal(res.status, 200)
    const listed = JSON.parse((await res.json()).result.content[0].text)
    assert.deepEqual(listed.posts.map((p: { slug: string }) => p.slug), ['over-http'])
  })
})
