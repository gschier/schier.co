// What the site's tests share: scratch databases, and the site's own code
// loaded over one.
//
// Databases are made on the local Postgres (docker compose, port 5439, or
// TEST_DATABASE_URL in CI) beside the compose one, never in it, and
// dropped after. Only ever localhost: anything else is refused.

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { createServer as createHttpServer, type IncomingHttpHeaders } from 'node:http'
import { createServer as createNetServer, type AddressInfo } from 'node:net'
import { join } from 'node:path'
import bcrypt from 'bcryptjs'
import pg from 'pg'
import { createServer, type ViteDevServer } from 'vite'

const server = new URL(process.env.TEST_DATABASE_URL ?? 'postgresql://schierco:schierco@localhost:5439/postgres')
assert.ok(['localhost', '127.0.0.1'].includes(server.hostname), `a scratch database is made on localhost only, not ${server.hostname}`)

export const root = new URL('..', import.meta.url).pathname
const migrations = new URL('../prisma/migrations/', import.meta.url)

/// A file of a migration, `migration.sql` unless another is named.
export const sql = (folder: string, file = 'migration.sql') => readFileSync(new URL(`${folder}/${file}`, migrations), 'utf8')

/// A scratch database with every migration run, or those before [until].
export async function scratch(name: string, until?: string) {
  const admin = new pg.Client({ connectionString: server.href })
  await admin.connect()
  const database = `sc_scratch_${name}_${process.pid}`
  await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`)
  await admin.query(`CREATE DATABASE ${database}`)
  const url = new URL(server.href)
  url.pathname = `/${database}`
  const db = new pg.Client({ connectionString: url.href })
  await db.connect()
  for (const folder of readdirSync(migrations).filter((f) => /^\d+_/.test(f) && (!until || f < until)).sort()) await db.query(sql(folder))
  return {
    url: url.href,
    db,
    rows: async <T = Record<string, unknown>>(query: string, values: unknown[] = []) => (await db.query(query, values)).rows as T[],
    drop: async () => {
      await db.end()
      await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`)
      await admin.end()
    },
  }
}

/// A user with a known password and a session, in the scratch database
/// [s]: the cookie that signs a request in as them, as /login would have
/// set it. Each call makes its own user and session.
let users = 0
export async function signedIn(s: { rows: Awaited<ReturnType<typeof scratch>>['rows'] }, password = 'a password') {
  const n = ++users
  const userId = `usr_test${String(n).padStart(8, '0')}`
  const sessionId = `ses_test${String(n).padStart(8, '0')}`
  const email = `author${n}@example.com`
  await s.rows('INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)', [userId, email, `Author ${n}`, await bcrypt.hash(password, 4)])
  await s.rows('INSERT INTO sessions (id, user_id) VALUES ($1, $2)', [sessionId, userId])
  return { userId, sessionId, email, password, cookie: `sid=${sessionId}` }
}

type Site = { load: <T>(module: string) => Promise<T>; close: () => Promise<void> }

/// The site's own code over the database at [url], loaded through Vite as
/// the dev server loads it.
export async function site(url: string): Promise<Site> {
  process.env.DATABASE_URL = url
  const vite: ViteDevServer = await createServer({
    configFile: false,
    root,
    cacheDir: join(root, 'node_modules/.vite-test'),
    appType: 'custom',
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false, ws: false },
    resolve: { alias: { '#': join(root, 'src') } },
  })
  return {
    load: <T>(module: string) => vite.ssrLoadModule(module) as Promise<T>,
    close: async () => {
      const { db } = (await vite.ssrLoadModule('/src/server/db.ts')) as typeof import('../src/server/db.ts')
      await db.$disconnect()
      await vite.close()
    },
  }
}

/// A route's handler, called as the server calls it.
export type Handler = (context: { request: Request; params: Record<string, string> }) => Promise<Response>
export async function handler(load: Site['load'], route: string, method: string): Promise<Handler> {
  const module = await load<{ Route: { options: { server: { handlers: Record<string, Handler> } } } }>(route)
  return module.Route.options.server.handlers[method]
}

type FakeObject = { body: Buffer; type: string }

