// The public site's frame and shared pieces, as the Go templates drew them
// (templates/layouts and templates/partials): the navigation, the footer,
// the dark-mode switch, post cards and previews, tags, the subscription
// forms and the 404 page. Class names are the Go templates', so the
// stylesheet (src/styles.css) applies as it did.

import { getRouteApi, useLocation } from '@tanstack/react-router'
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { svgs, type IconName } from '#/lib/icons'
import { metaInner, sanitizeTitle, type MetaOptions } from '#/lib/html'
import type { CardView, HeadView, MetaView, PreviewView } from '#/lib/views'

/// Where the admin's links go. The admin pages live under /admin (BRIEF.md,
/// Admin and auth); these are the Go site's edit, drafts, new and logout
/// links pointed there.
export const adminLinks = {
  drafts: '/admin',
  newPost: '/admin/new',
  edit: (id: string) => `/admin/edit/${encodeURIComponent(id)}`,
  logout: '/admin/logout',
}

const ANALYTICS = 'https://analytics.schier.co/analytics/site_RPutoRaXSMBFj6hyzV'

const DEFAULT_DESCRIPTION = 'Thoughts on software, technology, and life.'

const rootApi = getRouteApi('__root__')

/// What the root route knows of this visit: whether it is the admin's, and
/// the site's address for absolute links.
export function useSite(): { admin: boolean; baseUrl: string } {
  return rootApi.useLoaderData()
}

// ---------------------------------------------------------------------------
// Head

type HeadContext = { matches: { loaderData?: unknown }[]; match: { pathname: string } }

/// A page's <title> and meta, as templates/layouts/wrapper.html set them
/// from pageTitle, pageDescription, pageImage and the published and
/// modified times.
export function pageHead(view: HeadView, { matches, match }: HeadContext) {
  const baseUrl = (matches[0]?.loaderData as { baseUrl?: string } | undefined)?.baseUrl ?? ''
  // An index route's pathname ends in a slash (/blog/tags/); Go's had none.
  const path = match.pathname.length > 1 ? match.pathname.replace(/\/+$/, '') : match.pathname
  const pageUrl = baseUrl + encodeURI(decodeURI(path))
  const title = view.title ? sanitizeTitle(view.title) : ''
  const description = view.description ?? DEFAULT_DESCRIPTION
  const meta: Record<string, string>[] = [
    { title: title ? `${title} – Gregory Schier` : 'Gregory Schier' },
    { name: 'description', content: description },
  ]
  if (view.publishedTime) meta.push({ property: 'article:published_time', content: view.publishedTime })
  if (view.modifiedTime) {
    meta.push({ property: 'article:modified_time', content: view.modifiedTime })
    meta.push({ property: 'og:updated_time', content: view.modifiedTime })
  }
  meta.push(
    { property: 'og:url', content: pageUrl },
    { property: 'og:title', content: title || 'Gregory Schier' },
    { property: 'og:description', content: description },
    { name: 'twitter:card', content: view.image ? 'summary_large_image' : 'summary' },
    { property: 'og:image', content: view.image || `${baseUrl}/static/images/social/default.png` },
  )
  return {
    meta,
    links: [
      { rel: 'canonical', href: pageUrl },
      { rel: 'alternate', type: 'application/rss+xml', title: 'Gregory Schier', href: '/rss.xml' },
      { rel: 'feed', type: 'application/rss+xml', title: 'Gregory Schier', href: '/rss.xml' },
    ],
  }
}

// ---------------------------------------------------------------------------
// Dark mode

declare global {
  interface Window {
    setTheme?: (theme: 'light' | 'dark') => void
  }
}

/// templates/partials/dark_mode.html, run before the page is drawn: the
/// theme kept from the switch, else the system's, set on <html> (the
/// stylesheet's [theme="dark"]), and changed with the system's. Also the Go
/// site's page script (frontend/index.all.js): transitions switched on a
/// second after load, so the page does not animate as it appears.
export const THEME_SCRIPT = `(function () {
  var html = document.documentElement;
  var query = window.matchMedia('(prefers-color-scheme: dark)');
  function preferred() { return query.matches ? 'dark' : 'light'; }
  function stored() { try { return localStorage.getItem('theme'); } catch (e) { return null; } }
  function apply() {
    html.setAttribute('theme', stored() || preferred());
    window.dispatchEvent(new Event('themechange'));
  }
  window.setTheme = function (theme) {
    try { localStorage.setItem('theme', theme); } catch (e) {}
    apply();
  };
  apply();
  query.addEventListener('change', function () { window.setTheme(preferred()); });
  setTimeout(function () {
    var style = document.createElement('style');
    style.innerHTML = 'html,button{transition:all 250ms}';
    document.head.appendChild(style);
  }, 1000);
})();`

