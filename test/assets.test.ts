// Images, and the move off DigitalOcean:
//   node --test test/assets.test.ts
//
// Against fake S3 servers and a fake CDN on localhost (test/help.ts
// fakeS3, and fallback() here), never the real Space or bucket: storage()
// picks the bucket or a scratch directory, /media/{key} serves what it
// holds, uploadImage puts where the Go site put, a dev directory fills
// itself from the fallback once, and scripts/migrate-assets.mjs copies from
// one bucket to another and rewrites posts in a scratch database.

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, afterEach, before, beforeEach, describe, test } from 'node:test'
import { promisify } from 'node:util'
import { copyAssets, rewritePosts } from '../scripts/migrate-assets.mjs'
import { bucket } from '../scripts/s3.mjs'
import { fakeS3, handler, root, scratch, site, type Handler } from './help.ts'

type StorageModule = typeof import('../src/server/storage.ts')

const run = promisify(execFile)

let s: Awaited<ReturnType<typeof scratch>>
let app: Awaited<ReturnType<typeof site>>
let railway: Awaited<ReturnType<typeof fakeS3>>
let get: Handler
let head: Handler
let store: StorageModule

const PNG = Buffer.from('\x89PNG\r\n\x1a\nnot really a png, but bytes all the same')

before(async () => {
  railway = await fakeS3('assets')
  s = await scratch('assets')
  app = await site(s.url)
  get = await handler(app.load, '/src/routes/media/$.ts', 'GET')
  head = await handler(app.load, '/src/routes/media/$.ts', 'HEAD')
  store = await app.load<StorageModule>('/src/server/storage.ts')
})

after(async () => {
  await app?.close()
  await s?.drop()
  await railway?.close()
})

