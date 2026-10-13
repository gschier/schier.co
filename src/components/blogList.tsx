// templates/pages/blog/list.html: a page of posts, for /blog/page/{n} and
// /blog/tags/{tag}.

import { PostPreview, Site, adminLinks, useSite } from '#/components/site'
import type { PreviewView } from '#/lib/views'

export type BlogListData = { posts: PreviewView[]; tag: string; page: number; previous: number; next: number }

/// The title and description Go's routeBlogPosts gave a list.
export function listHead(tag: string, page: number) {
  let title = 'Blog'
  let description = 'An archive of blog posts'
  if (tag) {
    description += ` for tag ${tag}`
    title += ` ${tag} Tag`
  }
  if (page > 1) {
    description += ` (page ${page})`
    title += ` (Page ${page})`
  }
  return { title, description }
}

export function BlogList({ posts, tag, page, previous, next }: BlogListData) {
  const { admin } = useSite()
  return (
    <Site>
      <div className="container">
        <div className="content">
          <h1>
            {tag ? (
              <>
                Posts in <span className="tag">{tag}</span>
              </>
            ) : page === 1 ? (
              'Welcome to the Blog!'
            ) : (
              `Page ${page}`
            )}
          </h1>
          {!tag && page === 1 && (
            <>
              <p>This is where I write about life, programming, and other interests.</p>
              <p>
                Browse recent posts below, view <a href="/blog/tags">Tags</a>, or subscribe via <a href="/newsletter">Newsletter</a> or <a href="/rss.xml">RSS</a>.
              </p>
              {admin && (
                <div className="notice notice--warning">
                  <a href={adminLinks.drafts} className="btn btn--warning btn--sm">
                    Drafts
                  </a>{' '}
                  <a href={adminLinks.newPost} className="btn btn--warning btn--sm">
                    Create New
                  </a>
                </div>
              )}
            </>
          )}
        </div>
        <hr />
        {posts.map((post) => (
          <PostPreview key={post.slug} post={post} />
        ))}

        {posts.length === 0 && <p>No posts found 🧐</p>}

        <div className="pagination">
          <div className="pagination-left">
            {previous !== page && (
              <a href={`/blog/page/${previous}`} className="left">
                &laquo; Previous
              </a>
            )}
          </div>
          <div className="pagination-center">Page {page}</div>
          <div className="pagination-right">{next !== page && <a href={`/blog/page/${next}`}>Next &raquo;</a>}</div>
        </div>
      </div>
    </Site>
  )
}