/// The sun or the moon in the navigation, switching between light and dark.
function ThemeSwitch() {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null)
  useEffect(() => {
    const read = () => setTheme(document.documentElement.getAttribute('theme') === 'dark' ? 'dark' : 'light')
    read()
    window.addEventListener('themechange', read)
    return () => window.removeEventListener('themechange', read)
  }, [])
  const toggle = (e: MouseEvent) => {
    e.preventDefault()
    window.setTheme?.(theme === 'dark' ? 'light' : 'dark')
  }
  // Until the theme is known, as the Go template drew it: the sun taking its
  // space unseen, the moon not at all.
  const shown = (which: 'light' | 'dark') => (theme === null ? (which === 'light' ? { opacity: 0 } : { display: 'none' }) : { display: theme === which ? 'inline-block' : 'none', opacity: 1 })
  return (
    <a href="#" data-toggle-theme="" style={{ display: 'flex', alignItems: 'center' }} onClick={toggle}>
      <Icon as="span" name="sun" data-theme-icon="light" style={shown('light')} />
      <Icon as="span" name="moon" data-theme-icon="dark" style={shown('dark')} />
    </a>
  )
}

// ---------------------------------------------------------------------------
// Frame

/// An inline SVG from frontend/images, wrapped in a span, or, with no `as`,
/// the SVG element itself with the file's attributes.
export function Icon({ name, as, ...rest }: { name: IconName; as?: 'span'; style?: React.CSSProperties; 'data-theme-icon'?: string }) {
  const svg = svgs[name]
  if (as === 'span') return <span {...rest} dangerouslySetInnerHTML={{ __html: svg }} />
  const [, attrs = '', inner = ''] = /^\s*<svg([^>]*)>([\s\S]*)<\/svg>\s*$/.exec(svg) ?? []
  return <svg {...svgAttributes(attrs)} dangerouslySetInnerHTML={{ __html: inner }} />
}

function svgAttributes(attrs: string): Record<string, string> {
  const props: Record<string, string> = {}
  for (const [, name, value] of attrs.matchAll(/([\w:-]+)="([^"]*)"/g)) {
    const key =
      name === 'class' ? 'className' : name === 'xmlns:xlink' ? 'xmlnsXlink' : /^(aria|data)-/.test(name!) ? name! : name!.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())
    props[key] = value!
  }
  return props
}

/// templates/partials/navigation.html.
function Navigation() {
  return (
    <nav className="top-nav">
      <div className="container">
        <ul>
          <li>
            <a href="/" className="logo" title="home">
              <Icon name="greg" />
            </a>
          </li>
          <li>
            <a href="/blog/page/1">Blog</a>
          </li>
          <li>
            <a href="/projects">Projects</a>
          </li>
        </ul>
        <ul>
          <li>
            <ThemeSwitch />
          </li>
          <li>
            <a href="/blog/rss.xml" title="RSS Feed">
              <Icon name="rss" />
            </a>
          </li>
          <li>
            <a href="/blog/search" title="search">
              <Icon name="search" />
            </a>
          </li>
        </ul>
      </div>
    </nav>
  )
}

/// templates/partials/footer.html.
function Footer() {
  const { admin, baseUrl } = useSite()
  const pageUrl = baseUrl + useLocation({ select: (l) => l.pathname })
  return (
    <footer className="bottom-footer">
      <div className="container">
        <div className="links">
          <a href="//twitter.com/GregorySchier" rel="noopener">
            Twitter
          </a>{' '}
          {'·'}{' '}
          <a href="https://mastodon.social/@gschier" rel="me">
            Mastodon
          </a>{' '}
          {'·'}{' '}
          <a href="//github.com/gschier" rel="noopener">
            GitHub
          </a>{' '}
          {'·'} <a href="/newsletter">Newsletter</a>
          <p>&copy; Greg Schier</p>
        </div>
        {admin && (
          <>
            <br />
            <div className="notice notice--warning">
              <a href={adminLinks.logout} className="btn btn--sm btn--warning">
                Logout
              </a>{' '}
              <a href={ANALYTICS} className="btn btn--sm btn--warning">
                Analytics
              </a>
              <br />
              <br />
              <a href={pageUrl}>
                <code style={{ fontSize: '0.9em' }}>{pageUrl}</code>
              </a>
            </div>
          </>
        )}
      </div>
    </footer>
  )
}

