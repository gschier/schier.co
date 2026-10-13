import { sentryGlobalFunctionMiddleware, sentryGlobalRequestMiddleware } from '@sentry/tanstackstart-react'
import { createMiddleware, createStart } from '@tanstack/react-start'

// Who is signed in, looked up once at the start of every page, route and
// server function, as Go's UserMiddleware did: the session cookie is sent
// again for another seven days, and code that cannot wait (a post's meta
// line, src/server/views.ts) knows the answer. Not for images and the
// build's files, which need no one and are cached publicly.
const signedIn = createMiddleware({ type: 'request' }).server(async ({ next, pathname }) => {
  if (!/^\/(media|static|assets)\//.test(pathname)) {
    // Imported here so the browser's copy of this file never names it.
    const { currentUser } = await import('#/server/auth')
    await currentUser()
  }
  return next()
})

// What every request and server function goes through first: Sentry's
// middlewares, which report what a route, a page or a server function
// throws, and throw it on (src/server/sentry.ts), then the sign-in above.
// In the browser they are empty, and nothing of Sentry's is loaded there.
export const startInstance = createStart(() => ({
  requestMiddleware: [sentryGlobalRequestMiddleware, signedIn],
  functionMiddleware: [sentryGlobalFunctionMiddleware],
}))
