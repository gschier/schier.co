import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { PostPreview, Site, pageHead } from '#/components/site'
import { searchPosts } from '#/server/posts'
import { preview } from '#/server/views'

// Search (templates/pages/blog/search.html): ?query= matched against the
// posts' content, titles and tags.

const getResults = createServerFn({ method: 'GET' })
  .validator((query: string) => query)
  .handler(async ({ data: query }) => ({ query, results: (await searchPosts(query)).map(preview) }))

export const Route = createFileRoute('/blog/search')({
  validateSearch: (search: Record<string, unknown>): { query?: string } => (typeof search.query === 'string' ? { query: search.query } : {}),
  loaderDeps: ({ search }) => ({ query: search.query ?? '' }),
  loader: ({ deps }) => getResults({ data: deps.query }),
  head: (ctx) => pageHead({}, ctx),
  component: Search,
})

function Search() {
  const { query, results } = Route.useLoaderData()
  return (
    <Site>
      <div className="container content">
        <form action="/blog/search" method="get">
          <div className="button-input">
            <label htmlFor="i-query">Search</label>
            <input id="i-query" name="query" type="text" autoFocus defaultValue={query} />
            <button className="btn">Search</button>
          </div>
        </form>
        {query && (
          <small>
            {results.length} {results.length === 1 ? 'Result' : 'Results'}
          </small>
        )}
        {results.map((post) => (
          <PostPreview key={post.slug} post={post} />
        ))}
      </div>
    </Site>
  )
}
