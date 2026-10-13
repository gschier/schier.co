import { createFileRoute } from '@tanstack/react-router'
import { Editor, editorHead } from '#/components/editor'
import { NotFound } from '#/components/site'
import { getEditor } from '#/lib/adminFns'

// The editor for the post {id} (Go's /blog/edit/{id}); a 404 for an id no
// post has.

export const Route = createFileRoute('/admin/edit/$id')({
  loader: ({ params }) => getEditor({ data: params.id }),
  head: (ctx) => editorHead(ctx.loaderData && 'post' in ctx.loaderData ? ctx.loaderData.post?.title || 'Untitled' : '', ctx),
  component: EditPost,
})

function EditPost() {
  const data = Route.useLoaderData()
  if ('notFound' in data) return <NotFound posts={data.posts} />
  // A fresh editor for each post, so moving from one to another starts clean.
  return <Editor key={data.post?.id} data={data} />
}
