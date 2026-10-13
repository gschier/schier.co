import { createFileRoute } from '@tanstack/react-router'

// What crawlers may read, word for word as the Go site served it
// (internal/routes.go).
const ROBOTS = `
User-agent: *
Disallow: /open
Disallow: /blog/drafts
Disallow: /newsletter/thanks
Disallow: /newsletter/unsubscribe/*
Disallow: /login
Disallow: /register
Disallow: /blog/*/share/*
Disallow: /blog/tags/*
Disallow: /debug/*
`

export const Route = createFileRoute('/robots.txt')({
  server: { handlers: { GET: () => new Response(ROBOTS, { headers: { 'content-type': 'text/plain; charset=utf-8' } }) } },
})
