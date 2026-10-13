import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { NotFound, Site, adminLinks, pageHead } from '#/components/site'
import { adminList, type ListRow } from '#/server/editor'
import { notFoundData } from '#/server/pages'

// The admin's home, replacing the Go site's /blog/drafts: every draft, then
// every published post, each a click from its editor. Signed in at /login
// (src/server/auth.ts); signed out this is the site's 404.

const getAdmin = createServerFn({ method: 'GET' }).handler(async () => (await adminList()) ?? notFoundData())

export const Route = createFileRoute('/admin/')({
  loader: () => getAdmin(),
  head: (ctx) => {
    const head = pageHead({ title: 'Posts' }, ctx)
    return { ...head, meta: [...head.meta, { name: 'robots', content: 'noindex' }] }
  },
  component: AdminPage,
})

function AdminPage() {
  const data = Route.useLoaderData()
  if ('notFound' in data) return <NotFound posts={data.posts} />
  const { drafts, posts } = data
  return (
    <Site>
      <div className="container content admin">
        <div className="row-spaced admin__head">
          <h1>Posts</h1>
          <a href={adminLinks.newPost} className="btn">
            New post
          </a>
        </div>

        <h2>
          Drafts <code>{drafts.length}</code>
        </h2>
        {drafts.length ? <PostTable rows={drafts} /> : <p>No drafts.</p>}

        <h2>
          Published <code>{posts.length}</code>
        </h2>
        {posts.length ? <PostTable rows={posts} /> : <p>Nothing published yet.</p>}
      </div>
    </Site>
  )
}

const STATE_LABELS: Record<ListRow['state'], string> = { draft: 'Draft', published: 'Published', unlisted: 'Unlisted' }

const dateFormat = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })

function PostTable({ rows }: { rows: ListRow[] }) {
  return (
    <table className="admin-posts">
      <thead>
        <tr>
          <th>Post</th>
          <th className="admin-posts__date">Date</th>
          <th>State</th>
          <th className="admin-posts__num">Views</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((post) => (
          <tr key={post.id}>
            <td>
              <a href={adminLinks.edit(post.id)}>{post.title || 'Untitled'}</a>
              <small className="admin-posts__slug">{post.slug}</small>
            </td>
            <td className="admin-posts__date">
              <time dateTime={post.date}>{dateFormat.format(new Date(post.date))}</time>
            </td>
            <td>
              <span className={`admin-state admin-state--${post.state}`}>{STATE_LABELS[post.state]}</span>
            </td>
            <td className="admin-posts__num">{post.views}</td>
            <td className="admin-posts__links">
              <a href={adminLinks.edit(post.id)} className="btn btn--gray btn--xs">
                Edit
              </a>{' '}
              <a href={`/blog/${post.slug}`} className="btn btn--gray btn--xs">
                View
              </a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
