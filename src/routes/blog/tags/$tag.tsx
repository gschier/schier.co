import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { BlogList, listHead, type BlogListData } from '#/components/blogList'
import { pageHead } from '#/components/site'
import { postsPage } from '#/server/posts'
import { preview } from '#/server/views'

// The posts with a tag: the newest ten, as Go served them, with the list's
// "Next" link going on to page 2 of the whole blog as Go's did.

const getTag = createServerFn({ method: 'GET' })
  .validator((tag: string) => tag)
  .handler(async ({ data: tag }): Promise<BlogListData> => {
    const result = (await postsPage(1, tag))!
    return { posts: result.posts.map(preview), tag, page: 1, previous: result.previous, next: result.next }
  })

export const Route = createFileRoute('/blog/tags/$tag')({
  loader: ({ params }) => getTag({ data: params.tag }),
  head: (ctx) => pageHead(listHead(ctx.params.tag, 1), ctx),
  component: () => <BlogList {...Route.useLoaderData()} />,
})
