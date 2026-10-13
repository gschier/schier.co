// A small S3 client for scripts, signed by hand with AWS Signature V4 as
// src/server/s3.ts signs the site's calls, so no SDK is needed. Plain ESM so
// `node scripts/...` runs it as it is. Virtual-host style: the bucket is the
// first label of the host, as both DigitalOcean Spaces and Railway use.

import { createHash, createHmac } from 'node:crypto'

const sha256 = (data) => createHash('sha256').update(data).digest('hex')
const hmac = (key, data) => createHmac('sha256', key).update(data).digest()
const EMPTY = sha256('')

/// RFC 3986 encoding, as Signature V4 wants it: everything but
/// A-Z a-z 0-9 - _ . ~ is escaped.
const encode = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())

/// A bucket at [endpoint] (`https://host` or `http://host:port`), signed
/// with [key] and [secret] for [region].
export function bucket({ endpoint, key, secret, bucket: name, region }) {
  const base = new URL(endpoint.includes('://') ? endpoint : `https://${endpoint}`)

  function url(path, query = {}) {
    const u = new URL(base)
    u.host = `${name}.${base.host}`
    u.pathname = '/' + path.split('/').map(encode).join('/')
    // Sorted and encoded once, so what is sent is what was signed.
    u.search = Object.keys(query)
      .sort()
      .map((k) => `${encode(k)}=${encode(query[k])}`)
      .join('&')
    return u
  }

  function sign(method, u, payloadHash, extra = {}) {
    const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    const date = amzDate.slice(0, 8)
    const headers = {
      host: u.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k.toLowerCase(), String(v)])),
    }
    const names = Object.keys(headers).sort()
    const canonicalHeaders = names.map((n) => `${n}:${headers[n].trim()}\n`).join('')
    const signedHeaders = names.join(';')
    const canonical = [method, u.pathname, u.search.slice(1), canonicalHeaders, signedHeaders, payloadHash].join('\n')
    const scope = `${date}/${region}/s3/aws4_request`
    const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n')
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), 's3'), 'aws4_request')
    const signature = createHmac('sha256', signingKey).update(toSign).digest('hex')
    const { host: _host, ...rest } = headers
    return { ...rest, authorization: `AWS4-HMAC-SHA256 Credential=${key}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` }
  }

  async function call(method, path, { query, body, headers = {}, timeout = 120_000 } = {}) {
    const u = url(path, query)
    const hash = body ? sha256(body) : EMPTY
    return fetch(u, { method, headers: sign(method, u, hash, headers), body, signal: AbortSignal.timeout(timeout) })
  }

  async function fail(what, res) {
    return new Error(`${what}: ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`)
  }

  return {
    name,
    host: `${name}.${base.host}`,

    /// Every object under [prefix], as { key, size }, a page at a time
    /// (ListObjectsV2 with continuation tokens).
    async list(prefix) {
      const objects = []
      let token
      do {
        const query = { 'list-type': '2', prefix }
        if (token) query['continuation-token'] = token
        const res = await call('GET', '', { query })
        if (!res.ok) throw await fail(`list ${prefix}`, res)
        const xml = await res.text()
        for (const [, block] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
          objects.push({ key: unxml(tag(block, 'Key')), size: Number(tag(block, 'Size')) })
        }
        token = tag(xml, 'IsTruncated') === 'true' ? unxml(tag(xml, 'NextContinuationToken')) : undefined
      } while (token)
      return objects
    },

    /// An object's size and content type, or null when it is missing.
    async head(path) {
      const res = await call('HEAD', path, { timeout: 30_000 })
      if (res.status === 404) return null
      if (!res.ok) throw await fail(`head ${path}`, res)
      return { size: Number(res.headers.get('content-length')), contentType: res.headers.get('content-type') }
    },

    /// An object's bytes and content type. Throws when it is missing.
    async get(path) {
      const res = await call('GET', path)
      if (!res.ok) throw await fail(`get ${path}`, res)
      return { body: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') }
    },

    async put(path, body, contentType) {
      const res = await call('PUT', path, {
        body,
        headers: { 'content-length': body.length, 'content-type': contentType || 'application/octet-stream' },
        timeout: 300_000,
      })
      if (!res.ok) throw await fail(`put ${path}`, res)
    },
  }
}

const tag = (xml, name) => xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1] ?? ''

const unxml = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
