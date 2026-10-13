// The newsletter: subscribing, unsubscribing and sending a post to every
// subscriber (BRIEF.md, Newsletter). Pages, routes, the editor button and
// the MCP tool are built on these.
//
// A post goes out once: a NewsletterSend row keyed post:{slug} is claimed
// before the first email and blocks a second send. Sends made by the Go
// site are keyed by the post's id, and block it too. As on the Go site, only
// a published post dated within the last day can be sent.

import type { BlogPost, NewsletterSend, NewsletterSubscriber } from '#/generated/prisma/client'
import { db, newId } from '#/server/db'
import { newPostEmail, welcomeEmail } from '#/server/emails'
import { mailer, type Email } from '#/server/mail'

/// How old a post may be and still go out, as on the Go site.
export const MAX_POST_AGE_MS = 24 * 60 * 60 * 1000

/// The NewsletterSend key that marks [slug] as sent.
export const sendKey = (slug: string) => `post:${slug}`

const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === 'P2002'

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error))

const findByEmail = (email: string) => db.newsletterSubscriber.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } })

export type Subscribed = {
  subscriber: NewsletterSubscriber
  /// A new subscriber, who was sent the welcome email.
  created: boolean
  /// Someone who had unsubscribed and is subscribed again.
  resubscribed: boolean
  /// Whether the welcome email went out; false if it was not due or failed.
  welcomed: boolean
}

/// Subscribes [email], or subscribes it again if it had unsubscribed. Only
/// a new subscriber is sent the welcome email; a failed welcome is logged,
/// not thrown, since the subscription itself stands.
export async function subscribe(email: string, name = ''): Promise<Subscribed> {
  email = email.trim()
  name = name.trim()
  if (!email || !email.includes('@')) throw new Error('An email address is required')

  let subscriber = await findByEmail(email)
  let created = false
  if (!subscriber) {
    try {
      subscriber = await db.newsletterSubscriber.create({ data: { id: newId('sub_'), email, name } })
      created = true
    } catch (error) {
      // Someone subscribed the same address at the same moment.
      if (!isUniqueViolation(error)) throw error
      subscriber = await findByEmail(email)
      if (!subscriber) throw error
    }
  }

  const resubscribed = !created && subscriber.unsubscribed
  if (resubscribed) subscriber = await db.newsletterSubscriber.update({ where: { id: subscriber.id }, data: { unsubscribed: false } })

  let welcomed = false
  if (created) {
    try {
      await mailer().send({ to: subscriber.email, ...welcomeEmail(subscriber) })
      welcomed = true
    } catch (error) {
      console.error(`newsletter: welcome email to ${subscriber.id} failed: ${reason(error)}`)
    }
  }
  return { subscriber, created, resubscribed, welcomed }
}

/// Unsubscribes the subscriber [id], returning them (for the address the
/// page shows), or null if there is no such subscriber.
export async function unsubscribe(id: string): Promise<NewsletterSubscriber | null> {
  const subscriber = await db.newsletterSubscriber.findUnique({ where: { id } })
  if (!subscriber) return null
  if (subscriber.unsubscribed) return subscriber
  return db.newsletterSubscriber.update({ where: { id }, data: { unsubscribed: true } })
}

/// Every subscriber, newest first, unsubscribed ones included (the
/// newsletter page's list for the admin).
export function listSubscribers(): Promise<NewsletterSubscriber[]> {
  return db.newsletterSubscriber.findMany({ orderBy: { createdAt: 'desc' } })
}

type Sendable = Pick<BlogPost, 'id' | 'slug' | 'published' | 'date'>

/// The send that already took [post] out, by this site's key or the Go site's.
function findSend(post: Sendable): Promise<NewsletterSend | null> {
  return db.newsletterSend.findFirst({ where: { key: { in: [sendKey(post.slug), post.id] } }, orderBy: { createdAt: 'asc' } })
}

/// Why [post] cannot be sent, or null if it can, ignoring earlier sends.
function refusal(post: Sendable, now = Date.now()): string | null {
  if (!post.published) return `"${post.slug}" is not published`
  if (now - post.date.getTime() > MAX_POST_AGE_MS) return `"${post.slug}" is dated more than a day ago (${post.date.toISOString()}); only a new post goes to the newsletter`
  return null
}

