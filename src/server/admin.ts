import { currentUser, knownUser, sessionIdOf, userForSession } from '#/server/auth'

// Whether a request is the admin's: whether it carries the cookie of a live
// session, signed in at /login (src/server/auth.ts). Greg is the only
// author, so anyone signed in is the admin.

export async function isAdmin(): Promise<boolean> {
  return (await currentUser()) !== null
}

/// Whether [request] carries a live session's cookie: for server route
/// handlers, which have the request rather than Start's cookie helpers.
export async function isAdminRequest(request: Request): Promise<boolean> {
  return (await userForSession(sessionIdOf(request))) !== null
}

/// Whether this request is the admin's, if that is already known (see
/// knownUser); false otherwise, and outside a request.
export function isKnownAdmin(): boolean {
  return knownUser() !== null
}
