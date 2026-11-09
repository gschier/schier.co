#!/usr/bin/env node
// The admin and the editor in a real browser, on a running dev server:
//
//   npm run dev                       (in another terminal)
//   nice -n 10 node scripts/editor-check.mjs [base-url]
//
// Makes a throwaway user in the local database (DATABASE_URL, localhost
// only; never anyone else's row) and signs in with it through the form at
// /login. Then, at desktop size, it types into the CodeMirror body through
// the keyboard: Tab, Shift-Tab, Enter keeping the indent and undo; a post
// with headings, a list and a code block, waiting for the live preview. It
// pastes an image (the upload held back a moment, to see the file drawn
// dimmed while it goes), checks its markdown and thumbnail, undoes and
// redoes it, replaces it through the decoration's Replace, drops another on
// the social image field, saves with Cmd-S, publishes, checks the preview
// follows the cursor to a heading, goes full screen, and reloads with an
// unsaved change to restore it from the browser's copy. At phone size it
// switches Write and Preview from the bottom bar, opens Other Fields as a
// sheet and saves from the bar. Last it opens the public post, deletes it,
// signs out and deletes the user, so the database is left as it was (the
// uploaded files are removed from ASSETS_DIR too).
//
// Screenshots go to SHOTS_DIR (default shots/, gitignored): /login, the
// list, and the editor at 1280 by 860 and 390 by 844, light and dark, with
// the upload, full screen, Other Fields and the restore notice.
//
// The browser is Playwright's headless shell (never Google Chrome.app; see
// AGENTS.md), one at a time, closed however the run ends.

import assert from 'node:assert/strict'
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'
import bcrypt from 'bcryptjs'
import pg from 'pg'
import { chromium } from 'playwright-core'

const [BASE = 'http://localhost:3200'] = process.argv.slice(2)
const root = new URL('..', import.meta.url).pathname
const out = resolve(root, process.env.SHOTS_DIR || 'shots')
const DESKTOP = { width: 1280, height: 860 }
const PHONE = { width: 390, height: 844 }

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

/// A [width] by [height] PNG in stripes of two colours.
function png(width, height, a = [66, 153, 225], b = [237, 137, 54]) {
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
    for (let x = 0; x < width; x++) row.set(Math.floor(x / 20) % 2 ? b : a, 1 + x * 3)
    rows.push(row)
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))])
}

const PARAGRAPH = 'Some words in a paragraph, long enough to wrap across the line a few times so the body has some height to it and the preview has to scroll to keep up with the cursor.'
const MARKDOWN = [
  '## A heading for the check',
  '',
  'Some **bold** and *italic* words, `inline code` and [a link](/blog).',
  '',
  '- one',
  '- two',
  '',
  '> A quote, quieter.',
  '',
  '```js',
  'const answer = 42',
  'console.log(answer)',
  '```',
  '',
  ...Array.from({ length: 8 }, () => [PARAGRAPH, '']).flat(),
  '## The second heading',
  '',
  'The end.',
  '',
].join('\n')

/// The body's text, from CodeMirror's own state (the DOM link its
/// EditorView.findFromDOM follows).
const bodyText = (page) => page.evaluate(() => document.querySelector('.editor .cm-content').cmTile.root.view.state.doc.toString())

/// Puts the cursor at the end of the body's line holding [text].
const cursorAt = (page, text) =>
  page.evaluate((text) => {
    const view = document.querySelector('.editor .cm-content').cmTile.root.view
    const at = view.state.doc.toString().indexOf(text)
    if (at < 0) throw new Error(`no ${text} in the body`)
    view.focus()
    view.dispatch({ selection: { anchor: view.state.doc.lineAt(at).to }, scrollIntoView: true })
  }, text)

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
const uploads = []
let current = null
let signedOut = false
const step = (text) => console.log(`- ${text}`)
const shot = (page, name, options = {}) => page.screenshot({ path: join(out, `${name}.png`), ...options })

async function context(mode, size = DESKTOP, mobile = false) {
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, colorScheme: mode })
  const page = await ctx.newPage()
  current = page
  page.on('pageerror', (e) => errors.push(`${mode}: ${e.message}`))
  page.on('console', (m) => {
    // The admin is a 404 once signed out, which the check asks for.
    if (m.type() !== 'error' || (signedOut && /status of 404/.test(m.text()))) return
    errors.push(`${mode} console: ${m.text()}`)
  })
  page.on('dialog', (d) => d.accept())
  return { ctx, page }
}

