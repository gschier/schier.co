// Signing in and out (src/server/auth.ts, src/routes/login.tsx, logout.tsx,
// register.tsx), and the MCP's bearer beside it:
//   node --test test/auth.test.ts
//
// Over a scratch database it makes and drops, from two dev servers of the
// site's own: one as production runs (registration closed) and one with
// REGISTRATION=enable. Forms are posted as a browser posts them.

import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import bcrypt from 'bcryptjs'
import { devServer, scratch, signedIn } from './help.ts'

let s: Awaited<ReturnType<typeof scratch>>
let closed: Awaited<ReturnType<typeof devServer>>
let open: Awaited<ReturnType<typeof devServer>>

const PASSWORD = 'correct horse battery'
const WEEK = 60 * 60 * 24 * 7
let greg: { id: string; email: string }

before(async () => {
  s = await scratch('auth')
  // As Go made them: bcrypt, $2a$, cost 10.
  greg = { id: 'usr_greg00000000', email: 'Greg@Example.com' }
  const hash = (await bcrypt.hash(PASSWORD, 10)).replace(/^\$2b\$/, '$2a$')
  assert.match(hash, /^\$2a\$10\$/)
  await s.rows('INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)', [greg.id, greg.email, 'Greg', hash])
  ;[closed, open] = await Promise.all([
    devServer({ DATABASE_URL: s.url, MCP_TOKEN: 'the-token', REGISTRATION: '' }),
    devServer({ DATABASE_URL: s.url, MCP_TOKEN: 'the-token', REGISTRATION: 'enable' }),
  ])
})

after(async () => {
  closed?.stop()
  open?.stop()
  await s?.drop()
})

const get = (path: string, cookie?: string, base = closed.base) => fetch(base + path, { redirect: 'manual', headers: cookie ? { cookie } : {} })

/// [fields] posted to [path] as a browser posts a form, from the site's own
/// page unless [origin] says otherwise.
function post(path: string, fields: Record<string, string>, { cookie, base = closed.base, origin = base }: { cookie?: string; base?: string; origin?: string } = {}) {
  return fetch(base + path, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      origin,
      ...(cookie ? { cookie } : {}),
    },
    body: new URLSearchParams(fields).toString(),
  })
}

/// The session cookie a response sets, if it sets one.
const sidCookie = (res: Response) => res.headers.getSetCookie().find((c) => c.startsWith('sid='))

const sessions = async (userId?: string) =>
  (await s.rows<{ id: string; user_id: string }>(userId ? 'SELECT id, user_id FROM sessions WHERE user_id = $1' : 'SELECT id, user_id FROM sessions', userId ? [userId] : [])).map((r) => r.id)

/// A page's HTML without the dev server's data-tsd-source attributes.
const html = async (res: Response) => (await res.text()).replace(/ data-tsd-source="[^"]*"/g, '')

const sessionOf = (cookie: string) => /^sid=([^;]*)/.exec(cookie)![1]!

// ---------------------------------------------------------------------------