/// A stand-in for an S3 bucket named [bucket], on a port of its own on
/// localhost: virtual-host style as Railway and DigitalOcean answer
/// (`{bucket}.localhost:{port}`), HEAD, GET (with Range), PUT and
/// ListObjectsV2 a page of [pageSize] at a time, over [objects]. Signatures
/// are not checked. Keys in [failing] answer 500.
export async function fakeS3(bucket: string, objects: Record<string, { body: string | Buffer; type?: string }> = {}, pageSize = 2) {
  const store = new Map<string, FakeObject>(
    Object.entries(objects).map(([k, o]) => [k, { body: Buffer.from(o.body), type: o.type ?? 'application/octet-stream' }]),
  )
  const requests: { method: string; host: string; path: string; key: string; query: string; headers: IncomingHttpHeaders }[] = []
  const failing = new Set<string>()
  const server = createHttpServer(async (req, res) => {
    const u = new URL(req.url ?? '/', 'http://fake')
    const host = req.headers.host ?? ''
    const key = decodeURIComponent(u.pathname.slice(1))
    requests.push({ method: req.method ?? '', host, path: u.pathname, key, query: u.search, headers: req.headers })
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    if (!host.startsWith(`${bucket}.`)) return void res.writeHead(404).end('<Error><Code>NoSuchBucket</Code></Error>')
    if (failing.has(key)) return void res.writeHead(500).end('<Error><Code>InternalError</Code></Error>')

    if (req.method === 'GET' && key === '' && u.searchParams.get('list-type') === '2') {
      const prefix = u.searchParams.get('prefix') ?? ''
      const keys = [...store.keys()].filter((k) => k.startsWith(prefix)).sort()
      // Tokens with characters that need escaping, as real ones have.
      const token = u.searchParams.get('continuation-token')
      const start = token ? Number(token.split('/')[1]) : 0
      const page = keys.slice(start, start + pageSize)
      const more = start + pageSize < keys.length
      const xml =
        `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>${bucket}</Name><Prefix>${prefix}</Prefix><KeyCount>${page.length}</KeyCount>` +
        page.map((k) => `<Contents><Key>${k.replace(/&/g, '&amp;')}</Key><Size>${store.get(k)!.body.length}</Size></Contents>`).join('') +
        `<IsTruncated>${more}</IsTruncated>` +
        (more ? `<NextContinuationToken>t/${start + pageSize}/+=</NextContinuationToken>` : '') +
        `</ListBucketResult>`
      return void res.writeHead(200, { 'content-type': 'application/xml' }).end(xml)
    }
    if (req.method === 'PUT') {
      store.set(key, { body: Buffer.concat(chunks), type: String(req.headers['content-type'] ?? 'application/octet-stream') })
      return void res.writeHead(200).end()
    }
    const object = store.get(key)
    if (!object) return void res.writeHead(404, { 'content-type': 'application/xml' }).end(req.method === 'HEAD' ? undefined : '<Error><Code>NoSuchKey</Code></Error>')
    const range = /^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range ?? ''))
    if (range && req.method === 'GET') {
      const from = Number(range[1])
      const to = Math.min(range[2] ? Number(range[2]) : object.body.length - 1, object.body.length - 1)
      if (from > to) return void res.writeHead(416, { 'content-range': `bytes */${object.body.length}` }).end()
      const part = object.body.subarray(from, to + 1)
      return void res
        .writeHead(206, { 'content-type': object.type, 'content-length': part.length, 'content-range': `bytes ${from}-${to}/${object.body.length}`, etag: '"fake"' })
        .end(part)
    }
    res.writeHead(200, { 'content-type': object.type, 'content-length': object.body.length, etag: '"fake"' })
    res.end(req.method === 'HEAD' ? undefined : object.body)
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  return {
    endpoint: `http://localhost:${port}`,
    objects: store,
    requests,
    failing,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

/// A dev server of the site's own on a free port, with [env] over this
/// process's: its address, and stop() to end it.
export async function devServer(env: Record<string, string | undefined>) {
  const port = await new Promise<number>((resolve, reject) => {
    const probe = createNetServer()
    probe.once('error', reject)
    probe.listen(0, () => {
      const { port } = probe.address() as AddressInfo
      probe.close(() => resolve(port))
    })
  })
  const base = `http://localhost:${port}`
  const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'dev', '--port', String(port), '--strictPort'], {
    cwd: root,
    env: { ...process.env, BASE_URL: base, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  server.stdout!.on('data', (d) => (output += d))
  server.stderr!.on('data', (d) => (output += d))
  const stop = () => void server.kill('SIGTERM')
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${base}/debug/health`)).ok) return { base, stop, output: () => output }
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  stop()
  throw new Error(`the dev server did not start:\n${output}`)
}