const AWS = ['AWS_ENDPOINT_URL', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET_NAME', 'AWS_DEFAULT_REGION'] as const
const ASSETS = ['ASSETS_DIR', 'ASSETS_FALLBACK_URL'] as const

const bucketEnv = () => ({
  AWS_ENDPOINT_URL: railway.endpoint,
  AWS_ACCESS_KEY_ID: 'test-key',
  AWS_SECRET_ACCESS_KEY: 'test-secret',
  AWS_S3_BUCKET_NAME: 'assets',
  AWS_DEFAULT_REGION: 'auto',
})

/// No bucket, and a fresh scratch directory as ASSETS_DIR.
async function directoryEnv(fallbackUrl?: string) {
  for (const k of AWS) delete process.env[k]
  const dir = await mkdtemp(join(tmpdir(), 'sc-media-'))
  process.env.ASSETS_DIR = dir
  if (fallbackUrl) process.env.ASSETS_FALLBACK_URL = fallbackUrl
  else delete process.env.ASSETS_FALLBACK_URL
  return dir
}

const ask = (key: string, headers: Record<string, string> = {}, h = get) =>
  h({ request: new Request(`http://localhost/media/${key}`, { headers }), params: { _splat: key } })

const bytes = async (res: Response) => Buffer.from(await res.arrayBuffer())

const BAD_KEYS = ['images/../db-backups/x.sql', '../images/a/1600000000.png', 'images/a/..', 'db-backups/x.sql', 'imagesx/a.png', '', 'images//a.png', 'images/./a.png', 'images\\..\\x', 'images/a\0.png', '.meta/images/a.png.json', '.tmp/x']

describe('the media route and uploads, over the bucket', () => {
  beforeEach(() => {
    Object.assign(process.env, bucketEnv())
    railway.objects.clear()
    railway.failing.clear()
    railway.objects.set('images/a/1600000000.png', { body: PNG, type: 'image/png' })
    railway.objects.set('avatar/greg face.jpg', { body: Buffer.from('jpeg'), type: 'image/jpeg' })
  })

  test('storage() is the bucket when the AWS_* variables are set', () => {
    assert.ok(store.storage() instanceof store.BucketStorage)
  })

  test('serves an object with its type, length, etag and a year of caching', async () => {
    const res = await ask('images/a/1600000000.png')
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'image/png')
    assert.equal(res.headers.get('content-length'), String(PNG.length))
    assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable')
    assert.equal(res.headers.get('accept-ranges'), 'bytes')
    assert.equal(res.headers.get('etag'), '"fake"')
    assert.deepEqual(await bytes(res), PNG)

    // Signed, virtual-host style, for the bucket named.
    const sent = railway.requests.at(-1)!
    assert.equal(sent.host, `assets.${new URL(railway.endpoint).host}`)
    assert.match(String(sent.headers.authorization), /^AWS4-HMAC-SHA256 Credential=test-key\/\d{8}\/auto\/s3\/aws4_request/)

    const spaced = await ask('avatar/greg face.jpg')
    assert.equal(spaced.status, 200)
    assert.equal(spaced.headers.get('content-type'), 'image/jpeg')
    assert.equal(await spaced.text(), 'jpeg')
  })

  test('answers a Range request with the part asked for', async () => {
    const res = await ask('images/a/1600000000.png', { range: 'bytes=0-3' })
    assert.equal(res.status, 206)
    assert.equal(res.headers.get('content-range'), `bytes 0-3/${PNG.length}`)
    assert.equal(res.headers.get('content-length'), '4')
    assert.deepEqual(await bytes(res), PNG.subarray(0, 4))

    // A range past the end: the whole object instead.
    const whole = await ask('images/a/1600000000.png', { range: `bytes=${PNG.length + 10}-` })
    assert.equal(whole.status, 200)
    assert.equal(whole.headers.get('content-length'), String(PNG.length))
    assert.equal(whole.headers.get('content-range'), null)
  })

  test('HEAD gives the headers and no body', async () => {
    const res = await ask('images/a/1600000000.png', {}, head)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'image/png')
    assert.equal(res.headers.get('content-length'), String(PNG.length))
    assert.equal(await res.text(), '')
    assert.equal((await ask('images/a/nope.png', {}, head)).status, 404)
  })

  test('404s a missing key', async () => {
    const res = await ask('images/a/missing.png')
    assert.equal(res.status, 404)
    assert.equal(res.headers.get('cache-control'), null)
  })

  test('refuses .. and keys outside images/, avatar/ and other/, without asking the bucket', async () => {
    const before = railway.requests.length
    for (const key of BAD_KEYS) {
      assert.equal((await ask(key)).status, 404, key)
      assert.equal((await ask(key, {}, head)).status, 404, key)
    }
    assert.equal((await get({ request: new Request('http://localhost/media/'), params: {} })).status, 404)
    await assert.rejects(store.storage().put('db-backups/x.sql', Buffer.from('x'), 1, 'text/plain'), /not a media key/)
    assert.equal(railway.requests.length, before)
  })

  test('503s when the bucket fails, with no caching', async () => {
    railway.failing.add('images/a/1600000000.png')
    const res = await ask('images/a/1600000000.png')
    assert.equal(res.status, 503)
    assert.equal(res.headers.get('cache-control'), null)
    assert.equal((await ask('images/a/1600000000.png', {}, head)).status, 503)
  })

  test("escapes !'()* in keys, as Signature V4 wants", async () => {
    const key = "images/a/it's (1)!*.png"
    await store.storage().put(key, PNG, PNG.length, 'image/png')
    const sent = railway.requests.at(-1)!
    assert.equal(sent.method, 'PUT')
    assert.equal(sent.path, '/images/a/it%27s%20%281%29%21%2A.png')
    assert.deepEqual(railway.objects.get(key)?.body, PNG)
    assert.equal((await ask(key)).status, 200)
    assert.equal(railway.requests.at(-1)!.path, '/images/a/it%27s%20%281%29%21%2A.png')
  })

  test('uploadImage puts at images/a/{unix}{ext} and returns the /media/ path', async () => {
    const { uploadImage } = await app.load<typeof import('../src/server/uploads.ts')>('/src/server/uploads.ts')
    const from = Math.floor(Date.now() / 1000)
    const path = await uploadImage(PNG, 'image/png', 'Screen Shot 2026-10-13.png')
    const to = Math.floor(Date.now() / 1000)

    const match = /^\/media\/images\/a\/(\d+)\.png$/.exec(path)
    assert.ok(match, path)
    assert.ok(Number(match[1]) >= from && Number(match[1]) <= to)
    const key = path.slice('/media/'.length)
    const put = railway.objects.get(key)
    assert.ok(put, `nothing at ${key}`)
    assert.deepEqual(put.body, PNG)
    assert.equal(put.type, 'image/png')

    // What it put, the route serves.
    const res = await ask(key)
    assert.equal(res.status, 200)
    assert.deepEqual(await bytes(res), PNG)

    // No extension, or an odd one, is left off as unsafe.
    assert.match(await uploadImage(Buffer.from('x'), 'image/gif', 'blob'), /^\/media\/images\/a\/\d+$/)
    assert.match(await uploadImage(Buffer.from('x'), 'image/gif', 'a.g?f'), /^\/media\/images\/a\/\d+$/)
  })
})

