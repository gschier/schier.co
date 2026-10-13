import { deleteCookie, getCookie, setCookie } from '@tanstack/react-start/server'

// Admin sign-in: the MCP token, handed over once as ?token=... on /admin
// and kept in an httpOnly cookie. Site-wide path, because server function
// calls do not go through /admin and need it too.

export const ADMIN_COOKIE = 'sc_admin'

/// On a dev server any token signs in, for someone on this machine.
function anyToken(): boolean {
  return import.meta.env.DEV
}

export function isAdmin(): boolean {
  const cookie = getCookie(ADMIN_COOKIE)
  if (anyToken()) return !!cookie
  const secret = process.env.MCP_TOKEN
  return !!secret && cookie === secret
}

/// Whether [request] carries the admin cookie: for server route handlers,
/// which have the request rather than Start's cookie helpers.
export function isAdminRequest(request: Request): boolean {
  const secret = process.env.MCP_TOKEN
  const any = anyToken()
  if (!secret && !any) return false
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0 || part.slice(0, eq).trim() !== ADMIN_COOKIE) continue
    const value = part.slice(eq + 1).trim()
    if (any && value) return true
    try {
      if (decodeURIComponent(value) === secret) return true
    } catch {
      if (value === secret) return true
    }
  }
  return false
}

/// Returns true when [token] is the secret (or any token, see anyToken),
/// having set the cookie.
export function signIn(token: string): boolean {
  const secret = process.env.MCP_TOKEN
  if (!anyToken() && (!secret || token !== secret)) return false
  keep(token || 'dev')
  return true
}

export function signOut() {
  deleteCookie(ADMIN_COOKIE, { path: '/' })
}

function keep(value: string) {
  // Secure-only in production; a dev server is reached over plain http.
  setCookie(ADMIN_COOKIE, value, { httpOnly: true, secure: !import.meta.env.DEV, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 })
}
