import { createFileRoute } from '@tanstack/react-router'
import { redirect } from '#/server/pages'

// /blog is page 1 of the blog, as Go redirected it.
export const Route = createFileRoute('/blog/')({
  server: { handlers: { GET: () => redirect('/blog/page/1', 303) } },
})
