import { createFileRoute } from '@tanstack/react-router'
import { isBot, postBySlug, shareUrl, countShare } from '#/server/posts'
import { redirect, textError } from '#/server/pages'

// A share button (the cheers box on a post): counts the share, unless a bot
// followed the link, and sends the reader on to Twitter, Hacker News, Reddit
// or their email with the post filled in (Go's routeBlogShare).
export const Route = createFileRoute('/blog/share/$slug/$platform')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const post = await postBySlug(params.slug)
        if (!post) return textError(500, 'Failed to fetch Post')
        const target = shareUrl(post, params.platform)
        if (target && !isBot(request.headers.get('user-agent') ?? '')) await countShare(post.id)
        // Go's http.Redirect with an empty address went to the directory
        // of the request's path.
        return redirect(target || `/blog/share/${encodeURIComponent(params.slug)}/`, 303)
      },
    },
  },
})