/// Waits for the editor to be ready: CodeMirror drawn and the page hydrated.
async function ready(page) {
  await page.waitForSelector('.editor .cm-content[contenteditable="true"]')
  await page.waitForLoadState('networkidle')
  // The dev server's TanStack devtools button (never in a build) sits over
  // the bottom bar's Save; out of the way.
  await page.evaluate(() => {
    for (const mark of document.querySelectorAll('[id^="tsd-trigger"]')) {
      let node = mark.parentElement
      while (node && node !== document.body && getComputedStyle(node).position !== 'fixed') node = node.parentElement
      if (node && node !== document.body) node.style.display = 'none'
    }
  })
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
      const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: mode })
      const login = await context.newPage()
      assert.equal((await login.goto(`${BASE}/login`, { waitUntil: 'networkidle' })).status(), 200)
      await shot(login, `login-${width}-${mode}`, { fullPage: true })
      await context.close()
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
  await shot(page, 'admin-1280-light')

  // The admin installs as an app of its own.
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]')
    return { href: link?.getAttribute('href'), body: link && (await (await fetch(link.href)).json()), capable: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.content }
  })
  assert.equal(manifest.href, '/admin.webmanifest')
  assert.equal(manifest.body.start_url, '/admin')
  assert.equal(manifest.body.display, 'standalone')
  assert.equal(manifest.capable, 'yes')
  step('the admin links its own manifest (start /admin, standalone) and the iOS app tags')

  await page.getByRole('link', { name: 'New post' }).click()
  await page.waitForURL('**/admin/new')
  await ready(page)
  // As saving capitalises it.
  const title = `Editor Check ${Date.now()}`
  await page.fill('#i-title', title)

  // The body's keys: Tab puts in a tab, Enter keeps the indent, Shift-Tab
  // and Tab with a selection take two spaces from or give two to its lines.
  await page.click('.editor .cm-content')
  await page.keyboard.type('a')
  await page.keyboard.press('Tab')
  await page.keyboard.type('b')
  await page.keyboard.press('Enter')
  await page.keyboard.type('    c')
  await page.keyboard.press('Enter')
  await page.keyboard.type('d')
  assert.equal(await bodyText(page), 'a\tb\n    c\n    d')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Shift+Tab')
  assert.equal(await bodyText(page), 'a\tb\n  c\n  d')
  await page.keyboard.press('ControlOrMeta+z')
  assert.equal(await bodyText(page), 'a\tb\n    c\n    d', 'undo takes it back')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Tab')
  assert.equal(await bodyText(page), '  a\tb\n      c\n      d')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Backspace')
  assert.equal(await bodyText(page), '')
  step('Tab, Shift-Tab, Tab on a selection, Enter and undo in the body behave as the textarea did')

  await page.keyboard.type(MARKDOWN)
  assert.equal(await bodyText(page), MARKDOWN, 'typed as is: no list continued, no indent added')
  await page.waitForSelector('article.blog-post h2#a-heading-for-the-check')
  await page.waitForSelector('article.blog-post ul li >> text=two')
  await page.waitForSelector('article.blog-post pre.shiki >> text=const answer = 42')
  for (const selector of ['.md-h2', '.md-mark', '.md-strong', '.md-em', '.md-code', '.md-link', '.md-quote', '.cm-line.md-fence']) assert.ok(await page.locator(`.editor .cm-content ${selector}`).count(), `the body styles ${selector}`)
  assert.ok((await page.locator('.editor .cm-content').getAttribute('spellcheck')) === 'true', 'spelling is checked')
  step('typed headings, a list, a quote and a code block: styled in the body with the marks kept, and drawn in the preview')

  // A pasted image: drawn dimmed from the file while it uploads, then its
  // markdown at the cursor and its thumbnail under the line.
  await cursorAt(page, 'console.log(answer)')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  let release
  const held = new Promise((r) => (release = r))
  await page.route('**/api/admin/upload', async (route) => {
    await held
    await route.continue()
  })
  const pasted = [...png(240, 120)]
  await page.evaluate((bytes) => {
    const data = new DataTransfer()
    data.items.add(new File([new Uint8Array(bytes)], 'stripes.png', { type: 'image/png' }))
    document.querySelector('.editor .cm-content').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, pasted)
  await page.waitForSelector('.cm-image--uploading img[src^="blob:"]')
  await page.waitForSelector('.cm-image--uploading .cm-image__progress')
  assert.ok(!(await bodyText(page)).includes('stripes.png'), 'no markdown until the upload is done')
  await page.locator('.cm-image--uploading').scrollIntoViewIfNeeded()
  await shot(page, 'editor-1280-light-uploading')
  release()
  await page.waitForFunction(() => /!\[stripes\.png\]\(\/media\/images\/a\/\d+\.png\)/.test(document.querySelector('.editor .cm-content').cmTile.root.view.state.doc.toString()))
  await page.unroute('**/api/admin/upload')
  const first = /\/media\/(images\/a\/\d+\.png)/.exec(await bodyText(page))[1]
  uploads.push(first)
  await page.waitForFunction(() => {
    const img = document.querySelector('.cm-image:not(.cm-image--uploading) img[src^="/media/images/a/"]')
    return img && img.complete && img.naturalWidth === 240
  })
  await page.waitForSelector('.cm-image .cm-image__size >> text=240 × 120')
  await page.waitForFunction(() => {
    const img = document.querySelector('article.blog-post img[src^="/media/images/a/"]')
    return img && img.complete && img.naturalWidth === 240
  })
  step(`pasted a PNG: drawn dimmed with a running bar while it uploaded, then /media/${first} inserted at the cursor, its thumbnail under the line, and drawn in the preview`)

  await page.keyboard.press('ControlOrMeta+z')
  assert.ok(!(await bodyText(page)).includes('stripes.png'), 'undo takes the image out')
  await page.keyboard.press('ControlOrMeta+Shift+z')
  assert.ok((await bodyText(page)).includes(`![stripes.png](/media/${first})`), 'redo puts it back')
  step('undo takes the pasted image out in one step, redo puts it back')

  // Two images pasted at once go in one after the other, in order. Each
  // upload is held a second, since two in the same second share a key.
  await cursorAt(page, 'The end.')
  await page.keyboard.press('Enter')
  await page.route('**/api/admin/upload', async (route) => {
    await new Promise((r) => setTimeout(r, 1100))
    await route.continue()
  })
  const pair = [[...png(40, 20)], [...png(50, 20)]]
  await page.evaluate((pair) => {
    const data = new DataTransfer()
    pair.forEach((bytes, i) => data.items.add(new File([new Uint8Array(bytes)], `pair-${i + 1}.png`, { type: 'image/png' })))
    document.querySelector('.editor .cm-content').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, pair)
  await page.waitForFunction(() => /pair-2\.png\]\(\/media\//.test(document.querySelector('.editor .cm-content').cmTile.root.view.state.doc.toString()), null, { timeout: 15000 })
  await page.unroute('**/api/admin/upload')
  const pairText = await bodyText(page)
  const pairKeys = [...pairText.matchAll(/!\[pair-\d\.png\]\(\/media\/(images\/a\/\d+\.png)\)/g)].map((m) => m[1])
  uploads.push(...pairKeys)
  assert.ok(pairText.indexOf('pair-1.png') < pairText.indexOf('pair-2.png'), 'the pair keeps its order')
  assert.match(pairText, /The end\.\n!\[pair-1\.png\]\([^)]+\)\n!\[pair-2\.png\]\([^)]+\)\n/)
  // Out again, so the rest of the check sees the post it expects.
  await page.evaluate(() => {
    const view = document.querySelector('.editor .cm-content').cmTile.root.view
    const text = view.state.doc.toString()
    const from = text.indexOf('The end.') + 'The end.'.length
    view.dispatch({ changes: { from, to: text.length, insert: '\n' } })
  })
  step('two images pasted at once went in one after the other, in order')

  // Replace: a new file, uploaded, its URL written over the old one.
  await page.waitForTimeout(1100)
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.cm-image .cm-image__replace').click()])
  await chooser.setFiles({ name: 'other.png', mimeType: 'image/png', buffer: png(180, 90, [72, 187, 120], [45, 55, 72]) })
  await page.waitForFunction((first) => {
    const text = document.querySelector('.editor .cm-content').cmTile.root.view.state.doc.toString()
    return !text.includes(first) && /!\[stripes\.png\]\(\/media\/images\/a\/\d+\.png\)/.test(text)
  }, first)
  const second = /\/media\/(images\/a\/\d+\.png)/.exec(await bodyText(page))[1]
  uploads.push(second)
  assert.notEqual(second, first)
  await page.waitForFunction(() => document.querySelector('.cm-image img[src^="/media/"]')?.naturalWidth === 180)
  step(`Replace uploaded another file and rewrote the URL in place: /media/${second}, alt text kept`)

  // An image dropped on the social image field is uploaded into it.
  await page.locator('.editor__other > summary').click()
  await page.waitForTimeout(1100)
  const bytes = [...png(60, 30)]
  await page.evaluate((bytes) => {
    const data = new DataTransfer()
    data.items.add(new File([new Uint8Array(bytes)], 'social.png', { type: 'image/png' }))
    document.querySelector('#i-image').dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }))
  }, bytes)
  await page.waitForFunction(() => /^\/media\/images\/a\/\d+\.png$/.test(document.querySelector('#i-image').value))
  const social = (await page.inputValue('#i-image')).slice('/media/'.length)
  uploads.push(social)
  assert.ok(!uploads.slice(0, -1).includes(social))
  await page.waitForLoadState('networkidle')
  await shot(page, 'editor-1280-light-other-fields')
  // Open, the page scrolls and the buttons hold at the bottom of the window.
  const foot = await page.locator('.editor__foot').boundingBox()
  assert.ok(foot && foot.y + foot.height <= DESKTOP.height + 1, `the buttons stay on screen with Other Fields open (bottom at ${foot && foot.y + foot.height})`)
  await page.locator('.editor__other > summary').click()
  step(`dropped an image on the social image field: /media/${social}; with Other Fields open, the buttons hold at the window's bottom`)

  await cursorAt(page, 'The end.')
  await page.evaluate(() => (document.querySelector('.editor .cm-content').dataset.check = 'same'))
  await page.keyboard.press('ControlOrMeta+s')
  await page.waitForFunction(() => /\/admin\/edit\/pst_/.test(location.pathname))
  await page.locator('.editor__actions .editor__save', { hasText: 'Saved' }).waitFor()
  await page.waitForTimeout(500)
  assert.equal(await page.locator('.editor .cm-content').getAttribute('data-check'), 'same', 'the first save keeps the editor as it is, undo history and all')
  created = new URL(page.url()).pathname.split('/').pop()
  step(`saved with Cmd-S from the body: the page moved to /admin/edit/${created} without being made anew, and Save says Saved`)

  await page.locator('.editor__actions').getByRole('button', { name: 'Publish' }).click()
  await page.getByText('Published and dated now').waitFor()
  await page.locator('.editor__title .admin-state--published').waitFor()
  const slug = await page.inputValue('#i-slug')
  step(`published as /blog/${slug}`)

  // The preview follows the cursor from heading to heading.
  await cursorAt(page, 'Some **bold**')
  await page.waitForFunction(() => document.querySelector('.editor__preview').scrollTop < 200)
  await cursorAt(page, '## The second heading')
  await page.waitForFunction(() => {
    const box = document.querySelector('.editor__preview')
    const heading = document.querySelector('article.blog-post h2#the-second-heading')
    if (!box || !heading) return false
    const offset = heading.getBoundingClientRect().top - box.getBoundingClientRect().top
    return box.scrollTop > 0 && offset >= 0 && offset < 60
  })
  await cursorAt(page, 'Some **bold**')
  await page.waitForFunction(() => {
    const box = document.querySelector('.editor__preview')
    const heading = document.querySelector('article.blog-post h2#a-heading-for-the-check')
    const offset = heading.getBoundingClientRect().top - box.getBoundingClientRect().top
    return offset >= 0 && offset < 60
  })
  step('the preview scrolls to the heading the cursor is under, down and back up')

  await cursorAt(page, 'A quote, quieter.')
  await page.waitForTimeout(400)
  await shot(page, 'editor-1280-light')

  await page.getByRole('button', { name: 'Full screen' }).click()
  await page.waitForTimeout(300)
  assert.equal(await page.locator('#i-title').isVisible(), false, 'full screen hides the title')
  await shot(page, 'editor-full-1280-light')
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('#i-title').isVisible(), true, 'Escape leaves full screen')
  step('full screen covers the window with the two panes; Escape leaves it')

  // Nothing lost: an unsaved change survives a reload, offered back.
  await cursorAt(page, 'The end.')
  await page.keyboard.type(' Kept in the browser.')
  await page.waitForTimeout(300)
  await page.reload()
  await ready(page)
  await page.locator('.editor__kept').waitFor()
  assert.ok(!(await bodyText(page)).includes('Kept in the browser.'), 'not restored silently')
  assert.notEqual(await page.locator('.editor__panes').getAttribute('inert'), null, 'nothing can be changed until Restore or Discard')
  await shot(page, 'editor-1280-light-kept')
  await page.getByRole('button', { name: 'Restore' }).click()
  assert.ok((await bodyText(page)).includes('The end. Kept in the browser.'), 'Restore puts it back')
  await page.locator('.editor__actions .editor__save', { hasText: 'Save' }).waitFor()
  await page.keyboard.press('ControlOrMeta+s')
  await page.locator('.editor__actions .editor__save', { hasText: 'Saved' }).waitFor()
  await page.reload()
  await ready(page)
  await page.waitForTimeout(300)
  assert.equal(await page.locator('.editor__kept').count(), 0, 'saving cleared the kept copy')
  assert.ok((await bodyText(page)).includes('Kept in the browser.'))
  step('an unsaved change, after a reload: offered with Restore and Discard, restored, saved, and not offered again')

  // Dark mode, in a browser that prefers it, signed in with the same cookie.
  const dark = await context('dark')
  await dark.ctx.addCookies([{ ...cookie }])
  await dark.page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' })
  await shot(dark.page, 'admin-1280-dark')
  await dark.page.goto(`${BASE}/admin/edit/${created}`)
  await ready(dark.page)
  await dark.page.waitForSelector('article.blog-post pre.shiki')
  await cursorAt(dark.page, 'A quote, quieter.')
  await dark.page.waitForTimeout(400)
  await shot(dark.page, 'editor-1280-dark')
  await dark.ctx.close()
  step('desktop screenshots taken, light and dark')

  // The phone: one pane, the bottom bar, Other Fields as a sheet.
  for (const mode of ['light', 'dark']) {
    const phone = await context(mode, PHONE, true)
    await phone.ctx.addCookies([{ ...cookie }])
    await phone.page.goto(`${BASE}/admin/edit/${created}`)
    await ready(phone.page)
    const p = phone.page
    const bar = p.locator('.editor__actionbar')
    await bar.waitFor()
    assert.equal(await p.locator('.editor__pane--preview').isVisible(), false, 'one pane: the preview is hidden while writing')
    assert.equal(await p.locator('.top-nav').isVisible(), false, "the site's nav is gone")
    assert.equal(await p.locator('.editor__actions').isVisible(), false, 'the buttons under the body give way to the bar')
    const box = await bar.boundingBox()
    assert.ok(Math.abs(box.y + box.height - PHONE.height) < 2, 'the bar sits at the bottom of the window')
    await shot(p, `editor-390-${mode}`)

    await bar.getByRole('button', { name: 'Preview' }).click()
    await p.locator('.editor__pane--preview article h2#the-second-heading').waitFor()
    assert.equal(await p.locator('.editor .cm-content').isVisible(), false, 'Preview hides the body')
    await bar.getByRole('button', { name: 'Write' }).waitFor()
    await p.waitForTimeout(300)
    await shot(p, `editor-390-${mode}-preview`)
    await bar.getByRole('button', { name: 'Write' }).click()
    await p.locator('.editor .cm-content').waitFor()

    await p.locator('.editor__other > summary').click()
    const sheet = p.locator('.editor__sheet')
    await sheet.waitFor()
    assert.equal(await sheet.evaluate((el) => getComputedStyle(el).position), 'fixed', 'Other Fields opens as a sheet')
    for (const name of ['Unlist', 'Delete']) assert.ok(await sheet.getByRole('button', { name }).isVisible(), `${name} is in the sheet`)
    assert.ok(await sheet.getByRole('link', { name: 'View' }).isVisible(), 'View is in the sheet')
    assert.ok(await sheet.locator('.editor__newsletter').isVisible(), 'the newsletter is in the sheet')
    await p.waitForTimeout(300)
    await shot(p, `editor-390-${mode}-sheet`)
    if (mode === 'light') {
      // A refusal floats above the bar, with a close.
      await sheet.getByLabel('Test address').fill('nobody@example.invalid')
      await sheet.getByRole('button', { name: 'Test send' }).click()
      await p.locator('.editor__message.notice--danger', { hasText: 'No subscriber has the address' }).waitFor()
      const over = await p.evaluate(() => {
        const box = document.querySelector('.editor__message').getBoundingClientRect()
        return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.closest('.editor__message') !== null
      })
      assert.ok(over, 'the refusal shows over the open sheet')
      await shot(p, `editor-390-${mode}-sheet-refusal`)
    }
    await sheet.getByRole('button', { name: 'Done' }).click()
    assert.equal(await sheet.isVisible(), false, 'Done closes the sheet')
    if (mode === 'light') {
      const notice = await p.locator('.editor__message').boundingBox()
      const top = (await bar.boundingBox()).y
      assert.ok(notice.y + notice.height <= top, 'the refusal sits above the bar')
      await shot(p, `editor-390-${mode}-refusal`)
      await p.locator('.editor__message').getByRole('button', { name: 'Close' }).click()
      assert.equal(await p.locator('.editor__message').count(), 0)
    }
    assert.ok((await p.locator('.editor__body').boundingBox()).height > PHONE.height, 'the body is as long as the post, and the page scrolls')

    if (mode === 'light') {
      await p.locator('.editor .cm-content').tap()
      await cursorAt(p, 'The end.')
      await p.keyboard.type(' From the phone.')
      await bar.getByRole('button', { name: 'Save', exact: true }).click()
      await bar.getByRole('button', { name: 'Saved', exact: true }).waitFor()
      const { rows } = await database.query('SELECT content FROM blog_posts WHERE id = $1', [created])
      assert.ok(rows[0].content.includes('The end. Kept in the browser. From the phone.'), 'saved from the bar')
    }
    await phone.ctx.close()
    current = page
  }
  step('phone, light and dark: one pane, the bottom bar flips Write and Preview and saves, Other Fields is a sheet holding View, Unlist, Delete and the newsletter')

  // The public post, as a reader sees it.
  const reader = await browser.newContext({ viewport: DESKTOP })
  const post = await reader.newPage()
  assert.equal((await post.goto(`${BASE}/blog/${slug}`)).status(), 200)
  await post.waitForFunction(() => {
    const img = document.querySelector('article.blog-post img[src^="/media/images/a/"]')
    return img && img.complete && img.naturalWidth === 180
  })
  assert.equal(await post.textContent('article.blog-post h1'), title)
  await post.waitForSelector('article.blog-post figure figcaption >> text=stripes.png')
  await post.waitForSelector('article.blog-post pre.shiki')
  step('the public page draws the post, its headings, list, code and the replaced image')
  await reader.close()

  await page.reload()
  await ready(page)
  await page.locator('.editor__actions').getByRole('button', { name: 'Delete' }).click()
  await page.waitForURL('**/admin')
  created = null
  const gone = await browser.newContext()
  assert.equal((await (await gone.newPage()).goto(`${BASE}/blog/${slug}`)).status(), 404)
  await gone.close()
  step('deleted: the editor went back to /admin, and the post is a 404')

  // Signing out with the footer's Logout.
  signedOut = true
  await page.getByRole('link', { name: 'Logout' }).click()
  await page.waitForURL((url) => url.pathname === '/')
  assert.equal((await ctx.cookies()).find((c) => c.name === 'sid'), undefined, 'the cookie is cleared')
  assert.equal((await page.goto(`${BASE}/admin`)).status(), 404)
  const { rows } = await database.query('SELECT id FROM sessions WHERE user_id = $1', [CHECKER.id])
  assert.deepEqual(rows, [], 'the session is deleted')
  step('signed out with the footer link: home, cookie cleared, session deleted, /admin a 404 again')
  await ctx.close()

  if (errors.length) {
    process.exitCode = 1
    console.log(`\nbrowser errors:\n${errors.join('\n')}`)
  } else console.log(`\nno browser errors; screenshots in ${out}`)
} catch (error) {
  process.exitCode = 1
  console.error(error)
  if (errors.length) console.error(`\nbrowser errors:\n${errors.join('\n')}`)
  if (current) {
    await current.screenshot({ path: join(out, 'editor-check-failed.png') }).catch(() => {})
    console.error(`at ${current.url()}; screenshot in ${join(out, 'editor-check-failed.png')}`)
  }
} finally {
  if (created) {
    await database.query('DELETE FROM blog_posts WHERE id = $1', [created]).catch((error) => console.error(`left behind: post ${created} (${error.message})`))
  }
  const dir = join(root, process.env.ASSETS_DIR || '.media')
  for (const key of uploads) {
    rmSync(join(dir, key), { force: true })
    rmSync(join(dir, '.meta', `${key}.json`), { force: true })
  }
  await browser.close().catch(() => {})
  await database.query('DELETE FROM users WHERE id = $1', [CHECKER.id]).catch((error) => console.error(`left behind: user ${CHECKER.email} (${error.message})`))
  await database.end().catch(() => {})
}
