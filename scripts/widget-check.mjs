#!/usr/bin/env node
// Widgets in a real browser (BRIEF.md, Widgets):
//
//   nice -n 10 node scripts/widget-check.mjs
//
// Starts a dev server of its own on a free port, over a scratch widgets
// folder (WIDGETS_DIR: a copy of widgets/hello and an empty manifest) and a
// scratch media directory (ASSETS_DIR), with the AWS_* variables unset, so
// nothing reaches the bucket or the repo's widgets/manifest.json. It
// publishes hello as version 1 there first (scripts/widget-publish.mjs,
// which runs the widget's own npm ci and build). Then, against the local
// database (a throwaway user and three posts of its own, deleted after):
//
// - a reader's post page with two hello@1 fences and a missing widget: both
//   mounted, the module fetched once, light and dark, no notice; the admin
//   sees the notice. A post with no widget loads no widget code at all;
// - the editor at desktop size: the card closed and open (light and dark),
//   a segmented choice written to the fence and shown by the preview's
//   widget without remounting it, undone with Cmd-Z from inside the card,
//   the slider, the fence as text and back, Insert widget and its picker,
//   the slash picker inserting hello@dev, and Prepare for publish
//   publishing it as hello@2 and repinning the fence, undone and redone as
//   one step;
// - at phone size: the card closed and open, and the picker as a sheet.
//
// Screenshots go to SHOTS_DIR (default shots/, gitignored), widget-*.png.
// The browser is Playwright's headless shell (never Google Chrome.app; see
// AGENTS.md); it and the dev server are stopped however the run ends.

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import bcrypt from 'bcryptjs'
import { config } from 'dotenv'
import pg from 'pg'
import { chromium } from 'playwright-core'
import { publishWidget } from './widget-publish.mjs'

const root = new URL('..', import.meta.url).pathname
config({ path: join(root, '.env'), quiet: true })
const out = resolve(root, process.env.SHOTS_DIR || 'shots')
const DESKTOP = { width: 1280, height: 860 }
const PHONE = { width: 390, height: 844 }

const DATABASE = new URL(process.env.DATABASE_URL ?? 'postgresql://schierco:schierco@localhost:5439/schierco')
assert.ok(['localhost', '127.0.0.1'].includes(DATABASE.hostname), `the check makes its rows on localhost only, not ${DATABASE.hostname}`)
const stamp = Date.now().toString(36)
const CHECKER = { id: `usr_wcheck${stamp}`.slice(0, 25), email: `widget-check-${stamp}@example.invalid`, password: `check-${Math.random().toString(36).slice(2)}` }
const POSTS = {
  widgets: { id: `pst_wa${stamp}`.slice(0, 25), slug: `widget-check-a-${stamp}` },
  plain: { id: `pst_wb${stamp}`.slice(0, 25), slug: `widget-check-b-${stamp}` },
  draft: { id: `pst_wc${stamp}`.slice(0, 25), slug: `widget-check-c-${stamp}` },
}

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

const freePort = () =>
  new Promise((ok, fail) => {
    const probe = createServer()
    probe.once('error', fail)
    probe.listen(0, () => {
      const { port } = probe.address()
      probe.close(() => ok(port))
    })
  })

const step = (text) => console.log(`- ${text}`)

// ---------------------------------------------------------------------------
// The scratch folders, with hello published as version 1

