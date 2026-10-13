import { createFileRoute } from '@tanstack/react-router'
import { recentPosts } from '#/server/posts'
import { textError } from '#/server/pages'
import { rssFeed } from '#/server/rss'

// The blog's RSS feed: the 20 newest posts, or ?limit= of them (0, or
// anything that is not a number, for all), as Go's routeBlogPostRSS.
export const Route = createFileRoute('/blog/rss.xml')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const param = new URL(request.url).searchParams.get('limit')
        const limit = param === null || param === '' ? 20 : /^[+-]?\d+$/.test(param) ? Number(param) : 0
        if (limit < 0) return textError(500, 'Internal Server Error')
        const posts = await recentPosts(limit)
        if (posts.length === 0) return textError(500, 'Internal Server Error')
        const baseUrl = (process.env.BASE_URL ?? '').replace(/\/+$/, '')
        return new Response(await rssFeed(posts, baseUrl), { headers: { 'content-type': 'application/xml' } })
      },
    },
  },
})
