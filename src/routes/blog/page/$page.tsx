import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { BlogList, listHead, type BlogListData } from '#/components/blogList'
import { NotFound, pageHead } from '#/components/site'
import { notFoundData, type NotFoundData } from '#/server/pages'
import { postsPage } from '#/server/posts'
import { preview } from '#/server/views'

// A page of the blog, ten posts at a time, newest first. Go's route took
// only digits, and answered a page past the last with its 404.

const getPage = createServerFn({ method: 'GET' })
  .validator((page: string) => page)
  .handler(async ({ data }): Promise<BlogListData | NotFoundData> => {
    const page = /^[0-9]+$/.test(data) ? Number(data) : NaN
    const result = Number.isSafeInteger(page) ? await postsPage(page) : null
    if (!result) return notFoundData()
    return { posts: result.posts.map(preview), tag: '', page: result.page, previous: result.previous, next: result.next }
  })

export const Route = createFileRoute('/blog/page/$page')({
  loader: ({ params }) => getPage({ data: params.page }),
  head: (ctx) => pageHead(ctx.loaderData && 'page' in ctx.loaderData ? listHead('', ctx.loaderData.page) : {}, ctx),
  component: Page,
})

function Page() {
  const data = Route.useLoaderData()
  return 'notFound' in data ? <NotFound posts={data.posts} /> : <BlogList {...data} />
}
