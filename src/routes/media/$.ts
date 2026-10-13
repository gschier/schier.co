import { createFileRoute } from '@tanstack/react-router'
import { storage, type Meta, type StoredObject } from '#/server/storage'

/// The site's images, served by the site because Railway buckets are
/// private: GET /media/{key} answers with the object as stored, and a Range
/// request with the part it asks for. Keys are what they were in the
/// DigitalOcean Space (images/..., avatar/..., other/...), checked by
/// src/server/storage.ts, which also picks the bucket or, without one, a
/// directory on disk. An object never changes once uploaded, so browsers
/// and CDNs may keep it for a year.
///
/// Not /assets/, where Vite puts the site's own build files. Under
/// `vite dev`, vite.config.ts makes sure these requests reach this route.
export const Route = createFileRoute('/media/$')({
  server: {
    handlers: {
      GET: ({ request, params }) => serve(request, params._splat, 'GET'),
      HEAD: ({ request, params }) => serve(request, params._splat, 'HEAD'),
    },
  },
})

async function serve(request: Request, key: string | undefined, method: 'GET' | 'HEAD'): Promise<Response> {
  let object: (Meta & Partial<StoredObject>) | null
  try {
    object = method === 'HEAD' ? await storage().head(key ?? '') : await storage().get(key ?? '', request.headers.get('range') ?? undefined)
  } catch (error) {
    // The bucket (or the dev fallback) failed or could not be reached.
    console.error(`media: ${key}: ${error instanceof Error ? error.message : error}`)
    return text(503, 'Media is not available right now')
  }
  if (!object) return text(404, 'Not found')

  const range = object.range
  const headers = new Headers({
    'accept-ranges': 'bytes',
    'cache-control': 'public, max-age=31536000, immutable',
    'content-type': object.contentType,
    'content-length': String(range ? range.end - range.start + 1 : object.size),
  })
  if (range) headers.set('content-range', `bytes ${range.start}-${range.end}/${object.size}`)
  if (object.etag) headers.set('etag', object.etag)
  if (object.lastModified) headers.set('last-modified', object.lastModified)
  return new Response(method === 'HEAD' ? null : (object.body ?? null), { status: range ? 206 : 200, headers })
}

const text = (status: number, body: string) => new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })
