import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { NotFound, pageHead } from '#/components/site'
import { notFoundData } from '#/server/pages'

// Any address the site has no page for: the 404 page (templates/pages/404.html),
// answered with a 404.

const getNotFound = createServerFn({ method: 'GET' }).handler(() => notFoundData())

export const Route = createFileRoute('/$')({
  loader: () => getNotFound(),
  head: (ctx) => pageHead({}, ctx),
  component: () => <NotFound posts={Route.useLoaderData().posts} />,
})
