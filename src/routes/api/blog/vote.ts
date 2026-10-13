import { createFileRoute } from '@tanstack/react-router'
import { vote } from '#/server/posts'
import { sameOrigin, textError } from '#/server/pages'

// The cheers button on a post (Go's routeVote): a form-encoded slug and how
// many times this reader has cheered it before; answers the new total, or
// 204 when the cheer does not count.
export const Route = createFileRoute('/api/blog/vote')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!sameOrigin(request)) return textError(403, 'Forbidden')
        const form = new URLSearchParams(await request.text())
        const count = /^[+-]?\d+$/.test(form.get('count') ?? '') ? Number(form.get('count')) : 0
        const total = await vote(form.get('slug') ?? '', count)
        if (total === undefined) return textError(500, 'Failed to fetch Post')
        if (total === null) return new Response(null, { status: 204 })
        return new Response(String(total), { headers: { 'content-type': 'text/plain; charset=utf-8' } })
      },
    },
  },
})