describe('DirectoryStorage', () => {
  const dirs: string[] = []
  const fresh = async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sc-media-'))
    dirs.push(dir)
    return dir
  }
  const read = async (object: { body: ReadableStream<Uint8Array> } | null) => {
    assert.ok(object)
    return Buffer.from(await new Response(object.body).arrayBuffer())
  }

  after(async () => {
    for (const dir of dirs) await rm(dir, { recursive: true, force: true })
  })

  test('puts, heads and gets, made on demand', async () => {
    const dir = join(await fresh(), 'not', 'yet')
    const d = new store.DirectoryStorage(dir)
    assert.equal(await d.head('images/a/1.png'), null)
    assert.equal(await d.get('images/a/1.png'), null)
    assert.ok(!existsSync(dir), 'reading makes nothing')

    await d.put('images/a/1.png', PNG, PNG.length, 'image/png')
    assert.deepEqual(readFileSync(join(dir, 'images/a/1.png')), PNG)
    const meta = await d.head('images/a/1.png')
    assert.equal(meta?.contentType, 'image/png')
    assert.equal(meta?.size, PNG.length)
    assert.match(meta?.etag ?? '', /^W\/"/)
    assert.ok(meta?.lastModified && !Number.isNaN(Date.parse(meta.lastModified)))

    const whole = await d.get('images/a/1.png')
    assert.equal(whole?.range, undefined)
    assert.deepEqual(await read(whole), PNG)

    // A stream of known length, and a key with spaces and quotes.
    const key = "avatar/greg's face (1).jpg"
    await d.put(key, new Response('jpeg bytes').body!, 10, 'image/jpeg')
    assert.equal((await d.get(key))?.contentType, 'image/jpeg')
    assert.equal((await read(await d.get(key))).toString(), 'jpeg bytes')

    // A put replaces, and one whose stream is not the length promised is refused
    // and leaves what was there.
    await d.put('images/a/1.png', Buffer.from('second'), 6, 'image/gif')
    assert.equal((await d.head('images/a/1.png'))?.contentType, 'image/gif')
    await assert.rejects(d.put('images/a/1.png', new Response('short').body!, 99, 'image/png'), /5 bytes written, 99 expected/)
    assert.equal((await read(await d.get('images/a/1.png'))).toString(), 'second')
    assert.deepEqual(await readdir(join(dir, '.tmp')), [], 'no temporary files left')
  })

  test('gets a range', async () => {
    const d = new store.DirectoryStorage(await fresh())
    await d.put('images/r.png', PNG, PNG.length, 'image/png')
    const part = await d.get('images/r.png', 'bytes=2-5')
    assert.deepEqual(part?.range, { start: 2, end: 5 })
    assert.equal(part?.size, PNG.length)
    assert.deepEqual(await read(part), PNG.subarray(2, 6))

    const tail = await d.get('images/r.png', 'bytes=-4')
    assert.deepEqual(tail?.range, { start: PNG.length - 4, end: PNG.length - 1 })
    assert.deepEqual(await read(tail), PNG.subarray(-4))

    const open = await d.get('images/r.png', 'bytes=10-')
    assert.deepEqual(await read(open), PNG.subarray(10))

    // Past the end, several, or not understood: the whole object.
    for (const range of [`bytes=${PNG.length}-`, 'bytes=0-1,4-5', 'items=0-1', 'bytes=5-2']) {
      const whole = await d.get('images/r.png', range)
      assert.equal(whole?.range, undefined, range)
      assert.deepEqual(await read(whole), PNG, range)
    }
  })

  test('the content type survives a new instance', async () => {
    const dir = await fresh()
    await new store.DirectoryStorage(dir).put('other/x.pdf', Buffer.from('%PDF'), 4, 'application/pdf')
    const again = new store.DirectoryStorage(dir)
    assert.equal((await again.head('other/x.pdf'))?.contentType, 'application/pdf')
    assert.equal((await again.get('other/x.pdf'))?.contentType, 'application/pdf')
  })

  test('refuses keys outside images/, avatar/ and other/, and .. anywhere', async () => {
    const parent = await fresh()
    const dir = join(parent, 'media')
    const d = new store.DirectoryStorage(dir)
    await d.put('images/ok.png', PNG, PNG.length, 'image/png')
    for (const key of BAD_KEYS) {
      assert.equal(await d.get(key), null, key)
      assert.equal(await d.head(key), null, key)
      await assert.rejects(d.put(key, Buffer.from('x'), 1, 'text/plain'), /not a media key/, key)
    }
    assert.deepEqual((await readdir(parent)).sort(), ['media'], 'nothing written outside')
    assert.deepEqual((await readdir(dir)).sort(), ['.meta', '.tmp', 'images'])
    for (const key of ['images/a.png', 'avatar/x/y.jpg', 'other/a b.pdf', 'images/..a/b.png']) assert.ok(store.validKey(key), key)
  })
})

