import { createFileRoute } from '@tanstack/react-router'
import { redirect } from '#/server/pages'

// The old /tags/{tag} prefix, moved for good to /blog/tags/{tag}.
export const Route = createFileRoute('/tags/$tag')({
  server: { handlers: { GET: ({ params }) => redirect(`/blog/tags/${encodeURIComponent(params.tag)}`, 301) } },
})
