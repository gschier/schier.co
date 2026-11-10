import { existsSync, readdirSync, readFileSync, statSync, watch as fsWatch, type FSWatcher } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

// In dev, Nitro hands a request to Vite's static files instead of the app
// when it looks like an asset: by Sec-Fetch-Dest when the browser sends one
// (an <img> sends "image"), else by its extension (.png, .jpg). /media/
// paths are the app's (src/routes/media/$.ts, which serves images from
// storage), so Vite answered them with its 404. Say they are documents
// before Nitro looks; the route does not read the header. Production has no
// Vite in front and needs nothing.
const mediaIsTheApps: Plugin = {
  name: 'media-is-the-apps',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url?.startsWith('/media/')) req.headers['sec-fetch-dest'] = 'document'
      next()
    })
  },
}

// A widget's local build, for a post pinning {name}@dev on the dev server
// (BRIEF.md, Widgets): /__widgets/{name}/{file} is widgets/{name}/{output}/
// {file}, never cached. /__widgets/events tells every page showing one when
// a build changes ({ name, stamp }), so it mounts the new build
// (src/lib/widgetMount.ts). Only `vite dev` has it: in production there is
// no such route, and a dev pin renders the plain fallback.
const widgetsDev: Plugin = {
  name: 'widgets-dev',
  apply: 'serve',
  configureServer(server) {
    const dir = resolve(process.cwd(), process.env.WIDGETS_DIR || 'widgets')
    const outputOf = (name: string): string | null => {
      try {
        const output = JSON.parse(readFileSync(join(dir, name, 'widget.json'), 'utf8'))?.build?.output
        return typeof output === 'string' && output && !output.includes('..') ? output : null
      } catch {
        return null
      }
    }
    const listeners = new Set<ServerResponse>()
    const timers = new Map<string, NodeJS.Timeout>()
    let watcher: FSWatcher | null = null
    const watch = () => {
      if (watcher || !existsSync(dir)) return
      watcher = fsWatch(dir, { recursive: true }, (_event, file) => {
        const [name, ...rest] = String(file ?? '').split(sep)
        const output = name && outputOf(name)
        if (!output || !rest.join('/').startsWith(`${output}/`)) return
        clearTimeout(timers.get(name))
        timers.set(
          name,
          setTimeout(() => {
            const out = join(dir, name, output)
            if (!existsSync(join(out, 'index.js'))) return
            // The newest file's time, as src/server/widgets.ts's buildStamp.
            let stamp = 0
            for (const entry of readdirSync(out, { recursive: true, withFileTypes: true })) {
              if (entry.isFile()) stamp = Math.max(stamp, Math.floor(statSync(join(entry.parentPath, entry.name)).mtimeMs))
            }
            const data = `data: ${JSON.stringify({ name, stamp })}\n\n`
            for (const res of listeners) res.write(data)
          }, 150),
        )
      })
    }
    server.httpServer?.on('close', () => watcher?.close())
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith('/__widgets/')) return next()
      const path = decodeURIComponent(new URL(req.url, 'http://dev').pathname)
      if (path === '/__widgets/events') {
        watch()
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' })
        res.write(': widgets\n\n')
        listeners.add(res)
        req.on('close', () => listeners.delete(res))
        return
      }
      const [name, ...rest] = path.slice('/__widgets/'.length).split('/')
      const output = name && /^[a-z0-9][a-z0-9-]*$/.test(name) ? outputOf(name) : null
      const base = output ? resolve(dir, name, output) : null
      const file = base ? resolve(base, ...rest) : null
      if (!base || !file || !file.startsWith(base + sep) || !existsSync(file) || !statSync(file).isFile()) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('No such widget build: run npm run widget:dev <name>')
        return
      }
      const types: Record<string, string> = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' }
      res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(readFileSync(file))
    })
  },
}

// Sentry reads the server's errors with the build's source maps, which are
// made only to be uploaded, when the build has SENTRY_AUTH_TOKEN (Railway
// sets it on the service), as the deploy's commit, the release the server
// reports (src/server/sentry.ts). They are deleted from .output after, and
// scripts/no-maps.mjs makes sure of it: none is ever served. An upload that
// fails says so and the build goes on. Only the server's: the pages load
// nothing of Sentry's, so their maps would serve nothing, and the ids
// Sentry writes into what it uploads would weigh on every visit.
const upload = !!process.env.SENTRY_AUTH_TOKEN
const server = (plugin: Plugin): Plugin => ({ ...plugin, applyToEnvironment: (environment) => environment.name !== 'client' })

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // Dev server is reached by any name: localhost and bare LAN names alike.
  server: { host: '0.0.0.0', allowedHosts: true },
  build: { sourcemap: upload ? 'hidden' : false },
  environments: { client: { build: { sourcemap: false } } },
  plugins: [
    mediaIsTheApps,
    widgetsDev,
    devtools(),
    nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    ...(upload
      ? sentryVitePlugin({
          org: 'mountainloop',
          project: 'schier-co',
          authToken: process.env.SENTRY_AUTH_TOKEN,
          release: { name: process.env.RAILWAY_GIT_COMMIT_SHA },
          sourcemaps: { filesToDeleteAfterUpload: ['.output/**/*.map'] },
          telemetry: false,
          errorHandler: (error) => console.warn(`sentry: the source maps were not uploaded; the build goes on (${error.message})`),
        }).map((plugin) => server(plugin as Plugin))
      : []),
  ],
})

export default config
