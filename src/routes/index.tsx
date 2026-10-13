import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { FullSubscriptionForm, PostCards, Site, pageHead } from '#/components/site'
import { recentPosts } from '#/server/posts'
import { card } from '#/server/views'

// The home page (templates/pages/page/home.html): who Greg is, the five
// newest posts and the newsletter.

const getHome = createServerFn({ method: 'GET' }).handler(async () => (await recentPosts(5)).map(card))

export const Route = createFileRoute('/')({
  loader: () => getHome(),
  head: (ctx) => pageHead({}, ctx),
  component: Home,
})

function Home() {
  const posts = Route.useLoaderData()
  return (
    <Site>
      <div className="container container--spaced-2">
        <div className="home-hero">
          <div className="home-hero__avatar">
            <img src="/static/images/me.jpg" alt=" icon" />
          </div>
          <div className="home-hero__bio content">
            <h1>Hey, I'm Greg! 👋</h1>
            <p>
              I'm a software dev in Canada 🇨🇦 building the <a href="https://yaak.app">Yaak API Client</a>, a delightful tool for interacting with network APIs.
            </p>
          </div>
        </div>
      </div>

      <div className="container container--spaced-2">
        <h2>Blog Posts 👇🏼</h2>
        <PostCards posts={posts} />
        <div style={{ paddingTop: '0.75em', textAlign: 'right' }}>
          <small>
            <a href="/blog" title="See all blog posts">
              See All &raquo;
            </a>
          </small>
        </div>
      </div>

      <div className="container">
        <FullSubscriptionForm />
      </div>
    </Site>
  )
}
