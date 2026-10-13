// Signing in, as the Go site did it (internal/routes_auth.go and
// UserMiddleware in internal/middleware.go): an email and password checked
// against users.password_hash (bcrypt), a row in sessions, and the cookie
// `sid` holding the session's id for seven days, sent again with every
// response so it lasts seven days from the last visit. Signing out deletes
// the session and clears the cookie. Registering is open only while
// REGISTRATION=enable.
//
// The MCP does not sign in here; it has its own bearer (src/routes/mcp.ts).

import { randomInt } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { deleteCookie, getCookie, getRequest, setCookie } from '@tanstack/react-start/server'
import { db, newId } from '#/server/db'

/// The Go site's cookie name, so a sign-in there was the same cookie here.
export const SESSION_COOKIE = 'sid'

/// Seven days, in seconds, as Go's makeCookie had it.
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7

/// What a failed sign-in says, the same for an unknown email and a wrong
/// password, so the form tells nobody which addresses have an account.
export const LOGIN_FAILED = 'Invalid username or password'

/// Who is signed in: a user without the password hash.
export type SignedIn = { id: string; email: string; name: string }

const BCRYPT_COST = 10

// A hash of nothing anybody types, compared against when the email matches
// no user, so an unknown address takes as long as a wrong password.
const NO_USER_HASH = '$2a$10$LDpKgjr2j0AZtI/AsyCyyuimRCMLZoqM2z.DZ0/d76H3UjF7OqMRC'

const LETTERS = 'abcdefghijklmnopqrstuvwxyz0123456789'

/// A session's id: `ses_` and 21 random letters and digits, as long as the
/// column takes (VARCHAR(25)). Longer than the Go site's twelve, since the
/// id is the whole of the secret.
function newSessionId(): string {
  let id = 'ses_'
  for (let i = 0; i < 21; i++) id += LETTERS[randomInt(LETTERS.length)]
  return id
}

// ---------------------------------------------------------------------------
// The cookie

function cookieOptions() {
  // Secure everywhere but a dev server, which is reached over plain http.
  return { httpOnly: true, secure: !import.meta.env.DEV, sameSite: 'lax' as const, path: '/', maxAge: SESSION_MAX_AGE }
}

/// Sets (or sends again, for another seven days) the session cookie.
export function keepSessionCookie(sessionId: string) {
  setCookie(SESSION_COOKIE, sessionId, cookieOptions())
}

export function clearSessionCookie() {
  deleteCookie(SESSION_COOKIE, { path: '/' })
}

/// The session id a request carries, from its Cookie header: for server
/// route handlers called with a request of their own.
export function sessionIdOf(request: Request): string | undefined {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0 || part.slice(0, eq).trim() !== SESSION_COOKIE) continue
    const value = part.slice(eq + 1).trim()
    try {
      return decodeURIComponent(value) || undefined
    } catch {
      return value || undefined
    }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Who is signed in

/// The user on the session [id], or null for no such session. The session
/// first, then its user, as Go loaded them.
export async function userForSession(id: string | undefined): Promise<SignedIn | null> {
  if (!id || id.length > 25) return null
  const session = await db.session.findUnique({ where: { id }, include: { user: { select: { id: true, email: true, name: true } } } })
  return session?.user ?? null
}

type Known = { promise: Promise<SignedIn | null>; settled: boolean; user: SignedIn | null }

// Looked up once per request, however many pages, loaders and server
// functions ask.
const known = new WeakMap<Request, Known>()

/// Who this request is from, by its session cookie, or null. A cookie for
/// a live session is sent again so it lasts another seven days; one for a
/// session that is gone is cleared.
export function currentUser(): Promise<SignedIn | null> {
  const request = getRequest()
  let entry = known.get(request)
  if (!entry) {
    const fresh: Known = { promise: lookUp(), settled: false, user: null }
    fresh.promise.then(
      (user) => Object.assign(fresh, { settled: true, user }),
      () => {},
    )
    known.set(request, fresh)
    entry = fresh
  }
  return entry.promise
}

async function lookUp(): Promise<SignedIn | null> {
  const id = getCookie(SESSION_COOKIE)
  if (!id) return null
  const user = await userForSession(id)
  if (user) keepSessionCookie(id)
  else clearSessionCookie()
  return user
}

