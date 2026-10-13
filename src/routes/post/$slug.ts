import { createFileRoute } from '@tanstack/react-router'
import { redirect } from '#/server/pages'

// The old /post/{slug} prefix, moved for good to /blog/{slug}.
export const Route = createFileRoute('/post/$slug')({
  server: { handlers: { GET: ({ params }) => redirect(`/blog/${encodeURIComponent(params.slug)}`, 301) } },
})
