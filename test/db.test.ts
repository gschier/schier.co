// The database:
//   node --test test/db.test.ts
//
// Over a scratch database it makes and drops: the migrations make the Go
// site's tables as Prisma's schema describes them, and a post can be
// written and read back through the site's own client (src/server/db.ts).

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { after, before, test } from 'node:test'
import { root, scratch, site } from './help.ts'

let s: Awaited<ReturnType<typeof scratch>>
let app: Awaited<ReturnType<typeof site>>

before(async () => {
  s = await scratch('db')
  app = await site(s.url)
})

after(async () => {
  await app?.close()
  await s?.drop()
})

test('the migrations make the five tables, and Prisma sees nothing to change', async () => {
  const tables = await s.rows<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name <> '_prisma_migrations' ORDER BY table_name`,
  )
  assert.deepEqual(
    tables.map((t) => t.table_name),
    ['blog_posts', 'newsletter_sends', 'newsletter_subscribers', 'sessions', 'users'],
  )
  const [tags] = await s.rows<{ data_type: string; column_default: string }>(
    `SELECT data_type, column_default FROM information_schema.columns WHERE table_name = 'blog_posts' AND column_name = 'tags'`,
  )
  assert.deepEqual(tags, { data_type: 'ARRAY', column_default: 'ARRAY[]::text[]' })

  // Exits non-zero, failing the test, if the schema and the database differ.
  const said = execFileSync('node', ['node_modules/prisma/build/index.js', 'migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: s.url, DIRECT_URL: s.url },
    encoding: 'utf8',
  })
  assert.match(said, /No difference detected/)
})

test('a post is written and read back', async () => {
  const { db, newId } = await app.load<typeof import('../src/server/db.ts')>('/src/server/db.ts')
  const id = newId('pst_')
  assert.match(id, /^pst_[a-z0-9]{12}$/)
  await db.blogPost.create({
    data: { id, slug: 'hello-world', title: 'Hello, world', content: '# Hello\n\nFirst post.', image: '', tags: ['meta', 'writing'] },
  })

  const post = await db.blogPost.findUniqueOrThrow({ where: { slug: 'hello-world' } })
  assert.equal(post.id, id)
  assert.equal(post.title, 'Hello, world')
  assert.deepEqual(post.tags, ['meta', 'writing'])
  assert.equal(post.published, false)
  assert.equal(post.summary, '')
  assert.equal(post.donations, 0)
  assert.equal(post.userId, null)

  const [row] = await s.rows<{ slug: string; votes_total: number }>(`SELECT slug, votes_total FROM blog_posts WHERE id = $1`, [id])
  assert.deepEqual(row, { slug: 'hello-world', votes_total: 0 })
})