describe('the media route over a directory', () => {
  let dir: string
  beforeEach(async () => {
    dir = await directoryEnv()
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })
  after(() => {
    for (const k of ASSETS) delete process.env[k]
  })

  test('storage() is ASSETS_DIR without the bucket, and uploads and the route use it', async () => {
    assert.ok(store.storage() instanceof store.DirectoryStorage)
    assert.equal((store.storage() as InstanceType<StorageModule['DirectoryStorage']>).root, dir)

    const { uploadImage } = await app.load<typeof import('../src/server/uploads.ts')>('/src/server/uploads.ts')
    const before = railway.requests.length
    const path = await uploadImage(PNG, 'image/png', 'shot.png')
    assert.match(path, /^\/media\/images\/a\/\d+\.png$/)
    const key = path.slice('/media/'.length)
    assert.deepEqual(readFileSync(join(dir, key)), PNG)
    assert.equal(railway.requests.length, before, 'no bucket asked')

    const res = await ask(key)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'image/png')
    assert.equal(res.headers.get('content-length'), String(PNG.length))
    assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable')
    assert.ok(res.headers.get('etag'))
    assert.ok(res.headers.get('last-modified'))
    assert.deepEqual(await bytes(res), PNG)

    const part = await ask(key, { range: 'bytes=0-3' })
    assert.equal(part.status, 206)
    assert.equal(part.headers.get('content-range'), `bytes 0-3/${PNG.length}`)
    assert.equal(part.headers.get('content-length'), '4')
    assert.deepEqual(await bytes(part), PNG.subarray(0, 4))

    const headed = await ask(key, {}, head)
    assert.equal(headed.status, 200)
    assert.equal(headed.headers.get('content-length'), String(PNG.length))
    assert.equal(await headed.text(), '')

    assert.equal((await ask('images/a/missing.png')).status, 404)
    for (const bad of BAD_KEYS) assert.equal((await ask(bad)).status, 404, bad)
  })
})

