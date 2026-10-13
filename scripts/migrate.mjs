// The database's migrations, as the website's pre-deploy command runs them
// (`npm run migrate`, in place of `npx prisma migrate deploy`): Prisma's
// own command, its output as it was, and its exit code, so a deploy whose
// migrations fail stops as before. Where SENTRY_DSN is set it also tells
// Sentry, with the end of what Prisma said, scrubbed (src/lib/scrub.ts).
// Sentry is loaded only then, so nothing of it can stand in the way of
// the migrations themselves.
import { spawn } from 'node:child_process'

const said = []
const prisma = spawn('npx', ['prisma', 'migrate', 'deploy'], { stdio: ['inherit', 'pipe', 'pipe'] })
for (const [from, to] of [
  [prisma.stdout, process.stdout],
  [prisma.stderr, process.stderr],
]) {
  from.on('data', (chunk) => {
    to.write(chunk)
    said.push(String(chunk))
  })
}
const code = await new Promise((resolve) => prisma.on('close', (c) => resolve(c ?? 1)))

if (code !== 0 && process.env.SENTRY_DSN) {
  try {
    const Sentry = await import('@sentry/node')
    const { collected, scrubBreadcrumb, scrubEvent, scrubText } = await import('../src/lib/scrub.ts')
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.RAILWAY_ENVIRONMENT_NAME || 'dev',
      release: process.env.RAILWAY_GIT_COMMIT_SHA,
      dataCollection: collected,
      beforeSend: scrubEvent,
      beforeBreadcrumb: scrubBreadcrumb,
    })
    Sentry.captureMessage(`Migrations failed (prisma migrate deploy exited ${code})`, {
      level: 'error',
      extra: { said: scrubText(said.join('').slice(-4000)) },
    })
    await Sentry.flush(5000)
  } catch (error) {
    console.error(`migrate: Sentry was not told (${error})`)
  }
}
process.exit(code)