describe('signing in', () => {
  test('the form is the Go site’s, with its classes, and says nothing of registering while closed', async () => {
    const res = await get('/login')
    assert.equal(res.status, 200)
    const page = await html(res)
    assert.match(page, /<title>Login – Gregory Schier<\/title>/)
    assert.match(page, /<meta name="robots" content="noindex"/)
    assert.match(page, /<div class="container form-wrapper"><h1>Sign In<\/h1><form method="post">/)
    assert.match(page, /<div class="form-row"><label class="form-label" for="i-email">Email<\/label><input class="form-input" type="email" placeholder="me@example.com" id="i-email"[^>]* name="email"/)
    assert.match(page, /<div class="form-row"><label class="form-label" for="i-password">Password<\/label><input class="form-input" type="password"[^>]* id="i-password"[^>]* name="password"/)
    assert.match(page, /<div class="form-actions"><button class="btn">Login<\/button><\/div>/)
    assert.doesNotMatch(page, /notice--danger/)
    assert.doesNotMatch(page, /href="\/register"/)
  })

  test('the right password, in any case of the email, makes a session and its cookie, and goes to /admin', async () => {
    const before = await sessions(greg.id)
    const res = await post('/login', { email: 'greg@EXAMPLE.com', password: PASSWORD })
    assert.equal(res.status, 303)
    assert.equal(res.headers.get('location'), '/admin')
    const cookie = sidCookie(res)!
    assert.ok(cookie, 'sets the session cookie')
    assert.match(cookie, /^sid=ses_[a-z0-9]{21};/)
    assert.match(cookie, new RegExp(`; Max-Age=${WEEK}(;|$)`, 'i'))
    assert.match(cookie, /; Path=\/(;|$)/i)
    assert.match(cookie, /; HttpOnly/i)
    assert.match(cookie, /; SameSite=Lax/i)
    assert.doesNotMatch(cookie, /; Secure/i, 'not Secure on a dev server, which is plain http')
    const after = await sessions(greg.id)
    assert.equal(after.length, before.length + 1)
    assert.ok(after.includes(sessionOf(cookie)), 'the cookie holds the new session’s id')

    const admin = await get('/admin', `sid=${sessionOf(cookie)}`)
    assert.equal(admin.status, 200)
    assert.match(await admin.text(), /<h1[^>]*>Posts<\/h1>/)
  })

  test('?to= is followed to a path on this site, and only there', async () => {
    const to = async (query: string) => (await post(`/login${query}`, { email: greg.email, password: PASSWORD })).headers.get('location')
    assert.equal(await to('?to=%2Fadmin%2Fnew'), '/admin/new')
    assert.equal(await to('?to=%2Fblog%2Fa-post%3Fx%3D1'), '/blog/a-post?x=1')
    assert.equal(await to('?to=%2F%2Fevil.example'), '/admin')
    assert.equal(await to('?to=https%3A%2F%2Fevil.example'), '/admin')
    assert.equal(await to('?to=%2F%5Cevil.example'), '/admin')
  })

  test('a wrong password and an unknown email are refused with one message, and make no session', async () => {
    const before = await sessions()
    const messages: string[] = []
    for (const fields of [
      { email: greg.email, password: 'wrong' },
      { email: greg.email, password: '' },
      { email: 'nobody@example.com', password: PASSWORD },
      { email: '', password: '' },
    ]) {
      const res = await post('/login', fields)
      assert.equal(res.status, 200, JSON.stringify(fields))
      assert.equal(sidCookie(res), undefined, `no cookie for ${JSON.stringify(fields)}`)
      const page = await html(res)
      const message = /<p class="notice notice--danger">([^<]*)<\/p>/.exec(page)?.[1]
      assert.ok(message, `the form says why for ${JSON.stringify(fields)}`)
      messages.push(message)
      if (fields.email) assert.match(page, new RegExp(`id="i-email"[^>]*value="${fields.email}"|value="${fields.email}"[^>]*id="i-email"`), 'the email is kept')
      assert.doesNotMatch(page, new RegExp(`value="${PASSWORD}"`), 'the password is never sent back')
    }
    assert.deepEqual(new Set(messages), new Set(['Invalid username or password']))
    assert.deepEqual(await sessions(), before)
  })

  test('a form posted from another site is refused', async () => {
    const res = await post('/login', { email: greg.email, password: PASSWORD }, { origin: 'https://evil.example' })
    assert.equal(res.status, 403)
    assert.equal(sidCookie(res), undefined)
  })
})

describe('the session', () => {
  test('its cookie is sent again with each request, for another seven days', async () => {
    const { cookie, sessionId } = await signedIn(s)
    for (const path of ['/', '/blog', '/admin']) {
      const res = await get(path, cookie)
      const again = sidCookie(res)
      assert.ok(again, `${path} sends the cookie again`)
      assert.match(again, new RegExp(`^sid=${sessionId}; Max-Age=${WEEK}`))
      assert.match(again, /; HttpOnly/i)
      assert.match(again, /; SameSite=Lax/i)
    }
    assert.equal(sidCookie(await get('/')), undefined, 'a visitor without one gets none')
  })

  test('a cookie for a session that is gone is cleared, and signs nobody in', async () => {
    const res = await get('/admin', 'sid=ses_nosuchsession000000')
    assert.equal(res.status, 404)
    assert.match(sidCookie(res)!, /^sid=;.*Max-Age=0/i)
  })
})

