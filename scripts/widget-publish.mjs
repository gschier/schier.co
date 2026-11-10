#!/usr/bin/env node
// Publishes a widget (BRIEF.md, Widgets; widgets/README.md):
//
//   npm run widget:publish <name>
//
// In widgets/<name>/, runs the widget's own install (npm ci with its
// lockfile, else npm install) and its build (widget.json's build.command),
// takes the next version, a plain integer counting up from 1, and uploads
// what the build wrote (build.output, holding index.js) under
// widgets/<name>/<version>/ through the storage the site uses: the bucket
// when the AWS_* variables are set (scripts/s3.mjs), else the directory
// ASSETS_DIR (default .media), laid out as src/server/storage.ts keeps it.
// Then it records the version in widgets/manifest.json: name, version, date,
// files, a content hash and that version's whole widget.json. Commit the
// manifest after a publish to the bucket: production knows only what it
// lists.
//
// A version is never overwritten: the next version is one past the highest
// in the manifest or in storage, and one already in storage is refused. A
// version published to the directory is marked "storage": "disk" in the
// manifest; production ignores those, since its bucket does not have them.
//
// The editor's Prepare for publish (dev server only) calls publishWidget
// here too. The .env file is read if there is one.

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { bucket } from './s3.mjs'
import { checkWidgetJson, WIDGET_NAME } from '../src/lib/widgets.ts'

const root = resolve(new URL('..', import.meta.url).pathname)

/// A refusal: said as it is, with no stack.
export class PublishError extends Error {
  constructor(message) {
    super(message)
    this.name = 'PublishError'
    this.refusal = true
  }
}

const TYPES = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

const typeOf = (path) => TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream'

// ---------------------------------------------------------------------------
// Storage, as the site has it

