import { HeadContent, Scripts, createRootRoute, useMatches } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import { Analytics } from '#/components/Analytics'
import { THEME_SCRIPT } from '#/components/site'
import { isAdmin } from '#/server/admin'
import appCss from '../styles.css?url'

/// Whether this visit is Greg's, signed in at /login (src/server/auth.ts),
/// so analytics leaves it out and the pages show him the admin's links; and
/// the site's address, for the absolute links in a page's head and footer.
const getSite = createServerFn({ method: 'GET' }).handler(async () => ({
  admin: await isAdmin(),
  baseUrl: (process.env.BASE_URL ?? '').replace(/\/+$/, ''),
}))

/// Whether the page is one of the admin's (/admin and the editor).
const isAdminPage = (matches: { routeId: string }[]) => matches.some((m) => m.routeId.startsWith('/admin'))

/// What lets the admin install as an app (public/admin.webmanifest is the
/// rest): full screen from the home screen on iOS, under its own name.
const ADMIN_APP_META = [
  { name: 'apple-mobile-web-app-capable', content: 'yes' },
  { name: 'mobile-web-app-capable', content: 'yes' },
  { name: 'apple-mobile-web-app-title', content: 'Posts' },
  { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
]

/// The browser's bar in the page's colours, light and dark. Drawn in the
/// document's head directly: HeadContent keeps one meta of a name.
const THEME_COLORS = (
  <>
    <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#111e2c" media="(prefers-color-scheme: dark)" />
  </>
)

export const Route = createRootRoute({
  loader: () => getSite(),
  // Asked once, when the server draws the first page; moving between pages
  // keeps the answer rather than asking again.
  staleTime: Infinity,
  head: ({ matches }) => ({
    // What every page of the Go site had (templates/layouts/wrapper.html);
    // each page adds its title, description and social tags (pageHead in
    // src/components/site.tsx). The admin's pages install as an app of
    // their own, from Safari's share sheet too.
    meta: [
      ...(isAdminPage(matches) ? ADMIN_APP_META : []),
      { charSet: 'utf-8' },
      { title: 'Gregory Schier' },
      { name: 'author', content: 'Gregory Schier' },
      { name: 'HandheldFriendly', content: 'True' },
      { name: 'MobileOptimized', content: '320' },
      // The admin's bars keep clear of the notch and home indicator
      // themselves (env(safe-area-inset-*) in src/styles.css).
      { name: 'viewport', content: `width=device-width,initial-scale=1,maximum-scale=5${isAdminPage(matches) ? ',viewport-fit=cover' : ''}` },
      { name: 'msapplication-TileColor', content: '#2d89ef' },
      { name: 'msapplication-config', content: '/static/favicon/browserconfig.xml' },
      { name: 'twitter:site', content: '@GregorySchier' },
      { name: 'twitter:creator', content: '@GregorySchier' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      // The favicons where the Go site served them (frontend/favicon at
      // /static/favicon, now public/static/favicon).
      { rel: 'apple-touch-icon', sizes: '180x180', href: '/static/favicon/apple-touch-icon.png' },
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/static/favicon/favicon-32x32.png' },
      { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/static/favicon/favicon-16x16.png' },
      { rel: 'manifest', href: isAdminPage(matches) ? '/admin.webmanifest' : '/static/favicon/site.webmanifest' },
      { rel: 'shortcut icon', href: '/static/favicon/favicon.ico' },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const { admin } = Route.useLoaderData()
  const adminPage = useMatches({ select: isAdminPage })
  // The theme script sets <html theme="..."> before React hydrates.
  return (
    <html lang="en-US" suppressHydrationWarning>
      <head>
        <HeadContent />
        {adminPage && THEME_COLORS}
      </head>
      <body data-logged-in={admin ? 'yes' : 'no'}>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {children}
        <Analytics off={admin} />
        {/* Dev servers only; the build also strips them (vite.config.ts, devtools()). */}
        {import.meta.env.DEV && (
          <TanStackDevtools
            config={{
              position: 'bottom-right',
            }}
            plugins={[
              {
                name: 'Tanstack Router',
                render: <TanStackRouterDevtoolsPanel />,
              },
            ]}
          />
        )}
        <Scripts />
      </body>
    </html>
  )
}
