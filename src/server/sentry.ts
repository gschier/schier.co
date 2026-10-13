import * as Sentry from '@sentry/tanstackstart-react'
import { collected, scrubBreadcrumb, scrubEvent } from '#/lib/scrub'

/// Errors on the site's server, reported to Sentry: what the routes, the
/// pages and the server functions throw (src/start.ts), what the admin
/// MCP's tools throw, and what nothing caught. Started first, by the
/// server's entry (src/server.ts). Migrations report through
/// scripts/migrate.mjs.
///
/// Only where SENTRY_DSN is set, which Railway sets per environment;
/// local dev and the tests have none, and send nothing. The environment is
/// Railway's and the release the deploy's commit. Errors only: no tracing,
/// and nothing that identifies anyone (src/lib/scrub.ts).
export const reporting = !!process.env.SENTRY_DSN

if (reporting) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.RAILWAY_ENVIRONMENT_NAME || 'dev',
    release: process.env.RAILWAY_GIT_COMMIT_SHA,
    dataCollection: collected,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  })
}