const scratch = mkdtempSync(join(tmpdir(), 'sc-widget-check-'))
const widgetsDir = join(scratch, 'widgets')
const mediaDir = join(scratch, 'media')
mkdirSync(widgetsDir, { recursive: true })
mkdirSync(mediaDir, { recursive: true })
cpSync(join(root, 'widgets/hello'), join(widgetsDir, 'hello'), { recursive: true, filter: (src) => !/[\\/](node_modules|dist)([\\/]|$)/.test(src.slice(root.length)) })
writeFileSync(join(widgetsDir, 'manifest.json'), '{}\n')
const env = { ...process.env, ASSETS_DIR: mediaDir, WIDGETS_DIR: widgetsDir, ASSETS_FALLBACK_URL: '' }
for (const k of ['AWS_ENDPOINT_URL', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET_NAME']) delete env[k]
const manifest = () => JSON.parse(readFileSync(join(widgetsDir, 'manifest.json'), 'utf8'))

const FENCE = (props = '') => `\`\`\`widget hello@1\n${props}\`\`\``
const CONTENT = {
  widgets: ['Some words before.', '', FENCE('count: 7\nshape: dots\ncaption: The first one\n'), '', 'Between.', '', FENCE(), '', '```widget nope@1', '```', '', 'After.'].join('\n'),
  plain: ['No widget here.', '', '```js', 'const widget = "not one"', '```', ''].join('\n'),
  draft: ['## The demo', '', 'Some words before the widget.', '', FENCE('count: 5\nshape: bars\nanimate: false\ncaption: Hello from the check\n'), '', 'Some words after it.', ''].join('\n'),
}

let server
let browser
let database
let current = null
const errors = []
const shot = (page, name, options = {}) => page.screenshot({ path: join(out, `widget-${name}.png`), ...options })

/// The body's text, from CodeMirror's own state.
const bodyText = (page) => page.evaluate(() => document.querySelector('.editor .cm-content').cmTile.root.view.state.doc.toString())
/// Puts the cursor at the end of the body.
const cursorToEnd = (page) =>
  page.evaluate(() => {
    const view = document.querySelector('.editor .cm-content').cmTile.root.view
    view.focus()
    view.dispatch({ selection: { anchor: view.state.doc.length }, scrollIntoView: true })
  })

async function context(mode, size = DESKTOP, mobile = false) {
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, colorScheme: mode })
  const page = await ctx.newPage()
  current = page
  page.on('pageerror', (e) => errors.push(`${mode}: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`${mode} console: ${m.text()}`))
  page.on('dialog', (d) => d.accept())
  return { ctx, page }
}

async function signIn(ctx) {
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('#i-email', CHECKER.email)
  await page.fill('#i-password', CHECKER.password)
  await page.getByRole('button', { name: 'Login' }).click()
  await page.waitForURL('**/admin')
  await page.close()
}

/// The editor for the draft, ready: CodeMirror drawn, the card there, the
/// preview's widget mounted, and the dev server's devtools button hidden.
async function openEditor(page) {
  await page.goto(`${BASE}/admin/edit/${POSTS.draft.id}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.editor .cm-content[contenteditable="true"]')
  await page.waitForSelector('.editor .wcard')
  await page.evaluate(() => {
    for (const mark of document.querySelectorAll('[id^="tsd-trigger"]')) {
      let node = mark.parentElement
      while (node && node !== document.body && getComputedStyle(node).position !== 'fixed') node = node.parentElement
      if (node && node !== document.body) node.style.display = 'none'
    }
  })
}

let BASE = ''

try {
  mkdirSync(out, { recursive: true })
  const published = await publishWidget('hello', { widgetsDir, env, log: () => {} })
  assert.equal(published.version, 1)
  step(`published hello@1 to the scratch directory (${published.files.map((f) => `${f.path} ${f.size} bytes`).join(', ')})`)

  const port = await freePort()
  BASE = `http://localhost:${port}`
  server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'dev', '--port', String(port), '--strictPort'], {
    cwd: root,
    env: { ...env, BASE_URL: BASE },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  server.stdout.on('data', (d) => (log += d))
  server.stderr.on('data', (d) => (log += d))
  const deadline = Date.now() + 90_000
  for (;;) {
    if (Date.now() > deadline) throw new Error(`the dev server did not start:\n${log}`)
    try {
      if ((await fetch(`${BASE}/debug/health`)).ok) break
    } catch {}
    await new Promise((r) => setTimeout(r, 300))
  }
  step(`a dev server of its own on ${BASE}`)

  database = new pg.Client({ connectionString: DATABASE.href })
  await database.connect()
  await database.query('INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)', [CHECKER.id, CHECKER.email, 'Widget check', await bcrypt.hash(CHECKER.password, 10)])
  for (const [key, post] of Object.entries(POSTS)) {
    await database.query(
      `INSERT INTO blog_posts (id, slug, title, content, image, published, date, created_at, updated_at, edited_at, tags) VALUES ($1, $2, $3, $4, '', $5, now(), now(), now(), now(), '{}')`,
      [post.id, post.slug, `Widget Check ${key}`, CONTENT[key], key !== 'draft'],
    )
  }
  browser = await chromium.launch({ executablePath: headlessShell(), headless: true })

  // A reader's post page.
  for (const mode of ['light', 'dark']) {
    const { ctx, page } = await context(mode)
    const fetched = []
    page.on('request', (r) => fetched.push(new URL(r.url()).pathname))
    assert.equal((await page.goto(`${BASE}/blog/${POSTS.widgets.slug}`, { waitUntil: 'networkidle' })).status(), 200)
    await page.waitForFunction(() => document.querySelectorAll('article .hello-widget').length === 2)
    assert.equal(fetched.filter((p) => p === '/media/widgets/hello/1/index.js').length, 1, 'the module is fetched once for two fences')
    assert.equal(await page.locator('.hello-widget--dots .hello-widget__shape').count(), 7)
    assert.equal(await page.locator('.hello-widget--bars .hello-widget__shape').count(), 5)
    assert.equal(await page.locator('.widget__notice').count(), 0, 'a reader sees no notice')
    assert.equal(await page.locator('.widget[data-widget="nope@1"] .widget__fallback a').getAttribute('href'), `/blog/${POSTS.widgets.slug}`)
    const bar = await page.locator('.hello-widget--bars .hello-widget__shape').first().boundingBox()
    assert.ok(bar && bar.height > 40, `the bars have height (${bar?.height})`)
    // They move, so never settle for a normal click.
    await page.locator('.hello-widget--dots .hello-widget__shape').nth(2).click({ force: true })
    await page.locator('.hello-widget--dots .hello-widget__picked', { hasText: 'Picked 3 of 7' }).waitFor()
    await page.locator('article .widget').first().scrollIntoViewIfNeeded()
    await shot(page, `post-${mode}`)
    await ctx.close()
  }
  step('a reader: two hello@1 fences mounted from one fetch of the module, clickable, the missing widget a fallback line with no notice, light and dark')

  {
    const { ctx, page } = await context('light')
    const fetched = []
    page.on('request', (r) => fetched.push(new URL(r.url()).pathname))
    await page.goto(`${BASE}/blog/${POSTS.plain.slug}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('article pre.shiki')
    const widgetCode = fetched.filter((p) => /widgetMount|\/media\/widgets\/|\/__widgets\/|widgetCard|widgets\.ts/.test(p))
    assert.deepEqual(widgetCode, [], 'a post with no widget loads no widget code')
    await ctx.close()
  }
  step('a post with no widget fetched no widget code (no widgetMount, no /media/widgets/, no /__widgets/)')

  // The admin sees why a widget is not there.
  const { ctx, page } = await context('light')
  await signIn(ctx)
  await page.goto(`${BASE}/blog/${POSTS.widgets.slug}`, { waitUntil: 'networkidle' })
  await page.locator('.widget[data-widget="nope@1"] .widget__notice', { hasText: 'No widget is named "nope"' }).waitFor()
  step('the admin sees "Widget: No widget is named "nope"" on the post page')

  // The editor, at desktop size.
  await openEditor(page)
  await page.waitForSelector('.editor__preview .hello-widget--bars')
  const card = page.locator('.wcard').first()
  await card.locator('.wcard__props', { hasText: 'count: 5, shape: Bars, animate: off, caption: "Hello from the check"' }).waitFor()
  await shot(page, 'editor-closed-light')
  await page.evaluate(() => document.documentElement.setAttribute('theme', 'dark'))
  await shot(page, 'editor-closed-dark')
  await page.evaluate(() => document.documentElement.setAttribute('theme', 'light'))
  step('the card, closed: its name, pin and settings in a line, with Edit and source; the preview runs the widget')

  await card.getByRole('button', { name: 'Edit' }).click()
  await card.locator('.wcard__form').waitFor()
  await shot(page, 'editor-open-light')
  await page.evaluate(() => document.documentElement.setAttribute('theme', 'dark'))
  await shot(page, 'editor-open-dark')
  await page.evaluate(() => document.documentElement.setAttribute('theme', 'light'))

  // A form edit goes into the fence; the preview's widget takes it with
  // update(), and keeps the element it drew into.
  await page.evaluate(() => (document.querySelector('.editor__preview .widget__host').dataset.mark = 'kept'))
  await card.getByRole('radio', { name: 'Dots' }).click()
  assert.match(await bodyText(page), /```widget hello@1\ncount: 5\nshape: dots\nanimate: false/)
  await page.waitForSelector('.editor__preview .hello-widget--dots')
  assert.equal(await page.locator('.editor__preview .widget__host[data-mark="kept"]').count(), 1, 'the widget was updated, not mounted again')
  await card.getByRole('radio', { name: 'Dots' }).focus()
  await page.keyboard.press('ControlOrMeta+z')
  assert.match(await bodyText(page), /shape: bars\n/)
  await page.waitForSelector('.editor__preview .hello-widget--bars')
  assert.equal(await page.locator('.editor__preview .widget__host[data-mark="kept"]').count(), 1)
  assert.equal(await card.getByRole('radio', { name: 'Bars' }).getAttribute('aria-checked'), 'true', 'the form follows the undo')
  await page.keyboard.press('ControlOrMeta+Shift+z')
  assert.match(await bodyText(page), /shape: dots\n/)
  await page.keyboard.press('ControlOrMeta+z')
  step('Dots in the form wrote shape: dots and the preview widget updated in place; Cmd-Z in the card took it back (and the form with it), Cmd-Shift-Z redid it')

  await card.locator('input[type="range"]').fill('9')
  assert.match(await bodyText(page), /count: 9\n/)
  await page.waitForFunction(() => document.querySelectorAll('.editor__preview .hello-widget__shape').length === 9)
  await card.getByRole('textbox').fill('A new caption: with a colon')
  assert.match(await bodyText(page), /caption: A new caption: with a colon\n```/)
  await card.locator('.wtoggle').click()
  assert.match(await bodyText(page), /animate: true\n/)
  assert.equal(await page.locator('.editor__preview .widget__host[data-mark="kept"]').count(), 1)
  step('the slider wrote count: 9 (nine shapes in the preview), the caption and the toggle wrote theirs, the widget never remounted')

  await card.locator('.wcard__source summary').click()
  await card.locator('.wcard__source pre', { hasText: '```widget hello@1' }).waitFor()
  await card.getByRole('button', { name: 'Edit it as text' }).click()
  await page.locator('.cm-widget-back').waitFor()
  assert.equal(await page.locator('.wcard').count(), 0)
  await shot(page, 'editor-source-light')
  await page.locator('.cm-widget-back').click()
  await page.locator('.wcard').waitFor()
  step('Source shows the fence; Edit it as text puts its lines back in the body with "show the card", which brings the card back')

  // Insert widget, and its picker.
  await cursorToEnd(page)
  await page.getByRole('button', { name: 'Insert widget' }).first().click()
  const picker = page.locator('.wpicker')
  await picker.waitFor()
  assert.deepEqual(await picker.locator('.wpicker__meta').allTextContents(), ['hello@1', 'hello@dev'])
  await shot(page, 'picker-light')
  await page.keyboard.press('Enter')
  await picker.waitFor({ state: 'detached' })
  assert.match(await bodyText(page), /Some words after it\.\n\n```widget hello@1\ncount: 5\nshape: bars\nanimate: true\ncaption: Click a shape to pick it\.\n```\n$/)
  assert.equal(await page.locator('.wcard').count(), 2)
  step('Insert widget opened the picker under the cursor (hello@1 and hello@dev); Enter put in hello@1 with every default, as a second card')

  // A slash alone on a line opens it too, and the choice takes the slash's place.
  await cursorToEnd(page)
  await page.keyboard.press('Enter')
  await page.keyboard.type('/')
  await picker.waitFor()
  await page.keyboard.press('Escape')
  await picker.waitFor({ state: 'detached' })
  assert.match(await bodyText(page), /\n\/$/, 'Escape leaves the slash')
  await page.keyboard.press('Backspace')
  await page.keyboard.type('/')
  await picker.waitFor()
  await page.keyboard.type('local')
  assert.deepEqual(await picker.locator('.wpicker__meta').allTextContents(), ['hello@dev'])
  await page.keyboard.press('Enter')
  await picker.waitFor({ state: 'detached' })
  const withDev = await bodyText(page)
  assert.match(withDev, /```\n\n```widget hello@dev\ncount: 5\n/)
  assert.doesNotMatch(withDev, /^\/$/m)
  await page.waitForFunction(() => [...document.querySelectorAll('.editor__preview .widget')].some((w) => w.dataset.widget === 'hello@dev' && w.querySelector('.hello-widget')))
  step('a slash alone on a line opened the picker (Escape kept the slash); searching "local" left hello@dev, which took the slash\'s place and runs in the preview from /__widgets/')

  // Prepare for publish publishes the dev pin and repins it.
  const prepare = page.locator('.editor__prepare')
  await prepare.locator('code', { hasText: 'hello@dev' }).waitFor()
  await shot(page, 'prepare-light')
  await prepare.getByRole('button', { name: 'Prepare for publish' }).click()
  await page.locator('.editor__message', { hasText: 'Published and pinned hello@2.' }).waitFor({ timeout: 120_000 })
  const repinned = await bodyText(page)
  assert.match(repinned, /```widget hello@2\ncount: 5\n/)
  assert.doesNotMatch(repinned, /hello@dev/)
  assert.deepEqual(
    manifest().hello.versions.map((v) => [v.version, v.storage]),
    [
      [1, 'disk'],
      [2, 'disk'],
    ],
  )
  assert.ok(existsSync(join(mediaDir, 'widgets/hello/2/index.js')))
  await prepare.waitFor({ state: 'detached' })
  await page.waitForFunction(() => [...document.querySelectorAll('.editor__preview .widget')].some((w) => w.dataset.widget === 'hello@2' && w.querySelector('.hello-widget')))
  await cursorToEnd(page)
  await page.keyboard.press('ControlOrMeta+z')
  assert.equal(await bodyText(page), withDev, 'one undo takes the repin back')
  await page.keyboard.press('ControlOrMeta+Shift+z')
  assert.equal(await bodyText(page), repinned)
  step('Prepare for publish published hello@2 to the scratch storage and manifest, repinned the fence, and the preview runs it; one undo took the repin back, redo put it again')
  await ctx.close()

  // At phone size.
  for (const mode of ['light', 'dark']) {
    const phone = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: mode })
    await signIn(phone)
    const p = await phone.newPage()
    current = p
    p.on('pageerror', (e) => errors.push(`phone ${mode}: ${e.message}`))
    p.on('dialog', (d) => d.accept())
    await openEditor(p)
    // The emulated phone's colour scheme does not always reach the site's
    // theme script, so the theme is set as the switch would set it.
    await p.evaluate((m) => window.setTheme(m), mode)
    assert.equal(await p.evaluate(() => document.documentElement.getAttribute('theme')), mode)
    const c = p.locator('.wcard').first()
    await c.scrollIntoViewIfNeeded()
    await shot(p, `phone-closed-${mode}`)
    await c.getByRole('button', { name: 'Edit' }).tap()
    await c.locator('.wcard__form').waitFor()
    await c.scrollIntoViewIfNeeded()
    await shot(p, `phone-open-${mode}`)
    await c.getByRole('radio', { name: 'Diamonds' }).tap()
    assert.match(await bodyText(p), /shape: diamonds\n/)
    await p.locator('.editor__actionbar').getByRole('button', { name: 'Insert widget' }).tap()
    await p.locator('.wpicker--sheet').waitFor()
    await shot(p, `phone-picker-${mode}`)
    await p.locator('.wpicker--sheet').getByRole('button', { name: 'Cancel' }).tap()
    await p.locator('.wpicker').waitFor({ state: 'detached' })
    await phone.close()
  }
  step('at phone size: the card closed and open, Diamonds written from the form, and the picker as a sheet from the bottom bar, light and dark')

  if (errors.length) {
    process.exitCode = 1
    console.log(`\nbrowser errors:\n${errors.join('\n')}`)
  } else console.log(`\nno browser errors; screenshots in ${out} (widget-*.png)`)
} catch (error) {
  process.exitCode = 1
  console.error(error)
  if (errors.length) console.error(`\nbrowser errors:\n${errors.join('\n')}`)
  if (current) {
    await current.screenshot({ path: join(out, 'widget-check-failed.png') }).catch(() => {})
    console.error(`at ${current.url()}; screenshot in ${join(out, 'widget-check-failed.png')}`)
  }
} finally {
  await browser?.close().catch(() => {})
  if (database) {
    await database.query('DELETE FROM blog_posts WHERE id = ANY($1)', [Object.values(POSTS).map((p) => p.id)]).catch((e) => console.error(`left behind: posts (${e.message})`))
    await database.query('DELETE FROM sessions WHERE user_id = $1', [CHECKER.id]).catch(() => {})
    await database.query('DELETE FROM users WHERE id = $1', [CHECKER.id]).catch((e) => console.error(`left behind: user ${CHECKER.email} (${e.message})`))
    await database.end().catch(() => {})
  }
  server?.kill('SIGTERM')
  rmSync(scratch, { recursive: true, force: true })
}
