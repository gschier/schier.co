// Deletes every source map from the build's output, last thing in
// `npm run build`. A build with SENTRY_AUTH_TOKEN makes maps for Sentry
// and deletes them once uploaded (vite.config.ts); this makes sure none is
// left to be served should an upload fail on its way.
import { readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const gone = []
const walk = (folder) => {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) walk(path)
    else if (entry.name.endsWith('.map')) {
      rmSync(path)
      gone.push(path)
    }
  }
}
walk('.output')
if (gone.length) console.log(`no-maps: deleted ${gone.length} source maps from .output`)