/// Who this request is from, if currentUser() has already answered for it
/// (the request middleware in src/start.ts asks first, for every page and
/// server function); otherwise nobody. For code that cannot wait.
export function knownUser(): SignedIn | null {
  try {
    const entry = known.get(getRequest())
    return entry?.settled ? entry.user : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Signing in and out

export type AuthOutcome = { ok: true; user: SignedIn } | { ok: false; error: string }

const sameEmail = (email: string) => ({ email: { equals: email.trim(), mode: 'insensitive' as const } })

/// Signs in with [email] (any case) and [password]: a new session, and its
/// cookie on the response.
export async function login(email: string, password: string): Promise<AuthOutcome> {
  const user = email.trim() ? await db.user.findFirst({ where: sameEmail(email), orderBy: { createdAt: 'asc' } }) : null
  const matches = await bcrypt.compare(password, user?.passwordHash ?? NO_USER_HASH)
  if (!user || !matches) {
    console.log(`auth: sign-in refused for ${email.trim() || '(no email)'}`)
    return { ok: false, error: LOGIN_FAILED }
  }
  return { ok: true, user: await startSession(user) }
}

async function startSession(user: SignedIn): Promise<SignedIn> {
  const session = await db.session.create({ data: { id: newSessionId(), userId: user.id } })
  keepSessionCookie(session.id)
  return { id: user.id, email: user.email, name: user.name }
}

/// Signs out: the session's row is deleted and the cookie cleared. False
/// when the request carried no session cookie at all.
export async function logout(): Promise<boolean> {
  const id = getCookie(SESSION_COOKIE)
  if (id === undefined) return false
  if (id) await db.session.deleteMany({ where: { id } })
  clearSessionCookie()
  return true
}

/// Whether /register is open: only while REGISTRATION=enable, as in Go.
export const registrationOpen = () => process.env.REGISTRATION === 'enable'

/// A new user, signed in, while registration is open. Go's checks: an
/// email, a name, and a password of at least five characters.
export async function register(email: string, name: string, password: string): Promise<AuthOutcome> {
  if (!registrationOpen()) return { ok: false, error: 'Registration is closed' }
  email = email.trim()
  name = name.trim()
  if (!email || !email.includes('@')) return { ok: false, error: 'Valid email required' }
  if (!name) return { ok: false, error: 'Valid name required' }
  if (password.length < 5) return { ok: false, error: 'Valid password required' }
  if (await db.user.findFirst({ where: sameEmail(email) })) return { ok: false, error: 'That email already has an account' }
  const user = await db.user.create({ data: { id: newId('usr_'), email, name, passwordHash: await bcrypt.hash(password, BCRYPT_COST) } })
  return { ok: true, user: await startSession(user) }
}

/// Where to go after signing in: [to] if it is a path on this site, else
/// the admin's home.
export function afterSignIn(to: string | null | undefined): string {
  if (to && to.startsWith('/') && !to.startsWith('//') && !to.startsWith('/\\')) return to
  return '/admin'
}

// ---------------------------------------------------------------------------
// The forms

/// What a sign-in or registration form is drawn with again after a refusal:
/// what was typed (never the password) and why it was refused.
export type FormState = { email: string; name: string; error: string }

export const blankForm: FormState = { email: '', name: '', error: '' }

// A refused form's POST handler leaves its state here for the page it then
// draws, in the same request.
const refused = new WeakMap<Request, FormState>()

export function rememberForm(request: Request, state: FormState) {
  refused.set(request, state)
}

/// The refused form this request drew, if any.
export function rememberedForm(): FormState {
  try {
    return refused.get(getRequest()) ?? blankForm
  } catch {
    return blankForm
  }
}

/// A POSTed form's fields, url-encoded or multipart.
export async function formFields(request: Request): Promise<(name: string) => string> {
  const type = request.headers.get('content-type') ?? ''
  const form = type.includes('multipart/form-data') ? await request.formData() : new URLSearchParams(await request.text())
  return (name) => {
    const value = form.get(name)
    return typeof value === 'string' ? value : ''
  }
}
