#!/usr/bin/env node
// Screenshots of the same pages on the Go site and the port, side by side
// in shots/, for looking the two over:
//
//   node scripts/screenshots.mjs [go-url] [port-url]
//
// Each page at 1280 and 390 pixels wide, light and dark, full length, saved
// as shots/<page>-<width>-<mode>-<go|port>.png. Defaults: the Go site on
// http://localhost:8084 and the port on http://localhost:3200.
//
// The browser is Playwright's headless shell (never Google Chrome.app; see
// AGENTS.md), PLAYWRIGHT_HEADLESS_SHELL or the newest one in Playwright's
// cache, and it is closed however the run ends. Its User-Agent carries a URL,
// which both sites take for a bot, so no view is counted.

import { mkdirSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const [GO = 'http://localhost:8084', PORT = 'http://localhost:3200'] = process.argv.slice(2)
const root = new URL('..', import.meta.url).pathname
const out = join(root, 'shots')

const PAGES = {
  home: '/',
  blog: '/blog/page/1',
  post: '/blog/diy-website-analytics',
  tags: '/blog/tags',
  newsletter: '/newsletter',
}
const WIDTHS = [1280, 390]
const MODES = ['light', 'dark']

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

mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ executablePath: headlessShell(), headless: true })
const stop = () => browser.close().catch(() => {})
process.on('SIGINT', async () => {
  await stop()
  process.exit(130)
})
try {
  for (const width of WIDTHS) {
    for (const mode of MODES) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        deviceScaleFactor: 1,
        colorScheme: mode,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36 (+https://schier.co/screenshots)',
      })
      for (const [name, path] of Object.entries(PAGES)) {
        for (const [site, base] of [
          ['go', GO],
          ['port', PORT],
        ]) {
          const page = await context.newPage()
          await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60000 })
          // The theme switch's icon and the page's transitions settle.
          await page.waitForTimeout(1200)
          const file = join(out, `${name}-${width}-${mode}-${site}.png`)
          await page.screenshot({ path: file, fullPage: true })
          console.log(file)
          await page.close()
        }
      }
      await context.close()
    }
  }
} finally {
  await stop()
}
