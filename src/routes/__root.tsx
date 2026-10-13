import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
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

export const Route = createRootRoute({
  loader: () => getSite(),
  // Asked once, when the server draws the first page; moving between pages
  // keeps the answer rather than asking again.
  staleTime: Infinity,
  head: () => ({
    // What every page of the Go site had (templates/layouts/wrapper.html);
    // each page adds its title, description and social tags (pageHead in
    // src/components/site.tsx).
    meta: [
      { charSet: 'utf-8' },
      { title: 'Gregory Schier' },
      { name: 'author', content: 'Gregory Schier' },
      { name: 'HandheldFriendly', content: 'True' },
      { name: 'MobileOptimized', content: '320' },
      { name: 'viewport', content: 'width=device-width,initial-scale=1,maximum-scale=5' },
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
      { rel: 'manifest', href: '/static/favicon/site.webmanifest' },
      { rel: 'shortcut icon', href: '/static/favicon/favicon.ico' },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const { admin } = Route.useLoaderData()
  // The theme script sets <html theme="..."> before React hydrates.
  return (
    <html lang="en-US" suppressHydrationWarning>
      <head>
        <HeadContent />
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
