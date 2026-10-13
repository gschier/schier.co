import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { captureException } from '@sentry/tanstackstart-react'
import { z } from 'zod'
import { db } from '#/server/db'
import { MAX_POST_AGE_MS, sendKey, sendPost, sendStatus } from '#/server/newsletter'
import {
  PostActionError,
  createPost,
  deletePost,
  getPost,
  isRefusal,
  listPosts,
  publishPost,
  renderPreview,
  setUnlisted,
  unpublishPost,
  updatePost,
  type PostFields,
} from '#/server/postActions'
import { uploadImage } from '#/server/uploads'

// The admin MCP (BRIEF.md, Admin and auth): drafting, editing and
// publishing posts, images, and sending a post to the newsletter, for
// agents and later a mobile companion. Served at /mcp (src/routes/mcp.ts)
// behind the MCP_TOKEN bearer. Every tool answers in JSON text; what it
// refuses (a duplicate slug, a post that does not exist, a second send)
// comes back as a tool error with a plain message.

/// How every tool that takes one names a post.
const POST = z.string().min(1).max(200).describe('The post: its slug (as in /blog/{slug}) or its id (pst_...)')

/// The fields a post is created or edited with. Each left out is left as it
/// is (or its default, on create).
const FIELDS = {
  title: z.string().max(500).optional().describe('The title. Capitalised as the site always has: each word, except small words (a, the, of, and...) after the first'),
  slug: z
    .string()
    .max(200)
    .optional()
    .describe(
      'Where the post lives, /blog/{slug}: lower-case letters, digits, - and _. Empty makes one from the title. A slug another post has is refused. A published post keeps its slug; unpublish it first to change it',
    ),
  content: z.string().max(2_000_000).optional().describe('The post in markdown (GitHub flavoured). <!--more--> marks where the summary ends'),
  tags: z.array(z.string().max(100)).max(50).optional().describe('Tags, saved in lower case, for example ["javascript", "career"]'),
  image: z.string().max(2000).optional().describe('An image for the post\'s social card and lists, usually a /media/... path from upload_image; empty for none'),
  summary: z.string().max(5000).optional().describe('A summary for lists, feeds and the newsletter; empty uses the post\'s opening paragraph'),
  date: z
    .string()
    .max(100)
    .optional()
    .describe('The post\'s date, ISO 8601 (2026-10-13T09:00:00Z). Without it a draft is dated now on each save; publish_post dates the post now'),
  stage: z.number().int().min(-1000).max(1000).optional().describe('How far along a draft is; drafts are listed furthest along first'),
  unlisted: z.boolean().optional().describe('Unlisted: published at its URL but left out of the blog\'s lists, tags, search and feed'),
}

const INCLUDING = z.enum(['include', 'exclude', 'only'])

/// The largest image upload_image takes.
const MAX_IMAGE_BYTES = 25 * 1024 * 1024