/// templates/layouts/base.html: the navigation, the page and the footer.
export function Site({ children }: { children: ReactNode }) {
  return (
    <>
      <Navigation />
      <main>{children}</main>
      <Footer />
    </>
  )
}

// ---------------------------------------------------------------------------
// Posts

/// templates/partials/blog_post_meta.html.
export function Meta({ meta, className = '', ...options }: { meta: MetaView; className?: string } & Omit<MetaOptions, 'admin'>) {
  const { admin } = useSite()
  return <div className={`meta ${className}`} dangerouslySetInnerHTML={{ __html: metaInner(meta, { admin, ...options }) }} />
}

/// templates/partials/blog_post_tag.html.
export function Tags({ tags }: { tags: string[] }) {
  return (
    <div className="tags">
      {tags.filter(Boolean).map((tag) => (
        <a key={tag} href={`/blog/tags/${tag}`} className="tag">
          {tag}
        </a>
      ))}
    </div>
  )
}

/// templates/partials/post-cards.html.
export function PostCards({ posts }: { posts: CardView[] }) {
  return (
    <div className="cards cards--flexy">
      {posts.map((post) => (
        <div key={post.slug} className="card card--clicky" onClick={() => (window.location.href = `/blog/${post.slug}`)}>
          <div className="card__inner">
            <div className="card__content">
              <Meta meta={post.meta} className="card__title" hot noViews noVotes />
              <div className="card__body">{post.title}</div>
              <a href={`/blog/${post.slug}`}>Read Post &raquo;</a>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/// templates/partials/blog_post_preview.html.
export function PostPreview({ post }: { post: PreviewView }) {
  return (
    <div className="content blog-post-preview">
      <h2>
        <a href={`/blog/${post.slug}`}>{post.title}</a>
        <Meta meta={post.meta} hot />
      </h2>
      <div>{post.summary}</div>
      <div className="blog-post-continue">
        <Tags tags={post.tags} />
        <a href={`/blog/${post.slug}`}>Continue Reading &raquo;</a>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Newsletter

/// templates/partials/subscription-form.html. The username field is a trap
/// for bots, moved off the page by the stylesheet.
export function SubscriptionForm() {
  return (
    <form action="/forms/newsletter/subscribe" method="post" className="subscription-form">
      <div className="button-input">
        <input id="subscription-email" name="email" type="email" placeholder="me@example.com" />
        <input id="subscription-username" name="username" type="text" placeholder="username" />
        <button className="btn">Subscribe</button>
      </div>
    </form>
  )
}

const HIDDEN_FOR = 1209600000 // two weeks

const hiddenRecently = () => {
  try {
    const time = parseInt(localStorage.schierSubHide)
    return !isNaN(time) && Date.now() - time < HIDDEN_FOR
  } catch {
    return false
  }
}

/// Hides the form at once, before the page is drawn, for someone who closed
/// it in the last two weeks, as the Go partial's inline script did.
const HIDE_SCRIPT = `(function () { try { var t = parseInt(localStorage.schierSubHide); if (!isNaN(t) && Date.now() - t < ${HIDDEN_FOR}) document.currentScript.parentNode.parentNode.style.display = 'none'; } catch (e) {} })();`

/// templates/partials/full-subscription-form.html: the boxed invitation to
/// subscribe, which a reader can close for two weeks.
export function FullSubscriptionForm() {
  const [hidden, setHidden] = useState(false)
  useEffect(() => setHidden(hiddenRecently()), [])
  const hide = (e: MouseEvent) => {
    e.preventDefault()
    localStorage.schierSubHide = String(Date.now())
    setHidden(true)
  }
  return (
    <div className="subscription-form-wrapper" style={hidden ? { display: 'none' } : undefined} suppressHydrationWarning>
      <div className="subscription-form__inner">
        <a className="subscription-form__hide" href="#" title="Hide subscription form" onClick={hide}>
          &times;
        </a>
        <script dangerouslySetInnerHTML={{ __html: HIDE_SCRIPT }} />
        <p>
          <label htmlFor="subscription-email">
            Subscribe for musings on <strong>indie dev, software, and life</strong> 💌
          </label>
        </p>
        <SubscriptionForm />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Not found

/// templates/pages/404.html, with recent posts to go to instead.
export function NotFound({ posts }: { posts: CardView[] }) {
  return (
    <Site>
      <div className="container">
        <div className="content">
          <h1>Page Not Found</h1>
          <p>
            I'm sorry, this page doesn't exist. Want to go <a href="/">back Home?</a>
          </p>
          <hr />
        </div>
        <p>Or, perhaps you were looking for a recent blog post.</p>
        <PostCards posts={posts} />
      </div>
    </Site>
  )
}
