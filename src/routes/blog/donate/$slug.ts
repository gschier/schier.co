import { createFileRoute } from '@tanstack/react-router'
import { countShare, isBot, postBySlug } from '#/server/posts'
import { redirect, textError } from '#/server/pages'

// The "sponsoring my work" link on tutorials: counted (as a share, as Go
// counted it) and sent on to GitHub Sponsors (Go's routeBlogDonate).
export const Route = createFileRoute('/blog/donate/$slug')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const post = await postBySlug(params.slug)
        if (!post) return textError(500, 'Failed to fetch Post')
        if (isBot(request.headers.get('user-agent') ?? '')) return new Response(null, { status: 204 })
        await countShare(post.id)
        return redirect('https://github.com/sponsors/gschier', 303)
      },
    },
  },
})
