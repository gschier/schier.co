import { createHash, createHmac } from 'node:crypto'

// The few S3 calls we make, signed by hand (AWS Signature V4) so there is
// no SDK to carry. Points at the Railway bucket whose credentials arrive
// as the AWS_* variables; absent those, every call reports "not
// configured" and callers carry on without the bucket (src/server/storage.ts
// then keeps objects in a directory instead).

type Config = { endpoint: string; key: string; secret: string; bucket: string; region: string }

function config(): Config | null {
  const { AWS_ENDPOINT_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET_NAME, AWS_DEFAULT_REGION } = process.env
  if (!AWS_ENDPOINT_URL || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_S3_BUCKET_NAME) return null
  return {
    endpoint: AWS_ENDPOINT_URL,
    key: AWS_ACCESS_KEY_ID,
    secret: AWS_SECRET_ACCESS_KEY,
    bucket: AWS_S3_BUCKET_NAME,
    region: AWS_DEFAULT_REGION || 'auto',
  }
}

export const s3Configured = () => config() !== null

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex')
const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data).digest()

/// RFC 3986 encoding, as Signature V4 wants it: everything but
/// A-Z a-z 0-9 - _ . ~ is escaped, `!'()*` included, which
/// encodeURIComponent leaves alone. Matches scripts/s3.mjs.
const encode = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())

/// Virtual-host style URL for a key, which Railway's endpoint uses.
function objectUrl(c: Config, key: string): URL {
  const u = new URL(c.endpoint)
  u.host = `${c.bucket}.${u.host}`
  u.pathname = '/' + key.split('/').map(encode).join('/')
  return u
}

/// Signed headers for one request. The payload is left unsigned (allowed
/// over TLS) so bodies can stream without being hashed first.
function sign(c: Config, method: string, url: URL, extra: Record<string, string>): Record<string, string> {
  const now = new Date()
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const date = amzDate.slice(0, 8)
  const headers: Record<string, string> = {
    host: url.host,
    'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
    'x-amz-date': amzDate,
    ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k.toLowerCase(), v])),
  }
  const names = Object.keys(headers).sort()
  const canonicalHeaders = names.map((n) => `${n}:${headers[n].trim()}\n`).join('')
  const signedHeaders = names.join(';')
  const canonical = [method, url.pathname, url.searchParams.toString(), canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n')
  const scope = `${date}/${c.region}/s3/aws4_request`
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n')
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${c.secret}`, date), c.region), 's3'), 'aws4_request')
  const signature = createHmac('sha256', signingKey).update(toSign).digest('hex')
  const { host: _host, ...rest } = headers
  return {
    ...rest,
    authorization: `AWS4-HMAC-SHA256 Credential=${c.key}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  }
}

/// GET an object, or the bytes [range] asks for (a Range header's value; the
/// answer is then 206 with its Content-Range). Null when the bucket is not
/// configured or the key is missing; throws on other failures.
export async function s3Get(key: string, range?: string): Promise<Response | null> {
  const c = config()
  if (!c) return null
  const url = objectUrl(c, key)
  const res = await fetch(url, { headers: sign(c, 'GET', url, range ? { range } : {}), signal: AbortSignal.timeout(120_000) })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`s3 get ${key}: ${res.status}`)
  return res
}

/// PUT an object from a stream of known length.
export async function s3Put(key: string, body: ReadableStream | Buffer, length: number, contentType = 'application/octet-stream'): Promise<void> {
  const c = config()
  if (!c) throw new Error('s3 not configured')
  const url = objectUrl(c, key)
  const headers = sign(c, 'PUT', url, { 'content-length': String(length), 'content-type': contentType })
  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body,
    // Node needs this to stream a request body.
    ...(Buffer.isBuffer(body) ? {} : { duplex: 'half' }),
    signal: AbortSignal.timeout(300_000),
  } as RequestInit)
  if (!res.ok) throw new Error(`s3 put ${key}: ${res.status} ${(await res.text()).slice(0, 200)}`)
}

/// HEAD an object: its headers (content-length, content-type, etag) without
/// the body. Null when the bucket is not configured or the key is missing;
/// throws on other failures.
export async function s3Head(key: string): Promise<Response | null> {
  const c = config()
  if (!c) return null
  const url = objectUrl(c, key)
  const res = await fetch(url, { method: 'HEAD', headers: sign(c, 'HEAD', url, {}), signal: AbortSignal.timeout(30_000) })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`s3 head ${key}: ${res.status}`)
  return res
}
