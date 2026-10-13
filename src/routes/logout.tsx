import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { NotFound, pageHead } from '#/components/site'
import { logout } from '#/server/auth'
import { notFoundData } from '#/server/pages'

// Signing out (the footer's Logout, Go's /logout), by GET as Go's link did
// it or by POST: the session is deleted, its cookie cleared and the browser
// sent home. Without a session cookie this is the site's 404.

const logOut = createServerFn({ method: 'GET' }).handler(async () => {
  if (!(await logout())) return notFoundData()
  throw redirect({ to: '/' })
})

export const Route = createFileRoute('/logout')({
  loader: () => logOut(),
  head: (ctx) => pageHead({}, ctx),
  component: () => <NotFound posts={Route.useLoaderData().posts} />,
})
