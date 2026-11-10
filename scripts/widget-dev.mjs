#!/usr/bin/env node
// Works on a widget against the dev server (BRIEF.md, Widgets):
//
//   npm run widget:dev <name>
//
// Installs widgets/<name>'s own dependencies if it has none yet, then runs
// its build.watch (or build.command once, without one). A post pinning
// <name>@dev on the dev server (npm run dev) loads that build from
// /__widgets/<name>/ (vite.config.ts, dev only), and every page showing it
// mounts the new build when the output changes, with the props it had.
// Stop it with Ctrl-C.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readWidget } from './widget-publish.mjs'

const root = new URL('..', import.meta.url).pathname

function run(command, cwd) {
  return new Promise((resolve, reject) => {
    console.log(`$ ${command}`)
    const child = spawn(command, { cwd, shell: true, stdio: 'inherit' })
    const stop = () => child.kill('SIGINT')
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
    child.on('error', reject)
    child.on('close', (code) => {
      process.off('SIGINT', stop)
      process.off('SIGTERM', stop)
      code === 0 || code === null ? resolve() : reject(new Error(`${command} failed (exit ${code})`))
    })
  })
}

async function main() {
  const [name] = process.argv.slice(2)
  if (!name) throw new Error('Usage: npm run widget:dev <name>')
  const dir = join(root, 'widgets', name)
  if (!existsSync(dir)) throw new Error(`There is no widget folder ${dir}`)
  const widget = await readWidget(dir, name)
  if (existsSync(join(dir, 'package.json')) && !existsSync(join(dir, 'node_modules'))) {
    await run(existsSync(join(dir, 'package-lock.json')) ? 'npm ci --no-audit --no-fund' : 'npm install --no-audit --no-fund', dir)
  }
  console.log(`Pin it in a post on the dev server as \`\`\`widget ${name}@dev; it reloads there when the build changes.`)
  await run(widget.build.watch || widget.build.command, dir)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`widget:dev: ${error.message}`)
    process.exit(1)
  })
}
