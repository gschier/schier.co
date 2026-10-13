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
