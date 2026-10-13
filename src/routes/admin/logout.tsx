import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { NotFound, pageHead } from '#/components/site'
import { ADMIN_COOKIE, signOut } from '#/server/admin'
import { notFoundData } from '#/server/pages'

// Signing out (the footer's Logout, as Go's /logout): the admin cookie is
// cleared and the browser sent home. Without a cookie to clear this is the
// site's 404, like every other admin page. A stale cookie (an old token) is
// cleared too.

const logOut = createServerFn({ method: 'GET' }).handler(async () => {
  if (getCookie(ADMIN_COOKIE) === undefined) return notFoundData()
  signOut()
  throw redirect({ to: '/' })
})

export const Route = createFileRoute('/admin/logout')({
  loader: () => logOut(),
  head: (ctx) => pageHead({}, ctx),
  component: () => <NotFound posts={Route.useLoaderData().posts} />,
})
