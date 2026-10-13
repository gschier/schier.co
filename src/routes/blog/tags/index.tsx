import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { Site, pageHead, useSite } from '#/components/site'
import { tagCounts } from '#/server/posts'

// Every tag with its count (templates/pages/blog/tags.html).

const getTags = createServerFn({ method: 'GET' }).handler(() => tagCounts())

export const Route = createFileRoute('/blog/tags/')({
  loader: () => getTags(),
  head: (ctx) => pageHead({ title: 'Post Tags', description: 'Browse blog posts by tag category' }, ctx),
  component: Tags,
})

function Tags() {
  const tags = Route.useLoaderData()
  const { admin } = useSite()
  return (
    <Site>
      <div className="container content">
        <h1>Blog Post Tags</h1>
        <p className="all-tags">
          {tags.map((tag) => (
            <a key={tag.name} href={`/blog/tags/${tag.name}`} className="tag">
              {tag.name} ({tag.count})
            </a>
          ))}
          {admin && (
            <a href="/blog/tags/-" className="tag">
              Untagged
            </a>
          )}
        </p>
        <p>
          <small>
            <a href="/blog">&laquo; All Blog Posts</a>
          </small>
        </p>
      </div>
    </Site>
  )
}
