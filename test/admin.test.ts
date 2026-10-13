// The admin pages and the editor's server functions:
//   node --test test/admin.test.ts
//
// Over a scratch database it makes and drops. Two halves:
// - The editor's functions (src/server/editor.ts, which every server
//   function in src/lib/adminFns.ts calls) run in-process inside a request of
//   Start's own, with and without a session cookie, with a RecordingMailer
//   in place of Resend; and the upload route is called as the server calls
//   it, with storage in a scratch directory.
// - The pages and the server functions themselves over HTTP, from a dev
//   server of the site's own started on a free port, called as the browser
//   calls them. Signing in and out is test/auth.test.ts's.

import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, beforeEach, describe, test } from 'node:test'
import { fromCrossJSON, toJSONAsync } from 'seroval'
import { handler, root, scratch, signedIn, site, type Handler } from './help.ts'

type Editor = typeof import('../src/server/editor.ts')
type Mail = typeof import('../src/server/mail.ts')
type Db = typeof import('../src/server/db.ts')

let s: Awaited<ReturnType<typeof scratch>>
let app: Awaited<ReturnType<typeof site>>
let editor: Editor
let mail: Mail
let db: Db['db']
let newId: Db['newId']
let recorder: InstanceType<Mail['RecordingMailer']>
let upload: Handler
let assets: string