describe('signing out', () => {
  test('deletes the session, clears the cookie and goes home', async () => {
    const { cookie, userId } = await signedIn(s)
    const res = await get('/logout', cookie)
    assert.ok([302, 303, 307].includes(res.status), `status ${res.status}`)
    assert.equal(new URL(res.headers.get('location')!, closed.base).pathname, '/')
    assert.match(sidCookie(res)!, /^sid=;.*Max-Age=0/i)
    assert.deepEqual(await sessions(userId), [], 'the session is deleted')
    assert.equal((await get('/admin', cookie)).status, 404, 'the old cookie signs in no more')
  })

  test('by POST too', async () => {
    const { cookie, userId } = await signedIn(s)
    const res = await post('/logout', {}, { cookie })
    assert.ok([302, 303, 307].includes(res.status), `status ${res.status}`)
    assert.match(sidCookie(res)!, /^sid=;.*Max-Age=0/i)
    assert.deepEqual(await sessions(userId), [])
  })

  test('without a session cookie it is the 404 page', async () => {
    const res = await get('/logout')
    assert.equal(res.status, 404)
    assert.match(await res.text(), /Page Not Found/)
  })

  test('the footer links Logout once signed in, and only then', async () => {
    const { cookie } = await signedIn(s)
    assert.match(await html(await get('/', cookie)), /<a href="\/logout" class="btn btn--sm btn--warning">Logout<\/a>/)
    assert.doesNotMatch(await (await get('/')).text(), /href="\/logout"/)
  })
})

describe('registering', () => {
  test('is the 404 page without REGISTRATION=enable, for GET and POST, and makes nobody', async () => {
    const page = await get('/register')
    assert.equal(page.status, 404)
    assert.match(await page.text(), /Page Not Found/)
    const res = await post('/register', { email: 'new@example.com', name: 'New', password: 'a long password' })
    assert.equal(res.status, 404)
    assert.equal(sidCookie(res), undefined)
    assert.deepEqual(await s.rows("SELECT id FROM users WHERE email = 'new@example.com'"), [])
  })

  test('with REGISTRATION=enable it makes a bcrypt-hashed user, signed in', async () => {
    const page = await get('/register', undefined, open.base)
    assert.equal(page.status, 200)
    const form = await html(page)
    assert.match(form, /<h1>Create an Account<\/h1>/)
    assert.match(form, /id="i-name"/)
    assert.match(await html(await get('/login', undefined, open.base)), /<a href="\/register">or signup<\/a>/)

    const res = await post('/register', { email: 'new@example.com', name: 'New Author', password: 'a long password' }, { base: open.base })
    assert.equal(res.status, 303)
    assert.equal(res.headers.get('location'), '/admin')
    const cookie = sidCookie(res)!
    assert.match(cookie, /^sid=ses_/)
    const [user] = await s.rows<{ id: string; name: string; password_hash: string }>("SELECT id, name, password_hash FROM users WHERE email = 'new@example.com'")
    assert.ok(user, 'the user is made')
    assert.match(user.id, /^usr_[a-z0-9]{12}$/)
    assert.equal(user.name, 'New Author')
    assert.match(user.password_hash, /^\$2[ab]\$10\$/)
    assert.ok(await bcrypt.compare('a long password', user.password_hash))
    assert.deepEqual(await sessions(user.id), [sessionOf(cookie)])

    // And the new account signs in with the form.
    const login = await post('/login', { email: 'NEW@example.com', password: 'a long password' }, { base: open.base })
    assert.equal(login.status, 303)
  })

  test('refuses what Go refused, and an email that has an account', async () => {
    const refusal = async (fields: Record<string, string>) => {
      const res = await post('/register', fields, { base: open.base })
      assert.equal(res.status, 200)
      assert.equal(sidCookie(res), undefined)
      return /<p class="notice notice--danger">([^<]*)<\/p>/.exec(await html(res))?.[1]
    }
    assert.equal(await refusal({ email: '', name: 'A', password: 'long enough' }), 'Valid email required')
    assert.equal(await refusal({ email: 'a@example.com', name: '', password: 'long enough' }), 'Valid name required')
    assert.equal(await refusal({ email: 'a@example.com', name: 'A', password: '1234' }), 'Valid password required')
    assert.equal(await refusal({ email: 'greg@example.COM', name: 'A', password: 'long enough' }), 'That email already has an account')
    assert.deepEqual(await s.rows("SELECT id FROM users WHERE email = 'a@example.com'"), [])
  })
})

describe('the MCP', () => {
  const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } }
  const rpc = (headers: Record<string, string>) =>
    fetch(`${closed.base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
      body: JSON.stringify(initialize),
    })

  test('answers with the bearer token', async () => {
    const res = await rpc({ authorization: 'Bearer the-token' })
    assert.equal(res.status, 200)
    assert.equal((await res.json()).result.serverInfo.name, 'schier-co-admin')
  })

  test('refuses without it, and a session cookie is not a way in', async () => {
    const { cookie } = await signedIn(s)
    assert.equal((await rpc({})).status, 401)
    assert.equal((await rpc({ cookie })).status, 401)
    assert.equal((await rpc({ authorization: 'Bearer wrong' })).status, 401)
  })
})
