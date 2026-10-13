#!/usr/bin/env node
// The admin and the editor in a real browser, on a running dev server:
//
//   npm run dev                       (in another terminal)
//   node scripts/editor-check.mjs [port-url]
//
// Makes a throwaway user in the local database (DATABASE_URL, localhost
// only; never anyone else's row), signs in with it through the form at
// /login, tries the body's keys, writes a post (a
// heading, a list and a code block), waits for the live preview, uploads a
// small PNG it makes and waits for the image in the preview, drops another
// on the social image field, saves with Cmd-S, publishes, opens the public
// post, deletes the post again and signs out, and deletes the user, so the
// database is left as it was (the uploaded files are removed from
// ASSETS_DIR too). Screenshots of /login at 1280 and 390 wide, and of the
// list and the editor at 1280, light and dark, go to shots/login-*.png,
// shots/admin-*.png and shots/editor-*.png. Default address
// http://localhost:3200.
//
// The browser is Playwright's headless shell (never Google Chrome.app; see
// AGENTS.md), closed however the run ends.

import assert from 'node:assert/strict'
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'
import bcrypt from 'bcryptjs'
import pg from 'pg'
import { chromium } from 'playwright-core'

const [BASE = 'http://localhost:3200'] = process.argv.slice(2)
const root = new URL('..', import.meta.url).pathname
const out = join(root, 'shots')
const WIDTH = 1280

// The local database the dev server uses, and nothing else.
const DATABASE = new URL(process.env.DATABASE_URL ?? 'postgresql://schierco:schierco@localhost:5439/schierco')
assert.ok(['localhost', '127.0.0.1'].includes(DATABASE.hostname), `the check makes its user on localhost only, not ${DATABASE.hostname}`)
const CHECKER = { id: `usr_check${Date.now().toString(36)}`.slice(0, 25), email: `editor-check-${Date.now()}@example.invalid`, password: `check-${Math.random().toString(36).slice(2)}` }

function headlessShell() {
  if (process.env.PLAYWRIGHT_HEADLESS_SHELL) return process.env.PLAYWRIGHT_HEADLESS_SHELL
  const cache = join(homedir(), 'Library/Caches/ms-playwright')
  const builds = readdirSync(cache)
    .filter((d) => d.startsWith('chromium_headless_shell-'))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
  if (!builds.length) throw new Error(`no headless shell in ${cache}; install one with npx playwright install chromium-headless-shell`)
  const dir = join(cache, builds[0])
  const arch = readdirSync(dir).find((d) => d.startsWith('chrome-headless-shell-'))
  return join(dir, arch, 'chrome-headless-shell')
}

/// A [width] by [height] PNG in stripes of blue and orange.
function png(width, height) {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const rows = []
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3)
    for (let x = 0; x < width; x++) row.set(Math.floor(x / 20) % 2 ? [237, 137, 54] : [66, 153, 225], 1 + x * 3)
    rows.push(row)
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))])
}

const MARKDOWN = ['## A heading for the check', '', 'Some words in a paragraph.', '', '- one', '- two', '', '```js', 'const answer = 42', 'console.log(answer)', '```', ''].join('\n')

mkdirSync(out, { recursive: true })
const database = new pg.Client({ connectionString: DATABASE.href })
await database.connect()
await database.query('INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)', [CHECKER.id, CHECKER.email, 'Editor check', await bcrypt.hash(CHECKER.password, 10)])
let browser
try {
  browser = await chromium.launch({ executablePath: headlessShell(), headless: true })
} catch (error) {
  await database.query('DELETE FROM users WHERE id = $1', [CHECKER.id])
  await database.end()
  throw error
}
const errors = []
let created = null
let uploaded = null
let social = null
let current = null
const step = (text) => console.log(`- ${text}`)