const AWS = ['AWS_ENDPOINT_URL', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET_NAME', 'AWS_DEFAULT_REGION'] as const
/// A signed-in session's cookie (test/help.ts), made in before().
let COOKIE = ''

before(async () => {
  delete process.env.RESEND_API_KEY
  for (const k of AWS) delete process.env[k]
  delete process.env.ASSETS_FALLBACK_URL
  assets = await mkdtemp(join(tmpdir(), 'sc-admin-media-'))
  process.env.ASSETS_DIR = assets
  process.env.BASE_URL = 'https://schier.test'
  s = await scratch('admin')
  COOKIE = (await signedIn(s)).cookie
  app = await site(s.url)
  editor = await app.load<Editor>('/src/server/editor.ts')
  mail = await app.load<Mail>('/src/server/mail.ts')
  ;({ db, newId } = await app.load<Db>('/src/server/db.ts'))
  upload = await handler(app.load, '/src/routes/api/admin/upload.ts', 'POST')
})

beforeEach(async () => {
  recorder = new mail.RecordingMailer()
  mail.setMailer(recorder)
  await s.rows('DELETE FROM newsletter_sends')
  await s.rows('DELETE FROM newsletter_subscribers')
  await s.rows('DELETE FROM blog_posts')
})

after(async () => {
  mail?.setMailer(null)
  await app?.close()
  await s?.drop()
  if (assets) await rm(assets, { recursive: true, force: true })
})

/// Runs [fn] inside a request of Start's own, as a server function runs,
/// carrying [cookie] if given. The request store is Start's (its
/// AsyncLocalStorage, shared through a global symbol), so isAdmin() reads
/// this request's session cookie as it does on the server.
function as<T>(cookie: string | null, fn: () => Promise<T>): Promise<T> {
  const storage = (globalThis as Record<symbol, { run: (store: unknown, fn: () => Promise<T>) => Promise<T> } | undefined>)[Symbol.for('tanstack-start:event-storage')]
  assert.ok(storage, "Start's request store is loaded")
  const request = new Request('http://localhost/_serverFn/x', { method: 'POST', headers: cookie ? { cookie } : {} })
  return storage.run({ request, requestUrl: new URL(request.url) }, fn)
}
const admin = <T>(fn: () => Promise<T>) => as(COOKIE, fn)
const stranger = <T>(fn: () => Promise<T>) => as(null, fn)

/// The value of an outcome that must have succeeded.
function ok<T>(out: { ok: true; value: T } | { ok: false; error: string }): T {
  assert.ok(out.ok, `refused: ${!out.ok && out.error}`)
  return out.value
}

/// The message of an outcome that must have been refused.
function refusal(out: { ok: true } | { ok: false; error: string }): string {
  assert.equal(out.ok, false, 'was not refused')
  return (out as { error: string }).error
}

const near = (iso: string, ms = 10_000) => Math.abs(new Date(iso).getTime() - Date.now()) < ms

const fields = (more: Partial<Parameters<Editor['savePost']>[0]> = {}) => ({
  title: 'a post about writing',
  slug: '',
  content: '## A heading\n\nSome words.\n\n- one\n- two\n',
  tags: ['Writing'],
  image: '',
  summary: '',
  stage: 0,
  unlisted: false,
  ...more,
})

async function subscriber(email: string) {
  await db.newsletterSubscriber.create({ data: { id: newId('sub_'), email, name: '' } })
}

// ---------------------------------------------------------------------------

describe("the editor's functions", () => {
  test('signed out, the pages have no data and every action is refused', async () => {
    const post = await db.blogPost.create({ data: { id: newId('pst_'), slug: 'existing', title: 'Existing', content: 'Words.', image: '' } })
    assert.equal(await stranger(() => editor.adminList()), null)
    assert.equal(await stranger(() => editor.editorData(null)), null)
    assert.equal(await stranger(() => editor.editorData(post.id)), null)
    const actions: [string, () => Promise<unknown>][] = [
      ['savePost', () => editor.savePost(fields())],
      ['publish', () => editor.publish(post.id)],
      ['unpublish', () => editor.unpublish(post.id)],
      ['setListed', () => editor.setListed({ id: post.id, unlisted: true })],
      ['remove', () => editor.remove(post.id)],
      ['preview', () => editor.preview({ markdown: '# Hi' })],
      ['newsletterStatus', () => editor.newsletterStatus(post.id)],
      ['sendNewsletter', () => editor.sendNewsletter({ id: post.id, dryRun: true })],
    ]
    for (const [name, action] of actions) await assert.rejects(stranger(action), { name: 'NotAdmin', message: 'Not found' }, name)
    const rows = await s.rows<{ slug: string; published: boolean; unlisted: boolean }>('SELECT slug, published, unlisted FROM blog_posts')
    assert.deepEqual(rows, [{ slug: 'existing', published: false, unlisted: false }], 'nothing was written')
  })

  test('outside any request, the admin is nobody', async () => {
    await assert.rejects(editor.preview({ markdown: '# Hi' }))
  })

  test('create, save, publish, unlist and delete, as the editor does them', async () => {
    await subscriber('one@example.com')
    await subscriber('two@example.com')

    // A new post: the editor opens empty, with the tags to pick from.
    const blank = (await admin(() => editor.editorData(null)))!
    assert.equal(blank.post, null)
    assert.equal(blank.newsletter, null)
    assert.equal(blank.preview.html, '')

    const created = ok(await admin(() => editor.savePost(fields())))
    assert.match(created.id, /^pst_[a-z0-9]{12}$/)
    assert.equal(created.title, 'A Post About Writing')
    assert.equal(created.slug, 'a-post-about-writing')
    assert.deepEqual(created.tags, ['writing'])
    assert.equal(created.published, false)

    // Saving again with changes keeps the post; a slug another post has is
    // refused, not thrown.
    const saved = ok(await admin(() => editor.savePost(fields({ id: created.id, title: 'A Post About Writing', content: '## A heading\n\nMore words.\n', stage: 2 }))))
    assert.equal(saved.id, created.id)
    assert.equal(saved.content, '## A heading\n\nMore words.\n')
    assert.equal(saved.stage, 2)
    assert.match(refusal(await admin(() => editor.savePost(fields({ slug: 'a-post-about-writing' })))), /already has the slug "a-post-about-writing"/)

    const data = (await admin(() => editor.editorData(created.id)))!
    assert.equal(data.post!.id, created.id)
    assert.match(data.preview.html, /<h2 id="a-heading">A heading<\/h2>/)
    assert.ok(data.preview.words > 0)
    assert.equal(data.newsletter!.canSend, false)
    assert.equal(data.newsletter!.subscribers, 2)
    assert.equal(await admin(() => editor.editorData('pst_nosuchpost00')), null, 'an id no post has is a 404')

    const drafts = (await admin(() => editor.adminList()))!
    assert.deepEqual(
      drafts.drafts.map((p) => [p.slug, p.state]),
      [['a-post-about-writing', 'draft']],
    )
    assert.deepEqual(drafts.posts, [])

    // The live preview.
    const shown = await admin(() => editor.preview({ markdown: '# Title\n\n```js\nconst a = 1\n```\n', date: '2026-01-02T03:04:05Z' }))
    assert.match(shown.html, /<h1 id="title">Title<\/h1>/)
    assert.match(shown.html, /<pre class="shiki shiki-themes github-light github-dark"/)
    assert.match(shown.html, /--shiki-dark:/)
    assert.equal(shown.dateLabel, 'Jan  2, 2026')

    // Publishing dates the post now; a published post keeps its slug.
    const published = ok(await admin(() => editor.publish(created.id)))
    assert.equal(published.published, true)
    assert.ok(near(published.date))
    assert.match(refusal(await admin(() => editor.savePost(fields({ id: created.id, slug: 'another-slug' })))), /is published, so its slug cannot change/)
    assert.equal((await admin(() => editor.newsletterStatus(created.id))).canSend, true)

    const unlisted = ok(await admin(() => editor.setListed({ id: created.id, unlisted: true })))
    assert.equal(unlisted.unlisted, true)
    assert.deepEqual(
      (await admin(() => editor.adminList()))!.posts.map((p) => [p.slug, p.state]),
      [['a-post-about-writing', 'unlisted']],
    )
    assert.equal(ok(await admin(() => editor.setListed({ id: created.id, unlisted: false }))).unlisted, false)

    // The newsletter: a dry run returns the email and sends nothing; a test
    // send to someone who is not subscribed is refused.
    const dry = ok(await admin(() => editor.sendNewsletter({ id: created.id, dryRun: true })))
    assert.equal(dry.dryRun, true)
    assert.equal(dry.recipients, 2)
    assert.equal(dry.email!.to, 'one@example.com')
    assert.match(dry.email!.subject, /A Post About Writing/)
    assert.match(dry.email!.html, /a-post-about-writing/)
    assert.equal(recorder.sent.length, 0, 'a dry run sends nothing')
    assert.deepEqual(await s.rows('SELECT key FROM newsletter_sends'), [], 'and records nothing')
    assert.equal(dry.newsletter.canSend, true)
    assert.match(refusal(await admin(() => editor.sendNewsletter({ id: created.id, to: 'nobody@example.com' }))), /No subscriber has the address nobody@example.com/)

    const unpublished = ok(await admin(() => editor.unpublish(created.id)))
    assert.equal(unpublished.published, false)
    assert.match(refusal(await admin(() => editor.sendNewsletter({ id: created.id, dryRun: true }))), /is not published/)

    const removed = ok(await admin(() => editor.remove(created.id)))
    assert.equal(removed.id, created.id)
    assert.deepEqual(await s.rows('SELECT id FROM blog_posts'), [])
    assert.equal(await admin(() => editor.editorData(created.id)), null, 'its editor is a 404 now')
    assert.match(refusal(await admin(() => editor.publish(created.id))), /No post has the slug or id/)
  })

  test('publishing a post with no content is refused, and input no editor sends is a fault', async () => {
    const draft = ok(await admin(() => editor.savePost(fields({ content: '' }))))
    assert.match(refusal(await admin(() => editor.publish(draft.id))), /has no content/)
    await assert.rejects(admin(() => editor.savePost({ ...fields(), stage: 1.5 })), /Invalid input/)
    await assert.rejects(admin(() => editor.setListed({ id: draft.id, unlisted: 'yes' as unknown as boolean })), /Invalid input/)
  })

  test('the date is kept when given, and a draft saved without one is dated now', async () => {
    const draft = ok(await admin(() => editor.savePost(fields({ date: '2020-05-06T07:08:00.000Z' }))))
    assert.equal(draft.date, '2020-05-06T07:08:00.000Z')
    const resaved = ok(await admin(() => editor.savePost(fields({ id: draft.id }))))
    assert.ok(near(resaved.date))
  })

  test('the upload route takes an image from the admin only', async () => {
    const form = (file: File) => {
      const body = new FormData()
      body.append('file', file)
      return body
    }
    const png = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])], 'shot.png', { type: 'image/png' })
    const call = (body: FormData, cookie?: string) =>
      upload({ request: new Request('http://localhost/api/admin/upload', { method: 'POST', body, headers: cookie ? { cookie } : {} }), params: {} })

    assert.equal((await call(form(png))).status, 404)
    const res = await call(form(png), COOKIE)
    assert.equal(res.status, 200)
    const { url } = (await res.json()) as { url: string }
    assert.match(url, /^\/media\/images\/a\/\d+\.png$/)

    const refused = await call(form(new File(['hello'], 'notes.txt', { type: 'text/plain' })), COOKIE)
    assert.equal(refused.status, 415)
    assert.match(((await refused.json()) as { error: string }).error, /notes.txt is not an image/)
    assert.equal((await call(new FormData(), COOKIE)).status, 400)
  })
})