const alreadySent = (post: Sendable, send: NewsletterSend) =>
  `The newsletter already went out for "${post.slug}" (${send.id}, ${send.createdAt.toISOString()}, ${send.recipients} recipients)`

export type SendStatus = {
  /// The send that took the post out, if there was one.
  send: NewsletterSend | null
  canSend: boolean
  /// Why it cannot be sent, when it cannot.
  reason: string | null
}

/// Whether [post] can go to the newsletter, for the editor's button.
export async function sendStatus(post: Sendable): Promise<SendStatus> {
  const send = await findSend(post)
  const why = send ? alreadySent(post, send) : refusal(post)
  return { send, canSend: !why, reason: why }
}

export type SendOptions = {
  /// Render and count, but send and record nothing.
  dryRun?: boolean
  /// A test send to this one subscriber's address only. It is recorded
  /// under a TEST: key, as the Go site did, and does not block the real send.
  to?: string
}

export type SendResult = {
  /// Emails sent, or with dryRun, emails that would be.
  recipients: number
  failed: number
  /// The email as the first recipient gets it; null with no recipients.
  sample: Email | null
  dryRun: boolean
}

/// Sends the post [slug] to every subscribed subscriber, one at a time. A
/// failed email is logged and the rest go on; if every one fails, nothing is
/// recorded so the send can be tried again.
export async function sendPost(slug: string, options: SendOptions = {}): Promise<SendResult> {
  const dryRun = !!options.dryRun
  const post = await db.blogPost.findUnique({ where: { slug } })
  if (!post) throw new Error(`No post has the slug "${slug}"`)
  const refused = refusal(post)
  if (refused) throw new Error(refused)

  let key = sendKey(post.slug)
  let subscribers: NewsletterSubscriber[]
  if (options.to) {
    const subscriber = await findByEmail(options.to.trim())
    if (!subscriber) throw new Error(`No subscriber has the address ${options.to}`)
    if (subscriber.unsubscribed) throw new Error(`${subscriber.email} has unsubscribed`)
    subscribers = [subscriber]
    key = `TEST:${subscriber.email}:${Math.floor(Date.now() / 1000)}:${key}`
  } else {
    const send = await findSend(post)
    if (send) throw new Error(alreadySent(post, send))
    subscribers = await db.newsletterSubscriber.findMany({ where: { unsubscribed: false }, orderBy: { createdAt: 'asc' } })
  }

  const render = (subscriber: NewsletterSubscriber): Email => ({ to: subscriber.email, ...newPostEmail(post, subscriber) })
  const sample = subscribers.length ? render(subscribers[0]) : null
  if (dryRun) return { recipients: subscribers.length, failed: 0, sample, dryRun }

  // Claim the key before the first email, so two sends at once cannot both
  // go out: the second fails on the unique key.
  let claim: NewsletterSend
  try {
    claim = await db.newsletterSend.create({ data: { id: newId('snd_'), key, description: post.title, recipients: 0 } })
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    const send = await findSend(post)
    throw new Error(send ? alreadySent(post, send) : `The newsletter for "${post.slug}" is already being sent`)
  }

  const m = mailer()
  let sent = 0
  let failed = 0
  let firstFailure = ''
  for (const subscriber of subscribers) {
    try {
      await m.send(render(subscriber))
      sent++
    } catch (error) {
      failed++
      firstFailure ||= reason(error)
      console.error(`newsletter: "${post.slug}" to ${subscriber.id} failed: ${reason(error)}`)
    }
  }

  if (sent === 0 && failed > 0) {
    await db.newsletterSend.delete({ where: { id: claim.id } })
    throw new Error(`Every email for "${post.slug}" failed (${failed}), so nothing was recorded and it can be sent again. The first failure: ${firstFailure}`)
  }
  await db.newsletterSend.update({ where: { id: claim.id }, data: { recipients: sent } })
  console.log(`newsletter: sent "${post.slug}" to ${sent} of ${subscribers.length} subscribers, ${failed} failed`)
  return { recipients: sent, failed, sample, dryRun }
}
