import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { NotFound, Site, pageHead } from '#/components/site'
import { unsubscribe } from '#/server/newsletter'
import { notFoundData } from '#/server/pages'

// The unsubscribe link in every newsletter email: unsubscribes on the visit,
// as the Go site did, and says so (templates/pages/page/unsubscribe.html).
// An id that is no subscriber's gets the 404 page, where Go answered 500.

const doUnsubscribe = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const subscriber = await unsubscribe(id)
    if (!subscriber) return notFoundData()
    return { email: subscriber.email }
  })

export const Route = createFileRoute('/newsletter/unsubscribe/$id')({
  loader: ({ params }) => doUnsubscribe({ data: params.id }),
  head: (ctx) => pageHead(ctx.loaderData && 'email' in ctx.loaderData ? { title: 'Unsubscribed' } : {}, ctx),
  component: Unsubscribed,
})

function Unsubscribed() {
  const data = Route.useLoaderData()
  if ('notFound' in data) return <NotFound posts={data.posts} />
  return (
    <Site>
      <div className="container content">
        <h1>Unsubscribed</h1>
        <p>
          You will no longer receive newsletter emails to <code>{data.email}</code> 🙂
        </p>
        <p>
          <a href="/">&laquo; Home</a>
        </p>
      </div>
    </Site>
  )
}