// ---------------------------------------------------------------------------

describe('the admin over HTTP, from a dev server', () => {
  let server: ChildProcess | undefined
  let base = ''
  let output = ''
  let ids: Record<string, string> = {}

  before(async () => {
    const port = await freePort()
    base = `http://localhost:${port}`
    server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'dev', '--port', String(port), '--strictPort'], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: s.url, BASE_URL: base, MCP_TOKEN: 'the-token' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    server.stdout!.on('data', (d) => (output += d))
    server.stderr!.on('data', (d) => (output += d))
    const deadline = Date.now() + 60000
    while (Date.now() < deadline) {
      try {
        if ((await fetch(`${base}/debug/health`)).ok) break
      } catch {
        // Not up yet.
      }
      await new Promise((r) => setTimeout(r, 250))
    }
    if (Date.now() >= deadline) throw new Error(`the dev server did not start:\n${output}`)
    // The server functions' ids, from the module as the browser is sent it.
    const client = await (await fetch(`${base}/src/lib/adminFns.ts`)).text()
    ids = Object.fromEntries([...client.matchAll(/export const (\w+) = .*?createClientRpc\("([^"]+)"\)/g)].map((m) => [m[1]!, m[2]!]))
    const imports = client.split('\n').filter((line) => line.startsWith('import '))
    assert.ok(imports.length && imports.every((line) => line.includes('@tanstack/react-start')), `the browser is sent no server code: ${imports.join('; ')}`)
  })

  after(() => {
    server?.kill('SIGTERM')
  })

  const get = (path: string, cookie?: string) => fetch(base + path, { redirect: 'manual', headers: cookie ? { cookie } : {} })

  /// The server function [name] called as the browser calls it: its result,
  /// or its error's message.
  async function call(name: string, data: unknown, cookie?: string): Promise<{ result?: any; error?: string }> {
    assert.ok(ids[name], `no server function ${name}`)
    const res = await fetch(`${base}/_serverFn/${ids[name]}`, {
      method: 'POST',
      headers: { 'x-tsr-serverFn': 'true', accept: 'application/json', 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(await toJSONAsync({ data })),
    })
    const body = JSON.parse(await res.text())
    // An error is serialised with a plugin of Start's; its message is plain.
    if (body.p?.k?.[0] === 'error') return { error: body.p.v[0].s?.message?.s ?? 'error' }
    return fromCrossJSON(body, { refs: new Map(), plugins: [] }) as { result: unknown }
  }

  test('signed out, the admin pages are the 404 page', async () => {
    for (const path of ['/admin', '/admin/new', '/admin/edit/x', '/admin/logout', '/blog/new', '/blog/drafts']) {
      const res = await get(path)
      assert.equal(res.status, 404, path)
      assert.match(await res.text(), /Page Not Found/, path)
    }
    assert.equal((await get('/admin/edit/pst_nosuchpost00', COOKIE)).status, 404, 'an id no post has')
  })

  test('a session signs in to the admin pages', async () => {
    const page = await get('/admin', COOKIE)
    assert.equal(page.status, 200)
    const html = await page.text()
    assert.match(html, /<h1[^>]*>Posts<\/h1>/)
    assert.match(html, /New post/)
    assert.match(html, /href="\/logout"[^>]*>Logout</, "the footer's Logout goes to /logout")
    assert.equal((await get('/admin/new', COOKIE)).status, 200)
  })

  test('the MCP token no longer signs in, at /admin?token= or as a cookie', async () => {
    const res = await get('/admin?token=the-token')
    assert.equal(res.status, 404)
    assert.match(await res.text(), /Page Not Found/)
    assert.deepEqual(res.headers.getSetCookie(), [], 'sets no cookie')
    assert.equal((await get('/admin', 'sc_admin=the-token')).status, 404, 'the old token cookie')
    assert.equal((await get('/admin', 'sid=the-token')).status, 404, 'the token as a session id')
  })

  test('the server functions refuse without the cookie and answer with it', async () => {
    const before = await s.rows('SELECT id FROM blog_posts')
    assert.deepEqual(await call('previewFn', { markdown: '# Hi' }), { error: 'Not found' })
    assert.deepEqual(await call('savePostFn', fields()), { error: 'Not found' })
    assert.deepEqual(await s.rows('SELECT id FROM blog_posts'), before, 'nothing was saved')

    const shown = await call('previewFn', { markdown: '# Hi' }, COOKIE)
    assert.match(shown.result.html, /<h1 id="hi">Hi<\/h1>/)
    const saved = await call('savePostFn', fields({ title: 'over http' }), COOKIE)
    assert.equal(saved.result.ok, true)
    assert.equal(saved.result.value.slug, 'over-http')
    const removed = await call('deleteFn', saved.result.value.id, COOKIE)
    assert.equal(removed.result.ok, true)
  })

  test('the upload route is a 404 without the cookie', async () => {
    const body = new FormData()
    body.append('file', new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' }))
    assert.equal((await fetch(`${base}/api/admin/upload`, { method: 'POST', body })).status, 404)
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