/// A stand-in for the CDN the dev fallback reads: [objects] by path, a
/// count of the requests for each, and whatever is not there a 404.
async function fallback(objects: Record<string, { body: Buffer; type: string }>) {
  const hits = new Map<string, number>()
  const server: Server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname
    hits.set(path, (hits.get(path) ?? 0) + 1)
    const object = objects[path]
    if (!object) return void res.writeHead(404, { 'content-type': 'application/xml' }).end('<Error><Code>NoSuchKey</Code></Error>')
    // Slow enough that requests arriving together overlap.
    setTimeout(() => res.writeHead(200, { 'content-type': object.type, 'content-length': object.body.length }).end(object.body), 50)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/cdn`,
    hits,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

describe('the dev fallback', () => {
  let cdn: Awaited<ReturnType<typeof fallback>>
  let dir: string
  const nodeEnv = process.env.NODE_ENV

  before(async () => {
    cdn = await fallback({
      '/cdn/images/a/1757971002.png': { body: PNG, type: 'image/png' },
      '/cdn/avatar/greg%20face.jpg': { body: Buffer.from('jpeg'), type: 'image/jpeg' },
    })
  })
  after(async () => {
    await cdn?.close()
    for (const k of ASSETS) delete process.env[k]
  })
  beforeEach(async () => {
    cdn.hits.clear()
    dir = await directoryEnv(cdn.url)
  })
  afterEach(async () => {
    process.env.NODE_ENV = nodeEnv
    await rm(dir, { recursive: true, force: true })
  })

  test('fetches a missing key once, saves it with its type and serves it from disk after', async () => {
    const key = 'images/a/1757971002.png'
    // Three at once: one fetch between them.
    const first = await Promise.all([ask(key), ask(key), ask(key, {}, head)])
    for (const res of first) {
      assert.equal(res.status, 200)
      assert.equal(res.headers.get('content-type'), 'image/png')
      assert.equal(res.headers.get('content-length'), String(PNG.length))
    }
    assert.deepEqual(await bytes(first[0]), PNG)
    assert.equal(cdn.hits.get('/cdn/images/a/1757971002.png'), 1)
    assert.deepEqual(readFileSync(join(dir, key)), PNG)
    assert.equal(JSON.parse(readFileSync(join(dir, '.meta', `${key}.json`), 'utf8')).contentType, 'image/png')

    // From disk now, Range and all.
    const part = await ask(key, { range: 'bytes=0-3' })
    assert.equal(part.status, 206)
    assert.deepEqual(await bytes(part), PNG.subarray(0, 4))
    assert.equal(cdn.hits.get('/cdn/images/a/1757971002.png'), 1)

    // Keys are escaped on the way to the fallback.
    const spaced = await ask('avatar/greg face.jpg')
    assert.equal(spaced.status, 200)
    assert.equal(await spaced.text(), 'jpeg')
    assert.equal(cdn.hits.get('/cdn/avatar/greg%20face.jpg'), 1)
  })

  test('a key the fallback lacks is a 404 and is not asked for again', async () => {
    const key = 'images/a/gone.png'
    assert.equal((await ask(key)).status, 404)
    assert.equal((await ask(key)).status, 404)
    assert.equal((await ask(key, {}, head)).status, 404)
    assert.equal(cdn.hits.get('/cdn/images/a/gone.png'), 1)
    assert.ok(!existsSync(join(dir, key)))

    // A put afterwards is served.
    await store.storage().put(key, PNG, PNG.length, 'image/png')
    assert.equal((await ask(key)).status, 200)
    assert.equal(cdn.hits.get('/cdn/images/a/gone.png'), 1)

    // Keys the site does not serve never reach the fallback.
    for (const bad of BAD_KEYS) assert.equal((await ask(bad)).status, 404, bad)
    assert.deepEqual([...cdn.hits.keys()], ['/cdn/images/a/gone.png'])
  })

  test('a fallback that cannot be reached is a 503, and is tried again', async () => {
    process.env.ASSETS_FALLBACK_URL = 'http://127.0.0.1:1/cdn'
    assert.equal((await ask('images/a/1757971002.png')).status, 503)
    process.env.ASSETS_FALLBACK_URL = cdn.url
    assert.equal((await ask('images/a/1757971002.png')).status, 200)
  })

  test('never in production', async () => {
    process.env.NODE_ENV = 'production'
    assert.equal((await ask('images/a/1757971002.png')).status, 404)
    assert.equal(cdn.hits.size, 0)
    assert.equal((store.storage() as InstanceType<StorageModule['DirectoryStorage']>).fallback, undefined)
  })
})

describe('scripts/migrate-assets.mjs', () => {
  const CDN = 'https://schierco.nyc3.cdn.digitaloceanspaces.com/'
  const ORIGIN = 'https://schierco.nyc3.digitaloceanspaces.com/'

  const post = (slug: string, content: string, image = '') =>
    s.db.query(`INSERT INTO blog_posts (id, slug, title, content, image) VALUES ($1, $2, $3, $4, $5)`, [`pst_${slug}`, slug, slug, content, image])

  const both = `Two of them:\n\n![one](${CDN}images/a/1.png)\n\n![two](${ORIGIN}images/b/2.jpg) and ${CDN}other/x.pdf`

  beforeEach(async () => {
    await s.db.query(`DELETE FROM blog_posts`)
    await post('both-hosts', both, `${ORIGIN}images/cover.png`)
    await post('plain', 'No images here, and https://example.com/images/a.png is not ours.')
    await post('already', 'Done before: ![x](/media/images/a/1.png)', '/media/images/cover.png')
  })

  const content = async (slug: string) =>
    (await s.rows<{ content: string; image: string; updated_at: Date }>(`SELECT content, image, updated_at FROM blog_posts WHERE slug = $1`, [slug]))[0]

  test('the rewrite changes only the posts with either DigitalOcean host, once', async () => {
    const plainBefore = await content('plain')
    const lines: string[] = []

    assert.deepEqual(await rewritePosts(s.db, { dryRun: true, log: (l) => lines.push(l) }), ['both-hosts'])
    assert.equal((await content('both-hosts')).content, both, 'a dry run changes nothing')
    assert.deepEqual(lines, ['  would rewrite both-hosts'])

    assert.deepEqual(await rewritePosts(s.db, { log: () => {} }), ['both-hosts'])
    const rewritten = await content('both-hosts')
    assert.equal(rewritten.content, `Two of them:\n\n![one](/media/images/a/1.png)\n\n![two](/media/images/b/2.jpg) and /media/other/x.pdf`)
    assert.equal(rewritten.image, '/media/images/cover.png')
    assert.deepEqual(await content('plain'), plainBefore)
    assert.equal((await content('already')).content, 'Done before: ![x](/media/images/a/1.png)')

    assert.deepEqual(await rewritePosts(s.db, { log: () => {} }), [], 'a second run changes nothing')
  })

  test('the copy step copies what is missing with its type and skips what is there', async () => {
    const space = await fakeS3('schierco', {
      'images/a/1.png': { body: PNG, type: 'image/png' },
      'images/b/2.jpg': { body: 'jpeg bytes', type: 'image/jpeg' },
      'avatar/me.jpg': { body: 'me', type: 'image/jpeg' },
      'other/x.pdf': { body: '%PDF', type: 'application/pdf' },
      'db-backups/old.sql': { body: 'stale', type: 'text/plain' },
    }, 1)
    const dest = await fakeS3('assets', { 'images/a/1.png': { body: PNG, type: 'image/png' }, 'images/b/2.jpg': { body: 'short', type: 'image/jpeg' } })
    try {
      const source = bucket({ endpoint: space.endpoint, key: 'k', secret: 's', bucket: 'schierco', region: 'us-east-1' })
      const target = bucket({ endpoint: dest.endpoint, key: 'k', secret: 's', bucket: 'assets', region: 'auto' })

      const dry = await copyAssets(source, target, { dryRun: true, log: () => {} })
      assert.deepEqual(dry.copied.sort(), ['avatar/me.jpg', 'images/b/2.jpg', 'other/x.pdf'])
      assert.equal(dest.objects.size, 2, 'a dry run puts nothing')
      assert.ok(!dest.requests.some((r) => r.method === 'PUT'))

      const result = await copyAssets(source, target, { log: () => {} })
      assert.deepEqual(result.seen.sort(), ['avatar/me.jpg', 'images/a/1.png', 'images/b/2.jpg', 'other/x.pdf'])
      assert.deepEqual(result.skipped, ['images/a/1.png'])
      assert.deepEqual(result.copied.sort(), ['avatar/me.jpg', 'images/b/2.jpg', 'other/x.pdf'], 'a different size is copied again')
      assert.deepEqual(result.failed, [])
      assert.equal(dest.objects.get('images/b/2.jpg')?.body.toString(), 'jpeg bytes')
      assert.equal(dest.objects.get('images/b/2.jpg')?.type, 'image/jpeg')
      assert.equal(dest.objects.get('other/x.pdf')?.type, 'application/pdf')
      assert.ok(!dest.objects.has('db-backups/old.sql'))
      // The listing came a page at a time, its tokens sent back escaped.
      assert.ok(space.requests.some((r) => r.query.includes('continuation-token=t%2F1%2F%2B%3D')))

      const again = await copyAssets(source, target, { log: () => {} })
      assert.equal(again.copied.length, 0)
      assert.equal(again.skipped.length, 4)
    } finally {
      await space.close()
      await dest.close()
    }
  })

  test('the whole script: dry run, run, run again, and a failure', async () => {
    const space = await fakeS3('schierco', {
      'images/a/1.png': { body: PNG, type: 'image/png' },
      'images/b/2.jpg': { body: 'jpeg bytes', type: 'image/jpeg' },
      'images/cover.png': { body: 'cover', type: 'image/png' },
      'other/x.pdf': { body: '%PDF', type: 'application/pdf' },
    })
    const dest = await fakeS3('assets', { 'images/a/1.png': { body: PNG, type: 'image/png' } })
    const env = {
      ...process.env,
      DO_SPACES_KEY: 'k',
      DO_SPACES_SECRET: 's',
      DO_SPACES_DOMAIN: space.endpoint,
      DO_SPACES_SPACE: 'schierco',
      AWS_ENDPOINT_URL: dest.endpoint,
      AWS_ACCESS_KEY_ID: 'k',
      AWS_SECRET_ACCESS_KEY: 's',
      AWS_S3_BUCKET_NAME: 'assets',
      AWS_DEFAULT_REGION: 'auto',
      DATABASE_URL: s.url,
    }
    const script = (...args: string[]) => run('node', ['scripts/migrate-assets.mjs', ...args], { cwd: root, env })
    try {
      const dry = await script('--dry-run')
      assert.match(dry.stdout, /would copy images\/b\/2\.jpg/)
      assert.match(dry.stdout, /would rewrite both-hosts/)
      assert.match(dry.stdout, /Objects seen: 4\nObjects would be copied: 3\nObjects skipped \(already in the bucket\): 1\nObjects failed: 0\nPosts would be rewritten: 1/)
      assert.equal(dest.objects.size, 1)
      assert.equal((await content('both-hosts')).content, both)

      // One object fails: the rest are copied, posts are left alone, exit 1.
      space.failing.add('images/b/2.jpg')
      const failed = await script().then(
        () => assert.fail('a failed object should exit 1'),
        (error: { code: number; stdout: string }) => error,
      )
      assert.equal(failed.code, 1)
      assert.match(failed.stdout, /Objects copied: 2\n.*\nObjects failed: 1\nPosts rewritten: none \(skipped\)/)
      assert.match(failed.stdout, /Failed:\n {2}images\/b\/2\.jpg: get images\/b\/2\.jpg: 500/)
      assert.equal((await content('both-hosts')).content, both)
      space.failing.clear()

      const ran = await script()
      assert.match(ran.stdout, /Objects seen: 4\nObjects copied: 1\nObjects skipped \(already in the bucket\): 3\nObjects failed: 0\nPosts rewritten: 1/)
      assert.match(ran.stdout, /rewrote both-hosts/)
      assert.doesNotMatch(ran.stdout, /not in the Space/)
      assert.equal(dest.objects.size, 4)
      assert.match((await content('both-hosts')).content, /\(\/media\/images\/b\/2\.jpg\)/)

      const again = await script()
      assert.match(again.stdout, /Objects copied: 0\nObjects skipped \(already in the bucket\): 4\nObjects failed: 0\nPosts rewritten: 0/)
    } finally {
      await space.close()
      await dest.close()
    }
  })
})
