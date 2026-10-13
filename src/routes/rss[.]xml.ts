import { createFileRoute } from '@tanstack/react-router'
import { redirect } from '#/server/pages'

// The feed's old address.
export const Route = createFileRoute('/rss.xml')({
  server: { handlers: { GET: () => redirect('/blog/rss.xml', 303) } },
})
