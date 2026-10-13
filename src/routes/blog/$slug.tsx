import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { useEffect, useRef } from 'react'
import { Cheers } from '#/components/cheers'
import { FullSubscriptionForm, NotFound, PostCards, Site, Tags, adminLinks, pageHead, useSite } from '#/components/site'
import { articleInner } from '#/lib/html'
import { svgs } from '#/lib/icons'
import { isAdmin } from '#/server/admin'
import { sendStatus } from '#/server/newsletter'
import { notFoundData } from '#/server/pages'
import { countView, postBySlug, recommendedPosts } from '#/server/posts'
import { card, description, goTime, postView } from '#/server/views'

// A post (templates/pages/blog/post.html and partials/blog_post.html): the
// post, its cheers and tags, the newsletter and three posts to read next. A
// reader's view is counted. Unlisted posts show here like any other; a draft
// shows only to the admin.

const getPost = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const post = await postBySlug(slug)
    const admin = isAdmin()
    if (!post || (!post.published && !admin)) return notFoundData()
    const sent = admin ? (await sendStatus(post)).send : null
    const [view, recommended] = await Promise.all([postView(post, sent?.recipients ?? null), recommendedPosts(post.id)])
    // Counted after the page is on its way, as Go did in a goroutine.
    countView(post, getRequestHeader('user-agent') ?? '', admin).catch((error) => console.error(`posts: counting a view of ${post.slug} failed:`, error))
    return {
      post: view,
      recommended: recommended.map(card),
      head: {
        title: post.title,
        description: description(post),
        image: post.image,
        publishedTime: goTime(post.date),
        modifiedTime: goTime(post.updatedAt),
      },
    }
  })

export const Route = createFileRoute('/blog/$slug')({
  loader: ({ params }) => {
    // /blog/{slug}.html, as the very old static site had it.
    if (params.slug.endsWith('.html')) throw redirect({ href: `/blog/${encodeURIComponent(params.slug.slice(0, -5))}`, statusCode: 302 })
    return getPost({ data: params.slug })
  },
  head: (ctx) => pageHead(ctx.loaderData && 'head' in ctx.loaderData ? ctx.loaderData.head : {}, ctx),
  component: PostPage,
})

function PostPage() {
  const data = Route.useLoaderData()
  if ('notFound' in data) return <NotFound posts={data.posts} />
  const { post, recommended } = data
  return (
    <Site>
      <div className="container blog-post-container">
        <Article />
        <Cheers post={post}>
          <Tags tags={post.tags} />
        </Cheers>

        <hr className="hr--spaced" />
        <FullSubscriptionForm />
        <div>
          <div className="row-spaced">
            <h2 className="row-spaced">Recommended Posts ✍🏻</h2>
            <small>
              <a href="/blog" title="See all blog posts">
                See All &raquo;
              </a>
            </small>
          </div>
          <PostCards posts={recommended} />
        </div>
      </div>
    </Site>
  )
}

/// The post itself, drawn as one string (src/lib/html.ts), and then what
/// the Go partial's scripts did to it: an image's alt text as a caption
/// below it, and a link icon beside each heading with an id.
function Article() {
  const data = Route.useLoaderData()
  const { admin } = useSite()
  const ref = useRef<HTMLElement>(null)
  const post = 'post' in data ? data.post : null
  useEffect(() => {
    const article = ref.current
    if (!article || article.dataset.enhanced) return
    article.dataset.enhanced = 'yes'
    article.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
      if (!img.alt) return
      const figure = document.createElement('figure')
      const caption = document.createElement('figcaption')
      caption.innerHTML = img.alt
      img.parentNode!.appendChild(figure)
      figure.appendChild(img)
      figure.appendChild(caption)
    })
    document.querySelectorAll('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]').forEach((heading) => {
      if (heading.querySelector(':scope > .h-link')) return
      const a = document.createElement('a')
      a.href = '#' + heading.id
      a.classList.add('h-link')
      a.innerHTML = svgs.link
      heading.classList.add('header')
      heading.prepend(a)
    })
  }, [])
  if (!post) return null
  return <article ref={ref} className="content blog-post" dangerouslySetInnerHTML={{ __html: articleInner(post, admin, adminLinks.edit(post.id)) }} />
}
