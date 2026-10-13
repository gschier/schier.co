import { createFileRoute } from '@tanstack/react-router'
import { Editor, editorHead } from '#/components/editor'
import { NotFound } from '#/components/site'
import { getEditor } from '#/lib/adminFns'

// A new post (Go's /blog/new): the editor with nothing in it. The first save
// creates the post and moves to its own address, /admin/edit/{id}.

export const Route = createFileRoute('/admin/new')({
  loader: () => getEditor({ data: null }),
  head: (ctx) => editorHead('New post', ctx),
  component: NewPost,
})

function NewPost() {
  const data = Route.useLoaderData()
  if ('notFound' in data) return <NotFound posts={data.posts} />
  return <Editor data={data} />
}
