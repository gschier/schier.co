// What the page loaders share on the server.

import { setResponseStatus } from '@tanstack/react-start/server'
import type { CardView } from '#/lib/views'
import { recentPosts } from '#/server/posts'
import { card } from '#/server/views'

export type NotFoundData = { notFound: true; posts: CardView[] }

/// The 404 page's data, with the response's status set to 404: the six
/// newest posts, as Go's routeNotFound listed them.
export async function notFoundData(): Promise<NotFoundData> {
  setResponseStatus(404)
  return { notFound: true, posts: (await recentPosts(6)).map(card) }
}

/// A redirect as Go's http.Redirect answered it, to a path on this site or
/// an address elsewhere.
export function redirect(location: string, status: 301 | 302 | 303): Response {
  return new Response(null, { status, headers: { location } })
}

/// A plain-text error as Go's http.Error wrote one.
export function textError(status: number, message: string): Response {
  return new Response(`${message}\n`, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff' } })
}

/// Whether a browser sent this from the site's own page: Go checked a CSRF
/// token; the port turns away a request whose Origin is another site's.
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}
