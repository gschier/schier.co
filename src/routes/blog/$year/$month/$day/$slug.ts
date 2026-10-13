import { createFileRoute } from '@tanstack/react-router'
import { redirect } from '#/server/pages'

// The blog's oldest addresses, /blog/{year}/{month}/{day}/{slug}(.html),
// moved for good to /blog/{slug}, as Go kept them for search engines.
export const Route = createFileRoute('/blog/$year/$month/$day/$slug')({
  server: { handlers: { GET: ({ params }) => redirect(`/blog/${encodeURIComponent(params.slug.replace(/\.html$/, ''))}`, 301) } },
})