/// Where published files go: the bucket when [env] has the AWS_* variables
/// (as src/server/s3.ts decides), else the directory ASSETS_DIR (default
/// .media in the repo root) in src/server/storage.ts's layout: the object at
/// its key, its content type in .meta/{key}.json, written through .tmp/.
export function widgetStorage(env = process.env) {
  const { AWS_ENDPOINT_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET_NAME, AWS_DEFAULT_REGION } = env
  if (AWS_ENDPOINT_URL && AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY && AWS_S3_BUCKET_NAME) {
    const b = bucket({ endpoint: AWS_ENDPOINT_URL, key: AWS_ACCESS_KEY_ID, secret: AWS_SECRET_ACCESS_KEY, bucket: AWS_S3_BUCKET_NAME, region: AWS_DEFAULT_REGION || 'auto' })
    const keys = async (prefix) => (await b.list(prefix)).map((o) => o.key)
    return {
      kind: 'bucket',
      where: `the bucket ${AWS_S3_BUCKET_NAME}`,
      keys,
      // The bucket has no way here to claim a prefix, so two publishes of
      // one widget at the same moment could still race; one author, so rare.
      reserve: async (prefix) => !(await keys(prefix)).length,
      put: (key, body, type) => b.put(key, body, type),
    }
  }
  const dir = resolve(root, env.ASSETS_DIR || '.media')
  const path = (prefix) => join(dir, ...prefix.split('/').filter(Boolean))
  return {
    kind: 'disk',
    where: dir,
    keys: async (prefix) => {
      const base = path(prefix)
      if (!existsSync(base)) return []
      const entries = await readdir(base, { recursive: true, withFileTypes: true })
      // A version's folder counts even while empty: it was claimed.
      return entries.filter((f) => f.isFile() || f.parentPath === base).map((f) => relative(dir, join(f.parentPath, f.name)).split(sep).join('/') + (f.isFile() ? '' : '/'))
    },
    // Making the version's folder is the claim: only one maker succeeds.
    reserve: async (prefix) => {
      await mkdir(dirname(path(prefix)), { recursive: true })
      try {
        await mkdir(path(prefix))
        return true
      } catch (error) {
        if (error.code === 'EEXIST') return false
        throw error
      }
    },
    put: async (key, body, type) => {
      const tmpDir = join(dir, '.tmp')
      await mkdir(tmpDir, { recursive: true })
      const tmp = join(tmpDir, `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      const file = join(dir, ...key.split('/'))
      const meta = join(dir, '.meta', ...key.split('/')) + '.json'
      try {
        await writeFile(tmp, body)
        await writeFile(`${tmp}.json`, JSON.stringify({ contentType: type }) + '\n')
        await mkdir(dirname(file), { recursive: true })
        await mkdir(dirname(meta), { recursive: true })
        await rename(`${tmp}.json`, meta)
        await rename(tmp, file)
      } finally {
        await rm(tmp, { force: true })
        await rm(`${tmp}.json`, { force: true })
      }
    },
  }
}

/// The versions of [name] that [store] holds, from its keys.
export async function storedVersions(store, name) {
  const versions = new Set()
  for (const key of await store.keys(`widgets/${name}/`)) {
    const m = /^widgets\/[^/]+\/(\d+)\//.exec(key)
    if (m) versions.add(Number(m[1]))
  }
  return [...versions].sort((a, b) => a - b)
}

/// Uploads [files] as version [version] of [name], refusing when [store]
/// already has that version (claimed by making its folder, on disk): a
/// version is never overwritten.
export async function putVersion(store, name, version, files) {
  const prefix = `widgets/${name}/${version}/`
  if (!(await store.reserve(prefix))) throw new PublishError(`${name}@${version} is already in ${store.where}; a published version is never overwritten`)
  for (const file of files) await store.put(prefix + file.path, file.body, file.type)
}

// ---------------------------------------------------------------------------
// The manifest

export async function readManifest(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return {}
    throw new PublishError(`${path} is not JSON: ${error.message}`)
  }
}

/// Writes [manifest] with its widgets in name order and each one's versions
/// oldest first, so a publish is a small diff.
export async function writeManifest(path, manifest) {
  const sorted = Object.fromEntries(
    Object.keys(manifest)
      .sort()
      .map((name) => [name, { ...manifest[name], versions: [...manifest[name].versions].sort((a, b) => a.version - b.version) }]),
  )
  const tmp = `${path}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(sorted, null, 2) + '\n')
  await rename(tmp, path)
}

/// sha256 of [files] (sorted by path): each path, a NUL, its bytes, a NUL.
export function contentHash(files) {
  const hash = createHash('sha256')
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    hash.update(file.path)
    hash.update('\0')
    hash.update(file.body)
    hash.update('\0')
  }
  return `sha256-${hash.digest('hex')}`
}

// ---------------------------------------------------------------------------
// Building

/// Runs [command] in [cwd] through the shell, its output passed to [log] a
/// line at a time. Throws with the last lines when it fails.
function sh(command, cwd, log) {
  return new Promise((resolvePromise, reject) => {
    log(`$ ${command}`)
    const child = spawn(command, { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '0' } })
    const tail = []
    const take = (chunk) => {
      for (const line of String(chunk).split('\n')) {
        if (!line.trim()) continue
        log(`  ${line}`)
        tail.push(line)
        if (tail.length > 20) tail.shift()
      }
    }
    child.stdout.on('data', take)
    child.stderr.on('data', take)
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolvePromise() : reject(new PublishError(`${command} failed (exit ${code}) in ${cwd}:\n${tail.join('\n')}`))))
  })
}

/// The widget in [dir]: its widget.json, checked.
export async function readWidget(dir, name) {
  let widget
  try {
    widget = JSON.parse(await readFile(join(dir, 'widget.json'), 'utf8'))
  } catch (error) {
    throw new PublishError(error.code === 'ENOENT' ? `${dir} has no widget.json` : `${join(dir, 'widget.json')} is not JSON: ${error.message}`)
  }
  const problems = checkWidgetJson(widget, name)
  if (problems.length) throw new PublishError(`widget.json for ${name}: ${problems.join('; ')}`)
  return widget
}