async function context(mode) {
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 900 }, deviceScaleFactor: 1, colorScheme: mode })
  const page = await ctx.newPage()
  current ??= page
  page.on('pageerror', (e) => errors.push(`${mode}: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`${mode} console: ${m.text()}`))
  page.on('dialog', (d) => d.accept())
  return { ctx, page }
}

try {
  // Signed out, the admin is a 404.
  const stranger = await browser.newContext()
  for (const path of ['/admin', '/admin/new', '/admin/edit/x', '/admin?token=test']) assert.equal((await (await stranger.newPage()).goto(BASE + path)).status(), 404, path)
  await stranger.close()
  step('signed out, /admin, /admin/new, /admin/edit/x and /admin?token= are the 404 page')

  // The sign-in form, as a stranger sees it.
  for (const width of [1280, 390]) {
    for (const mode of ['light', 'dark']) {
      const shot = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: mode })
      const login = await shot.newPage()
      assert.equal((await login.goto(`${BASE}/login`, { waitUntil: 'networkidle' })).status(), 200)
      await login.screenshot({ path: join(out, `login-${width}-${mode}.png`), fullPage: true })
      await shot.close()
    }
  }
  step('screenshots of /login at 1280 and 390 wide, light and dark')

  const { ctx, page } = await context('light')

  // A wrong password is refused on the form, and signs nobody in.
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('#i-email', CHECKER.email)
  await page.fill('#i-password', 'not the password')
  await page.getByRole('button', { name: 'Login' }).click()
  await page.locator('.notice--danger', { hasText: 'Invalid username or password' }).waitFor()
  assert.equal(await page.inputValue('#i-email'), CHECKER.email, 'the email is kept')
  assert.equal(await page.inputValue('#i-password'), '', 'the password is not')
  assert.equal((await ctx.cookies()).find((c) => c.name === 'sid'), undefined)
  await page.screenshot({ path: join(out, 'login-1280-light-refused.png') })
  step('a wrong password: the form says so, keeps the email, and no cookie is set')

  await page.fill('#i-password', CHECKER.password)
  await page.getByRole('button', { name: 'Login' }).click()
  await page.waitForURL('**/admin')
  await page.getByRole('heading', { name: 'Posts', level: 1 }).waitFor()
  await page.waitForLoadState('networkidle')
  const cookie = (await ctx.cookies()).find((c) => c.name === 'sid')
  assert.ok(cookie?.httpOnly, 'the session cookie is httpOnly')
  assert.equal(cookie.sameSite, 'Lax')
  assert.ok(cookie.expires * 1000 > Date.now() + 6.9 * 24 * 3600 * 1000, 'and lasts seven days')
  step(`signed in through /login: at /admin, cookie ${cookie.name} httpOnly, SameSite=Lax, seven days`)
  await page.screenshot({ path: join(out, 'admin-1280-light.png') })

  await page.getByRole('link', { name: 'New post' }).click()
  await page.waitForURL('**/admin/new')
  await page.waitForFunction(() => document.querySelector('#i-content') && !document.querySelector('#i-content').disabled)
  // As saving capitalises it.
  const title = `Editor Check ${Date.now()}`
  await page.fill('#i-title', title)
  // The body's keys: Tab puts in a tab, Enter keeps the indent, Shift-Tab
  // takes two spaces back from the selected lines.
  await page.click('#i-content')
  await page.keyboard.type('a')
  await page.keyboard.press('Tab')
  await page.keyboard.type('b')
  await page.keyboard.press('Enter')
  await page.keyboard.type('    c')
  await page.keyboard.press('Enter')
  await page.keyboard.type('d')
  assert.equal(await page.inputValue('#i-content'), 'a\tb\n    c\n    d')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Shift+Tab')
  assert.equal(await page.inputValue('#i-content'), 'a\tb\n  c\n  d')
  await page.keyboard.press('ControlOrMeta+z')
  assert.equal(await page.inputValue('#i-content'), 'a\tb\n    c\n    d', 'undo takes it back')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Backspace')
  step('Tab, Shift-Tab, Enter and undo in the body behave as CodeMirror did')
  await page.keyboard.type(MARKDOWN)
  await page.waitForSelector('article.blog-post h2#a-heading-for-the-check')
  await page.waitForSelector('article.blog-post ul li >> text=two')
  await page.waitForSelector('article.blog-post pre.shiki >> text=const answer = 42')
  step('typed a heading, a list and a code block; the preview shows all three')

  await page.setInputFiles('.editor__upload input', { name: 'stripes.png', mimeType: 'image/png', buffer: png(240, 120) })
  await page.waitForFunction(() => /!\[stripes\.png\]\(\/media\/images\/a\/\d+\.png\)/.test(document.querySelector('#i-content').value))
  uploaded = /\/media\/(images\/a\/\d+\.png)/.exec(await page.inputValue('#i-content'))[1]
  await page.waitForFunction(() => {
    const img = document.querySelector('article.blog-post img[src^="/media/images/a/"]')
    return img && img.complete && img.naturalWidth === 240
  })
  step(`uploaded a PNG: /media/${uploaded} inserted at the cursor and drawn in the preview`)

  // An image dropped on the social image field is uploaded into it. A
  // second later, so its key is not the first one's.
  await page.waitForTimeout(1100)
  const bytes = [...png(60, 30)]
  await page.evaluate((bytes) => {
    const data = new DataTransfer()
    data.items.add(new File([new Uint8Array(bytes)], 'social.png', { type: 'image/png' }))
    document.querySelector('#i-image').dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }))
  }, bytes)
  await page.waitForFunction(() => /^\/media\/images\/a\/\d+\.png$/.test(document.querySelector('#i-image').value))
  social = (await page.inputValue('#i-image')).slice('/media/'.length)
  assert.notEqual(social, uploaded)
  step(`dropped an image on the social image field: /media/${social}`)

  await page.keyboard.press('ControlOrMeta+s')
  await page.waitForFunction(() => /\/admin\/edit\/pst_/.test(location.pathname))
  await page.getByText('Saved', { exact: true }).first().waitFor()
  created = new URL(page.url()).pathname.split('/').pop()
  step(`saved with Cmd-S: the page moved to /admin/edit/${created}`)

  await page.getByRole('button', { name: 'Publish' }).click()
  await page.getByText('Published and dated now').waitFor()
  await page.locator('.editor__head .admin-state--published').waitFor()
  const slug = await page.inputValue('#i-slug')
  step(`published as /blog/${slug}`)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: join(out, 'editor-1280-light.png'), fullPage: true })

  await page.getByRole('button', { name: 'Full screen' }).click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(out, 'editor-full-1280-light.png') })
  await page.keyboard.press('Escape')

  // Dark mode, in a browser that prefers it, signed in with the same cookie.
  const dark = await context('dark')
  await dark.ctx.addCookies([{ ...cookie }])
  await dark.page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' })
  await dark.page.screenshot({ path: join(out, 'admin-1280-dark.png') })
  await dark.page.goto(`${BASE}/admin/edit/${created}`, { waitUntil: 'networkidle' })
  await dark.page.waitForSelector('article.blog-post pre.shiki')
  await dark.page.waitForFunction(() => document.querySelector('article.blog-post img')?.complete)
  await dark.page.screenshot({ path: join(out, 'editor-1280-dark.png'), fullPage: true })
  await dark.ctx.close()
  step('screenshots taken')

  // The public post, as a reader sees it.
  const reader = await browser.newContext({ viewport: { width: WIDTH, height: 900 } })
  const post = await reader.newPage()
  assert.equal((await post.goto(`${BASE}/blog/${slug}`)).status(), 200)
  await post.waitForFunction(() => {
    const img = document.querySelector('article.blog-post img[src^="/media/images/a/"]')
    return img && img.complete && img.naturalWidth === 240
  })
  assert.equal(await post.textContent('article.blog-post h1'), title)
  await post.waitForSelector('article.blog-post figure figcaption >> text=stripes.png')
  await post.waitForSelector('article.blog-post pre.shiki')
  step('the public page draws the post, its heading, list, code and the image')
  await reader.close()

  await page.getByRole('button', { name: 'Delete' }).click()
  await page.waitForURL('**/admin')
  created = null
  const gone = await browser.newContext()
  assert.equal((await (await gone.newPage()).goto(`${BASE}/blog/${slug}`)).status(), 404)
  await gone.close()
  step('deleted: the editor went back to /admin, and the post is a 404')

  // Signing out with the footer's Logout.
  await page.getByRole('link', { name: 'Logout' }).click()
  await page.waitForURL((url) => url.pathname === '/')
  assert.equal((await ctx.cookies()).find((c) => c.name === 'sid'), undefined, 'the cookie is cleared')
  assert.equal((await page.goto(`${BASE}/admin`)).status(), 404)
  const { rows } = await database.query('SELECT id FROM sessions WHERE user_id = $1', [CHECKER.id])
  assert.deepEqual(rows, [], 'the session is deleted')
  step('signed out with the footer link: home, cookie cleared, session deleted, /admin a 404 again')
  await ctx.close()

  if (errors.length) console.log(`\nbrowser errors:\n${errors.join('\n')}`)
  else console.log('\nno browser errors')
} catch (error) {
  process.exitCode = 1
  console.error(error)
  if (errors.length) console.error(`\nbrowser errors:\n${errors.join('\n')}`)
  if (current) {
    await current.screenshot({ path: join(out, 'editor-check-failed.png'), fullPage: true }).catch(() => {})
    console.error(`at ${current.url()}; screenshot in shots/editor-check-failed.png`)
  }
} finally {
  if (created) console.log(`left behind: post ${created}; delete it at ${BASE}/admin/edit/${created}`)
  const dir = join(root, process.env.ASSETS_DIR || '.media')
  for (const key of [uploaded, social].filter(Boolean)) {
    rmSync(join(dir, key), { force: true })
    rmSync(join(dir, '.meta', `${key}.json`), { force: true })
  }
  await browser.close().catch(() => {})
  await database.query('DELETE FROM users WHERE id = $1', [CHECKER.id]).catch((error) => console.error(`left behind: user ${CHECKER.email} (${error.message})`))
  await database.end().catch(() => {})
}
