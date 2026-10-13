// The server's entry: Start's own, with Sentry started before anything
// else is loaded (src/server/sentry.ts).
import './server/sentry'

export { default } from '@tanstack/react-start/server-entry'
