import { sentryGlobalFunctionMiddleware, sentryGlobalRequestMiddleware } from '@sentry/tanstackstart-react'
import { createStart } from '@tanstack/react-start'

// What every request and server function goes through first: Sentry's
// middlewares, which report what a route, a page or a server function
// throws, and throw it on (src/server/sentry.ts). In the browser they are
// empty, and nothing of Sentry's is loaded there.
export const startInstance = createStart(() => ({
  requestMiddleware: [sentryGlobalRequestMiddleware],
  functionMiddleware: [sentryGlobalFunctionMiddleware],
}))
