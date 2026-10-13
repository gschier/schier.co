import { createReadStream } from 'node:fs'
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { s3Configured, s3Get, s3Head, s3Put } from './s3'

// Where the site's images live (BRIEF.md, Images): one small interface with
// two backends. The Railway bucket when the AWS_* variables are set, else a
// directory on disk, ASSETS_DIR (default .media in the repo root), so a dev server
// needs no bucket. /media/{key} and uploads go through storage().
//
// Keys are what they were in the DigitalOcean Space: under images/,
// avatar/ or other/. Every method checks the key here, so nothing outside
// those three is ever read or written, in the bucket or on disk.

/// What is known about an object without its bytes.
export type Meta = { contentType: string; size: number; etag?: string; lastModified?: string }

/// An object's bytes, or the part a Range asked for: [range] is then the
/// inclusive byte span of [body] within the whole [size].
export type StoredObject = Meta & { body: ReadableStream<Uint8Array>; range?: { start: number; end: number } }

export interface Storage {
  /// The object at [key], or the part [range] (a Range header's value) asks
  /// for. A range that cannot be served gives the whole object. Null when
  /// the key is missing or not one the site serves.
  get(key: string, range?: string): Promise<StoredObject | null>
  /// The object's meta, or null as for get.
  head(key: string): Promise<Meta | null>
  /// Store [length] bytes from [body] at [key]. Throws for a key the site
  /// does not serve.
  put(key: string, body: Uint8Array | ReadableStream<Uint8Array>, length: number, contentType: string): Promise<void>
}

const PREFIXES = ['images/', 'avatar/', 'other/']

/// Whether [key] names something the site serves: under one of the three
/// prefixes, with no empty, `.` or `..` segment, no backslash and no NUL.
export function validKey(key: string | undefined | null): key is string {
  if (!key || !PREFIXES.some((p) => key.startsWith(p))) return false
  if (key.includes('\\') || key.includes('\0')) return false
  return key.split('/').every((s) => s !== '' && s !== '.' && s !== '..')
}

function checked(key: string): string {
  if (!validKey(key)) throw new Error(`not a media key: ${JSON.stringify(key)}`)
  return key
}

const OCTET = 'application/octet-stream'

/// The span a `bytes=` Range asks for within [size] bytes, or null when it
/// asks for none the object has (or several, or is not understood): the
/// whole object is served then.
export function byteRange(header: string | undefined, size: number): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? '')
  if (!m || (m[1] === '' && m[2] === '') || size === 0) return null
  let start: number
  let end: number
  if (m[1] === '') {
    // The last N bytes.
    start = Math.max(0, size - Number(m[2]))
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  }
  if (start > end || start >= size) return null
  return { start, end }
}

// ---------------------------------------------------------------------------
// The bucket (src/server/s3.ts).

export class BucketStorage implements Storage {
  async get(key: string, range?: string): Promise<StoredObject | null> {
    if (!validKey(key)) return null
    let res: Response | null
    try {
      res = await s3Get(key, range)
    } catch (error) {
      // A range the bucket will not serve (416, say): the whole object
      // instead, as a server that ignores Range may.
      if (!range) throw error
      res = await s3Get(key)
    }
    if (!res?.body) return null
    const meta = bucketMeta(res)
    const span = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(res.headers.get('content-range') ?? '')
    if (res.status === 206 && span) {
      const [start, end] = [Number(span[1]), Number(span[2])]
      return { ...meta, size: span[3] === '*' ? end + 1 : Number(span[3]), body: res.body, range: { start, end } }
    }
    return { ...meta, body: res.body }
  }

  async head(key: string): Promise<Meta | null> {
    if (!validKey(key)) return null
    const res = await s3Head(key)
    return res ? bucketMeta(res) : null
  }

  async put(key: string, body: Uint8Array | ReadableStream<Uint8Array>, length: number, contentType: string): Promise<void> {
    const buffer = body instanceof Uint8Array ? (Buffer.isBuffer(body) ? body : Buffer.from(body.buffer, body.byteOffset, body.byteLength)) : body
    await s3Put(checked(key), buffer, length, contentType || OCTET)
  }
}

function bucketMeta(res: Response): Meta {
  return {
    contentType: res.headers.get('content-type') || OCTET,
    size: Number(res.headers.get('content-length') ?? 0),
    etag: res.headers.get('etag') ?? undefined,
    lastModified: res.headers.get('last-modified') ?? undefined,
  }
}

// ---------------------------------------------------------------------------
// A directory on disk.

/// Objects as files under [root] at their keys, with each one's content
/// type in `.meta/{key}.json` beside the tree (outside images/, avatar/ and
/// other/, so no key can be mistaken for one), so it survives restarts.
/// Writes go to `.tmp/` first and are renamed into place, so a half-written
/// object is never served. The directory is made when first written.
///
/// With [fallback] (dev only; storage() never passes it in production), a
/// key the directory lacks is fetched once from `{fallback}/{key}`, saved
/// with its content type and served. One the fallback does not have is a
/// miss for the rest of the process and is not asked for again.
export class DirectoryStorage implements Storage {
  readonly root: string
  readonly fallback?: string
  private misses = new Set<string>()
  private fetching = new Map<string, Promise<boolean>>()

  constructor(root: string, options: { fallback?: string } = {}) {
    this.root = resolve(root)
    this.fallback = options.fallback?.replace(/\/+$/, '') || undefined
  }