export function createAdminServer(): McpServer {
  const server = reported(new McpServer({ name: 'schier-co-admin', version: '0.1.0' }))

  server.registerTool(
    'list_posts',
    {
      title: 'List posts',
      description:
        'Posts as summaries without their content, newest first by date: id, slug, title, published, unlisted, stage, date, editedAt, tags, image, views and summary (its own, else the opening of the content). Drafts and unlisted posts are included unless asked otherwise; drafts alone (drafts "only") are sorted furthest along (stage), then last edited, first. total counts every match before limit and offset. Use get_post for a post\'s markdown.',
      inputSchema: {
        drafts: INCLUDING.default('include').describe('Unpublished posts: include, exclude, or only them'),
        unlisted: INCLUDING.default('include').describe('Unlisted posts: include, exclude, or only them'),
        query: z.string().max(200).optional().describe('Words to find in the title, slug or content (case-insensitive), or a tag'),
        limit: z.number().int().min(1).max(500).default(50),
        offset: z.number().int().min(0).default(0),
      },
    },
    async (options) => text(await listPosts(options)),
  )

  server.registerTool(
    'get_post',
    {
      title: 'Get a post',
      description:
        'One post in full, with its markdown content: id, slug, title, content, summary, tags, image, date, editedAt, published, unlisted, stage, and its counters (views, shares, votes, donations). Its page is /blog/{slug} once published.',
      inputSchema: { post: POST },
    },
    async ({ post }) => text(await getPost(post)),
  )

  server.registerTool(
    'create_post',
    {
      title: 'Create a draft',
      description:
        'Create a post as an unpublished draft. Give a title (the slug is made from it, as in "My New Post" to my-new-post) or a slug. A slug another post has is refused. Returns the new post; publish it with publish_post.',
      inputSchema: FIELDS,
    },
    async (fields) => text(await createPost(fields as PostFields)),
  )

  server.registerTool(
    'update_post',
    {
      title: 'Edit a post',
      description:
        'Edit a draft or a published post. Only the fields given change. An empty slug on a draft makes one from the title; a slug another post has is refused, and a published post\'s slug cannot change (unpublish it first). A draft saved without a date is dated now, as the site always did; a published post keeps its date unless one is given. editedAt moves when the content changes. Returns the post as saved.',
      inputSchema: { post: POST, ...FIELDS },
    },
    async ({ post, ...fields }) => text(await updatePost(post, fields as PostFields)),
  )

  server.registerTool(
    'publish_post',
    {
      title: 'Publish a post',
      description:
        'Publish a draft: it appears on the blog at /blog/{slug}, in lists and the feed (unless unlisted), dated now so it is new and can go to the newsletter with send_newsletter (which only sends posts dated in the last day). A post with no title or no content is refused. A post already published is left as it is, date included. Does not email anyone.',
      inputSchema: { post: POST },
    },
    async ({ post }) => text(await publishPost(post)),
  )

  server.registerTool(
    'unpublish_post',
    {
      title: 'Unpublish a post',
      description: 'Make a published post a draft again: gone from the site, its lists and feed until it is published again. Its date and content are kept.',
      inputSchema: { post: POST },
    },
    async ({ post }) => text(await unpublishPost(post)),
  )

  server.registerTool(
    'unlist_post',
    {
      title: 'Unlist a post',
      description:
        'Unlist a post (unlisted true, the default): still at /blog/{slug} for whoever has the link, but left out of the blog\'s lists, tags, search and feed. unlisted false lists it again.',
      inputSchema: { post: POST, unlisted: z.boolean().default(true) },
    },
    async ({ post, unlisted }) => text(await setUnlisted(post, unlisted)),
  )

  server.registerTool(
    'delete_post',
    {
      title: 'Delete a post',
      description:
        'Delete a post for good, draft or published, with its counters. There is no undo: to take a post off the site and keep it, use unpublish_post. Returns the post as it was, content included.',
      inputSchema: { post: POST },
    },
    async ({ post }) => text({ deleted: await deletePost(post) }),
  )

  server.registerTool(
    'render_preview',
    {
      title: 'Preview markdown',
      description:
        'Render markdown as the post page renders a post\'s content, without saving anything: html, and summary, the plain-text opening a post gets when it has no summary of its own (the part before <!--more-->, else the first paragraph).',
      inputSchema: { markdown: z.string().max(2_000_000).describe('The markdown to render') },
    },
    async ({ markdown }) => text(await renderPreview(markdown)),
  )

  server.registerTool(
    'upload_image',
    {
      title: 'Upload an image',
      description:
        'Store an image for posts and return its path, /media/images/a/{unix}{ext}, to use in markdown (![alt](/media/...)) or as a post\'s image. The extension comes from fileName. Two uploads in the same second with the same extension share a path, and the second replaces the first.',
      inputSchema: {
        data: z.string().min(1).max(Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4).describe('The image\'s bytes, base64'),
        contentType: z.string().max(100).describe('Its type: image/png, image/jpeg, image/gif, image/webp, image/svg+xml...'),
        fileName: z.string().max(300).describe('Its file name, for the extension, as in photo.jpg'),
      },
    },
    async ({ data, contentType, fileName }) => {
      const type = contentType.trim().toLowerCase()
      if (!/^image\/[a-z0-9.+-]+$/.test(type)) throw new PostActionError(`"${contentType}" is not an image type; give one such as image/png`)
      const base64 = data.replace(/^data:[^,]*;base64,/, '').replace(/\s+/g, '')
      if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(base64) || base64.length % 4 === 1) throw new PostActionError('data is not base64')
      const bytes = Buffer.from(base64, 'base64')
      if (!bytes.byteLength) throw new PostActionError('data is empty')
      if (bytes.byteLength > MAX_IMAGE_BYTES) throw new PostActionError(`The image is ${bytes.byteLength} bytes; at most ${MAX_IMAGE_BYTES} are taken`)
      const path = await uploadImage(new Uint8Array(bytes), type, fileName)
      return text({ path, bytes: bytes.byteLength, contentType: type })
    },
  )

  server.registerTool(
    'send_newsletter',
    {
      title: 'Send a post to the newsletter',
      description:
        'Email a published post to every subscriber. dryRun (the default) sends and records nothing and returns who would get it (recipients) and the email the first of them would get (email: to, subject, text, html): look at that first, then send with dryRun false. A post goes out once: a second send is refused. Only a published post dated in the last day can be sent (publish_post dates it now). to sends it to that one subscriber\'s address only, as a test, which does not stop the real send later. Returns recipients (sent, or that would be), failed, dryRun and email.',
      inputSchema: {
        post: POST,
        dryRun: z.boolean().default(true).describe('Send nothing; return the rendered email. Default true'),
        to: z.string().max(320).optional().describe('A test send to this one subscriber\'s address only'),
      },
    },
    async ({ post: slugOrId, dryRun, to }) => {
      const post = await getPost(slugOrId)
      // Refuse here what sendPost would refuse, so a refusal is told as one
      // and what sendPost still throws is a fault.
      if (to?.trim()) {
        if (!post.published) throw new PostActionError(`"${post.slug}" is not published`)
        if (Date.now() - post.date.getTime() > MAX_POST_AGE_MS) throw new PostActionError(`"${post.slug}" is dated more than a day ago (${post.date.toISOString()}); only a new post goes to the newsletter`)
        const subscriber = await db.newsletterSubscriber.findFirst({ where: { email: { equals: to.trim(), mode: 'insensitive' } } })
        if (!subscriber) throw new PostActionError(`No subscriber has the address ${to.trim()}`)
        if (subscriber.unsubscribed) throw new PostActionError(`${subscriber.email} has unsubscribed`)
      } else {
        const status = await sendStatus(post)
        if (!status.canSend) throw new PostActionError(status.reason ?? `"${post.slug}" cannot be sent`)
      }
      const result = await sendPost(post.slug, { dryRun, to: to?.trim() || undefined })
      return text({ recipients: result.recipients, failed: result.failed, dryRun: result.dryRun, email: result.sample })
    },
  )

  server.registerTool(
    'newsletter_status',
    {
      title: 'Newsletter status',
      description:
        'Subscribers (subscribed, and unsubscribed apart) and, for a post, whether it can be sent (canSend, and reason when not) and its sends: the real one (key post:{slug}, or the post\'s id for one the old site made) and test sends (keys starting TEST:), each with when and how many recipients. Without a post, the ten latest sends.',
      inputSchema: { post: POST.optional() },
    },
    async ({ post: slugOrId }) => {
      const [subscribed, unsubscribed] = await Promise.all([
        db.newsletterSubscriber.count({ where: { unsubscribed: false } }),
        db.newsletterSubscriber.count({ where: { unsubscribed: true } }),
      ])
      const subscribers = { subscribed, unsubscribed }
      if (!slugOrId) {
        const recent = await db.newsletterSend.findMany({ orderBy: { createdAt: 'desc' }, take: 10 })
        return text({ subscribers, recentSends: recent })
      }
      const post = await getPost(slugOrId)
      const [status, sends] = await Promise.all([
        sendStatus(post),
        db.newsletterSend.findMany({
          where: {
            OR: [
              { key: { in: [sendKey(post.slug), post.id] } },
              { key: { startsWith: 'TEST:', endsWith: `:${sendKey(post.slug)}` } },
              { key: { startsWith: 'TEST:', endsWith: `:${post.id}` } },
            ],
          },
          orderBy: { createdAt: 'asc' },
        }),
      ])
      return text({
        subscribers,
        post: { id: post.id, slug: post.slug, title: post.title, published: post.published, date: post.date },
        canSend: status.canSend,
        reason: status.reason,
        sends,
      })
    },
  )

  return server
}

type Handler = (...args: unknown[]) => unknown

/// [server], with every tool's failure turned into a tool error with a
/// plain message: a refusal (PostActionError) as it is, anything else
/// reported to Sentry (src/server/sentry.ts) first. Nothing is thrown on, so
/// no stack reaches the caller.
function reported(server: McpServer): McpServer {
  const register = server.registerTool.bind(server) as (name: string, config: unknown, handler: Handler) => unknown
  server.registerTool = ((name: string, config: unknown, handler: Handler) =>
    register(name, config, async (...args: unknown[]) => {
      try {
        return await handler(...args)
      } catch (error) {
        if (isRefusal(error)) return failure(error.message)
        captureException(error, { tags: { mcp_tool: name } })
        console.error(`mcp: ${name} failed:`, error)
        return failure(error instanceof Error ? error.message : String(error))
      }
    })) as typeof server.registerTool
  return server
}

function failure(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true }
}

function text(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}
