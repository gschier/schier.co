import { createFileRoute } from '@tanstack/react-router'

// What Railway and the Go site's checks ask: "OK", as /debug/health answered
// before.
export const Route = createFileRoute('/debug/health')({
  server: {
    handlers: {
      GET: () => new Response('OK', { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } }),
    },
  },
})