  private file(key: string) {
    return join(this.root, ...key.split('/'))
  }

  private metaFile(key: string) {
    return join(this.root, '.meta', ...key.split('/')) + '.json'
  }

  /// The object's meta from disk, fetching it from the fallback first when
  /// there is one and the directory lacks it.
  private async local(key: string): Promise<Meta | null> {
    const found = await this.read(key)
    if (found || !this.fallback || this.misses.has(key)) return found
    let pending = this.fetching.get(key)
    if (!pending) {
      pending = this.fetchFallback(key).finally(() => this.fetching.delete(key))
      this.fetching.set(key, pending)
    }
    return (await pending) ? this.read(key) : null
  }

  private async read(key: string): Promise<Meta | null> {
    let s
    try {
      s = await stat(this.file(key))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'ENOTDIR') return null
      throw error
    }
    if (!s.isFile()) return null
    let contentType = OCTET
    try {
      contentType = JSON.parse(await readFile(this.metaFile(key), 'utf8')).contentType || OCTET
    } catch {}
    return {
      contentType,
      size: s.size,
      etag: `W/"${s.size.toString(16)}-${Math.floor(s.mtimeMs).toString(16)}"`,
      lastModified: s.mtime.toUTCString(),
    }
  }

  /// Fetch [key] from the fallback and save it. False when the fallback
  /// does not have it (any 4xx), which is remembered; throws on anything
  /// else (unreachable, 5xx), which is not, so a later request tries again.
  private async fetchFallback(key: string): Promise<boolean> {
    const url = `${this.fallback}/${key.split('/').map(encodeURIComponent).join('/')}`
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
    if (res.status >= 400 && res.status < 500) {
      await res.body?.cancel()
      this.misses.add(key)
      return false
    }
    if (!res.ok || !res.body) throw new Error(`media fallback ${url}: ${res.status}`)
    // fetch undoes any content-encoding, so the length is checked only for
    // bytes that arrived as they were sent.
    const length = res.headers.get('content-encoding') ? null : res.headers.get('content-length')
    await this.write(key, res.body, length === null ? null : Number(length), res.headers.get('content-type') || OCTET)
    return true
  }

  async get(key: string, range?: string): Promise<StoredObject | null> {
    if (!validKey(key)) return null
    const meta = await this.local(key)
    if (!meta) return null
    const span = byteRange(range, meta.size)
    const stream = createReadStream(this.file(key), span ?? {})
    const body = Readable.toWeb(stream) as ReadableStream<Uint8Array>
    return span ? { ...meta, body, range: span } : { ...meta, body }
  }

  async head(key: string): Promise<Meta | null> {
    if (!validKey(key)) return null
    return this.local(key)
  }

  async put(key: string, body: Uint8Array | ReadableStream<Uint8Array>, length: number, contentType: string): Promise<void> {
    await this.write(checked(key), body, length, contentType || OCTET)
    this.misses.delete(key)
  }

  private async write(key: string, body: Uint8Array | ReadableStream<Uint8Array>, length: number | null, contentType: string) {
    const tmpDir = join(this.root, '.tmp')
    await mkdir(tmpDir, { recursive: true })
    const tmp = join(tmpDir, `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    try {
      if (body instanceof Uint8Array) {
        await writeFile(tmp, body)
      } else {
        const handle = await open(tmp, 'w')
        try {
          await pipeline(Readable.fromWeb(body as import('node:stream/web').ReadableStream), handle.createWriteStream())
        } finally {
          await handle.close().catch(() => {})
        }
      }
      const written = (await stat(tmp)).size
      if (length !== null && written !== length) throw new Error(`media put ${key}: ${written} bytes written, ${length} expected`)
      const file = this.file(key)
      const metaFile = this.metaFile(key)
      await mkdir(dirname(file), { recursive: true })
      await mkdir(dirname(metaFile), { recursive: true })
      await writeFile(`${tmp}.json`, JSON.stringify({ contentType }) + '\n')
      await rename(`${tmp}.json`, metaFile)
      await rename(tmp, file)
    } finally {
      await rm(tmp, { force: true })
      await rm(`${tmp}.json`, { force: true })
    }
  }
}

// ---------------------------------------------------------------------------

/// Whether this is a dev server (or the tests), where a directory may fill
/// itself from ASSETS_FALLBACK_URL. Never true in a production build.
function dev(): boolean {
  return import.meta.env.DEV === true && process.env.NODE_ENV !== 'production'
}

const directories = new Map<string, DirectoryStorage>()
const bucket = new BucketStorage()

/// The storage the site uses: the bucket when the AWS_* variables are set,
/// else the directory ASSETS_DIR (default .media, relative to the repo root, where
/// every npm script runs). In dev, the directory falls back to
/// ASSETS_FALLBACK_URL for keys it lacks. Read from the environment on each
/// call; the directory's state (its fallback misses) lasts the process.
export function storage(): Storage {
  if (s3Configured()) return bucket
  const root = resolve(process.cwd(), process.env.ASSETS_DIR || '.media')
  const fallback = dev() ? process.env.ASSETS_FALLBACK_URL || undefined : undefined
  const id = `${root}\n${fallback ?? ''}`
  let directory = directories.get(id)
  if (!directory) {
    directory = new DirectoryStorage(root, { fallback })
    directories.set(id, directory)
  }
  return directory
}