/// Installs and builds the widget in [dir] as its widget.json says, and
/// returns what the build wrote: each file's path under the output folder,
/// bytes and content type.
export async function buildWidget(dir, widget, log = console.log) {
  if (existsSync(join(dir, 'package.json'))) {
    await sh(existsSync(join(dir, 'package-lock.json')) ? 'npm ci --no-audit --no-fund' : 'npm install --no-audit --no-fund', dir, log)
  }
  await sh(widget.build.command, dir, log)
  const out = resolve(dir, widget.build.output)
  if (!out.startsWith(resolve(dir) + sep)) throw new PublishError(`build.output ${widget.build.output} is not inside ${dir}`)
  if (!existsSync(join(out, 'index.js'))) throw new PublishError(`the build wrote no ${join(widget.build.output, 'index.js')}`)
  const entries = await readdir(out, { recursive: true, withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const full = join(entry.parentPath, entry.name)
    const path = relative(out, full).split(sep).join('/')
    if (path.split('/').some((s) => s.startsWith('.'))) continue
    files.push({ path, body: await readFile(full), type: typeOf(path) })
  }
  return files.sort((a, b) => (a.path < b.path ? -1 : 1))
}

// ---------------------------------------------------------------------------
// Publishing

/// Builds widgets/[name] and publishes it as its next version. Options, for
/// the tests and the dev server: [widgetsDir] (default widgets/ in the repo
/// root), [manifest] (default manifest.json in it), [env] (default
/// process.env, for the AWS_* variables and ASSETS_DIR), [log]. Returns the
/// manifest's new entry.
export async function publishWidget(name, options = {}) {
  const log = options.log ?? console.log
  if (!WIDGET_NAME.test(name ?? '')) throw new PublishError(`"${name}" is not a widget's name: lower case letters, digits and dashes`)
  const widgetsDir = resolve(options.widgetsDir ?? join(root, 'widgets'))
  const manifestPath = options.manifest ?? join(widgetsDir, 'manifest.json')
  const dir = join(widgetsDir, name)
  if (!(await stat(dir).catch(() => null))?.isDirectory()) throw new PublishError(`There is no widget folder ${dir}`)
  const widget = await readWidget(dir, name)
  const store = widgetStorage(options.env ?? process.env)

  const files = await buildWidget(dir, widget, log)
  const manifest = await readManifest(manifestPath)
  const known = [...(manifest[name]?.versions ?? []).map((v) => v.version), ...(await storedVersions(store, name))]
  const version = Math.max(0, ...known) + 1

  log(`Uploading ${name}@${version} (${files.length} file${files.length === 1 ? '' : 's'}) to ${store.where}`)
  await putVersion(store, name, version, files)

  const entry = {
    version,
    date: new Date().toISOString(),
    files: files.map((f) => ({ path: f.path, size: f.body.length, type: f.type })),
    hash: contentHash(files),
    widget,
    ...(store.kind === 'disk' ? { storage: 'disk' } : {}),
  }
  // Read again, in case another publish wrote it meanwhile.
  const fresh = await readManifest(manifestPath)
  fresh[name] = { ...(fresh[name] ?? {}), versions: [...(fresh[name]?.versions ?? []).filter((v) => v.version !== version), entry] }
  await writeManifest(manifestPath, fresh)
  const shown = relative(process.cwd(), manifestPath)
  log(`Published ${name}@${version}; recorded in ${shown && !shown.startsWith('..') ? shown : manifestPath}`)
  if (store.kind === 'disk') log(`It went to the directory ${store.where}, not the bucket, so production will not have it: do not commit this manifest entry.`)
  return entry
}

async function main() {
  const { config } = await import('dotenv')
  config({ path: join(root, '.env'), quiet: true })
  const [name] = process.argv.slice(2)
  if (!name) throw new PublishError('Usage: npm run widget:publish <name>')
  const entry = await publishWidget(name)
  console.log(`\nPin it in a post as:\n\n\`\`\`widget ${name}@${entry.version}\n\`\`\``)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`widget:publish: ${error.refusal ? error.message : (error.stack ?? error.message)}`)
    process.exit(1)
  })
}
