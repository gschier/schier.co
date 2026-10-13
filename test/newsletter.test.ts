// The newsletter and its mailer:
//   node --test test/newsletter.test.ts
//
// Over a scratch database it makes and drops, with a RecordingMailer in
// place of Resend: subscribing, unsubscribing and sending a post
// (src/server/newsletter.ts). The Resend mailer (src/server/mail.ts) is
// checked against a fake fetch; nothing here reaches the network.

import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { scratch, site } from './help.ts'

type Mail = typeof import('../src/server/mail.ts')
type Newsletter = typeof import('../src/server/newsletter.ts')
type Emails = typeof import('../src/server/emails.ts')
type Db = typeof import('../src/server/db.ts')

let s: Awaited<ReturnType<typeof scratch>>
let app: Awaited<ReturnType<typeof site>>
let mail: Mail
let newsletter: Newsletter
let emails: Emails
let db: Db['db']
let newId: Db['newId']
let recorder: InstanceType<Mail['RecordingMailer']>

const BASE = 'https://schier.test'

before(async () => {
  delete process.env.RESEND_API_KEY
  process.env.BASE_URL = BASE + '/'
  s = await scratch('newsletter')
  app = await site(s.url)
  mail = await app.load<Mail>('/src/server/mail.ts')
  newsletter = await app.load<Newsletter>('/src/server/newsletter.ts')
  emails = await app.load<Emails>('/src/server/emails.ts')
  ;({ db, newId } = await app.load<Db>('/src/server/db.ts'))
})

beforeEach(async () => {
  recorder = new mail.RecordingMailer()
  mail.setMailer(recorder)
  await s.rows('DELETE FROM newsletter_sends')
  await s.rows('DELETE FROM newsletter_subscribers')
  await s.rows('DELETE FROM blog_posts')
})

after(async () => {
  mail?.setMailer(null)
  await app?.close()
  await s?.drop()
})

const HOUR = 60 * 60 * 1000

async function post(slug: string, fields: { published?: boolean; date?: Date; summary?: string; content?: string } = {}) {
  return db.blogPost.create({
    data: {
      id: newId('pst_'),
      slug,
      title: `The post ${slug}`,
      content: fields.content ?? `# Heading\n\nSome **bold** words and a [link](https://example.com) in ${slug}.`,
      summary: fields.summary ?? '',
      image: '',
      published: fields.published ?? true,
      date: fields.date ?? new Date(Date.now() - HOUR),
    },
  })
}

async function subscribers(...emails: string[]) {
  for (const email of emails) await newsletter.subscribe(email)
  recorder.sent.length = 0
}

test('subscribing sends the welcome once, and subscribing again changes nothing', async () => {
  const first = await newsletter.subscribe(' Ann@Example.com ', 'Ann')
  assert.equal(first.created, true)
  assert.equal(first.welcomed, true)
  assert.match(first.subscriber.id, /^sub_[a-z0-9]{12}$/)
  assert.equal(first.subscriber.email, 'Ann@Example.com')
  assert.equal(first.subscriber.name, 'Ann')

  assert.equal(recorder.sent.length, 1)
  const [welcome] = recorder.sent
  assert.equal(welcome.to, 'Ann@Example.com')
  assert.equal(welcome.subject, 'Thanks for subscribing')
  const unsubscribe = `${BASE}/newsletter/unsubscribe/${first.subscriber.id}`
  assert.ok(welcome.text.includes(unsubscribe))
  assert.ok(welcome.html.includes(unsubscribe))
  assert.ok(welcome.text.startsWith('Hi Ann,'))

  const again = await newsletter.subscribe('ann@example.com', 'Someone else')
  assert.equal(again.created, false)
  assert.equal(again.resubscribed, false)
  assert.equal(again.welcomed, false)
  assert.equal(again.subscriber.id, first.subscriber.id)
  assert.equal(recorder.sent.length, 1)
  assert.deepEqual(await s.rows(`SELECT email, name, unsubscribed FROM newsletter_subscribers`), [
    { email: 'Ann@Example.com', name: 'Ann', unsubscribed: false },
  ])

  await assert.rejects(newsletter.subscribe('  '), /email address is required/)
})

test('a failed welcome is logged and the subscription stands', async () => {
  recorder.fail = () => true
  const result = await newsletter.subscribe('bob@example.com')
  assert.equal(result.created, true)
  assert.equal(result.welcomed, false)
  assert.equal((await s.rows(`SELECT 1 FROM newsletter_subscribers`)).length, 1)
})

test('unsubscribing flips the flag, and subscribing again flips it back without a welcome', async () => {
  const { subscriber } = await newsletter.subscribe('cat@example.com')
  recorder.sent.length = 0

  const gone = await newsletter.unsubscribe(subscriber.id)
  assert.equal(gone?.unsubscribed, true)
  assert.equal(gone?.email, 'cat@example.com')
  assert.deepEqual(await s.rows(`SELECT unsubscribed FROM newsletter_subscribers WHERE id = $1`, [subscriber.id]), [{ unsubscribed: true }])
  assert.equal((await newsletter.unsubscribe(subscriber.id))?.unsubscribed, true)
  assert.equal(await newsletter.unsubscribe('sub_nobody'), null)

  const back = await newsletter.subscribe('cat@example.com')
  assert.equal(back.resubscribed, true)
  assert.equal(back.subscriber.unsubscribed, false)
  assert.equal(recorder.sent.length, 0)
})

test('sending a post goes to subscribed subscribers only, is recorded, and is refused a second time', async () => {
  await post('fresh', { summary: 'What the post is about.' })
  await subscribers('one@example.com', 'two@example.com', 'gone@example.com')
  const gone = await db.newsletterSubscriber.findUniqueOrThrow({ where: { email: 'gone@example.com' } })
  await newsletter.unsubscribe(gone.id)

  assert.deepEqual(await newsletter.sendStatus(await db.blogPost.findUniqueOrThrow({ where: { slug: 'fresh' } })), { send: null, canSend: true, reason: null })

  const result = await newsletter.sendPost('fresh')
  assert.equal(result.recipients, 2)
  assert.equal(result.failed, 0)
  assert.equal(result.dryRun, false)
  assert.deepEqual(recorder.sent.map((e) => e.to).sort(), ['one@example.com', 'two@example.com'])

  const one = await db.newsletterSubscriber.findUniqueOrThrow({ where: { email: 'one@example.com' } })
  const email = recorder.sent.find((e) => e.to === 'one@example.com')!
  assert.equal(email.subject, 'The post fresh')
  for (const body of [email.text, email.html]) {
    assert.ok(body.includes(`${BASE}/blog/fresh`))
    assert.ok(body.includes('What the post is about.'))
    assert.ok(body.includes(`${BASE}/newsletter/unsubscribe/${one.id}`))
  }
  assert.deepEqual(result.sample?.to, 'one@example.com')

  assert.deepEqual(await s.rows(`SELECT key, description, recipients FROM newsletter_sends`), [
    { key: 'post:fresh', description: 'The post fresh', recipients: 2 },
  ])

  await assert.rejects(newsletter.sendPost('fresh'), /already went out for "fresh"/)
  await assert.rejects(newsletter.sendPost('fresh', { dryRun: true }), /already went out/)
  assert.equal(recorder.sent.length, 2)
  const status = await newsletter.sendStatus(await db.blogPost.findUniqueOrThrow({ where: { slug: 'fresh' } }))
  assert.equal(status.canSend, false)
  assert.equal(status.send?.key, 'post:fresh')
})

test('a dry run renders the first email and counts, and sends and records nothing', async () => {
  await post('fresh', { content: '## Intro\n\n```js\nconst code = 1\n```\n\nThe **_first_** words of the [post](/x) --- here. ![img](/a.png) <b>More</b>.' })
  await subscribers('one@example.com', 'two@example.com')

  const result = await newsletter.sendPost('fresh', { dryRun: true })
  assert.equal(result.dryRun, true)
  assert.equal(result.recipients, 2)
  assert.equal(result.failed, 0)
  assert.equal(result.sample?.to, 'one@example.com')
  assert.ok(result.sample?.text.includes('Intro The first words of the post — here. More.'), result.sample?.text)
  assert.equal(recorder.sent.length, 0)
  assert.deepEqual(await s.rows(`SELECT 1 FROM newsletter_sends`), [])

  // Nothing was claimed, so the real send still goes.
  assert.equal((await newsletter.sendPost('fresh')).recipients, 2)
})

test('a post is refused when missing, unpublished, too old, or sent by the Go site', async () => {
  await subscribers('one@example.com')
  await post('draft', { published: false })
  await post('old', { date: new Date(Date.now() - 25 * HOUR) })
  const legacy = await post('legacy')
  await db.newsletterSend.create({ data: { id: newId('snd_'), key: legacy.id, description: 'Blog Post: legacy', recipients: 100 } })

  await assert.rejects(newsletter.sendPost('nope'), /No post has the slug "nope"/)
  await assert.rejects(newsletter.sendPost('draft'), /"draft" is not published/)
  await assert.rejects(newsletter.sendPost('draft', { dryRun: true }), /not published/)
  await assert.rejects(newsletter.sendPost('old'), /dated more than a day ago/)
  await assert.rejects(newsletter.sendPost('legacy'), /already went out for "legacy"/)
  assert.equal(recorder.sent.length, 0)
  assert.equal((await s.rows(`SELECT 1 FROM newsletter_sends`)).length, 1)
})

test('a failed email is counted and the rest still go; if all fail nothing is recorded', async () => {
  await post('fresh')
  await subscribers('one@example.com', 'bad@example.com', 'three@example.com')

  recorder.fail = () => true
  await assert.rejects(newsletter.sendPost('fresh'), /Every email for "fresh" failed \(3\).*recording mailer refused/)
  assert.deepEqual(await s.rows(`SELECT 1 FROM newsletter_sends`), [])

  recorder.fail = (e) => e.to === 'bad@example.com'
  const result = await newsletter.sendPost('fresh')
  assert.equal(result.recipients, 2)
  assert.equal(result.failed, 1)
  assert.deepEqual(await s.rows(`SELECT key, recipients FROM newsletter_sends`), [{ key: 'post:fresh', recipients: 2 }])
})

test('a test send goes to one subscriber and does not block the real send', async () => {
  await post('fresh')
  await subscribers('greg@example.com', 'two@example.com')

  const result = await newsletter.sendPost('fresh', { to: 'greg@example.com' })
  assert.equal(result.recipients, 1)
  assert.deepEqual(recorder.sent.map((e) => e.to), ['greg@example.com'])
  const [row] = await s.rows<{ key: string }>(`SELECT key FROM newsletter_sends`)
  assert.match(row.key, /^TEST:greg@example\.com:\d+:post:fresh$/)
  await assert.rejects(newsletter.sendPost('fresh', { to: 'stranger@example.com' }), /No subscriber has the address/)

  assert.equal((await newsletter.sendPost('fresh')).recipients, 2)
})

test('a summary falls back to the first fifty words of the content', () => {
  const words = Array.from({ length: 80 }, (_, i) => `w${i}`).join(' ')
  const summary = emails.postSummary({ summary: '', content: `# Title\n\n${words}` })
  assert.equal(summary, 'Title ' + words.split(' ').slice(0, 49).join(' ') + '…')
  assert.equal(emails.postSummary({ summary: '  Given.  ', content: words }), 'Given.')
  assert.equal(emails.readMinutes(words), 1)
})

test('the Resend mailer posts the email as JSON and throws on a refusal', async () => {
  const calls: { url: string; init: RequestInit }[] = []
  let answer = new Response('{"id":"x"}', { status: 200 })
  const fake = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init! })
    return answer
  }) as typeof fetch

  const resend = new mail.ResendMailer({ key: 're_test', fetch: fake })
  const email = { to: 'one@example.com', subject: 'Hello', text: 'Hi there', html: '<p>Hi there</p>' }
  await resend.send(email)

  assert.equal(calls.length, 1)
  const [{ url, init }] = calls
  assert.equal(url, 'https://api.resend.com/emails')
  assert.equal(init.method, 'POST')
  const headers = init.headers as Record<string, string>
  assert.equal(headers.Authorization, 'Bearer re_test')
  assert.equal(headers['Content-Type'], 'application/json')
  assert.ok(init.signal instanceof AbortSignal)
  assert.deepEqual(JSON.parse(init.body as string), {
    from: 'Gregory Schier <greg@mail.schier.co>',
    reply_to: 'greg@schier.co',
    to: ['one@example.com'],
    subject: 'Hello',
    text: 'Hi there',
    html: '<p>Hi there</p>',
  })

  answer = new Response('{"statusCode":422,"message":"Invalid `from` field."}', { status: 422 })
  await assert.rejects(resend.send(email), /Resend answered 422: .*Invalid `from` field/)

  const broken = new mail.ResendMailer({ key: 're_test', fetch: (async () => { throw new Error('connection refused') }) as typeof fetch })
  await assert.rejects(broken.send(email), /Resend: connection refused/)

  const custom = new mail.ResendMailer({ key: 'k', from: 'Someone <a@b.c>', replyTo: 'r@b.c', fetch: fake })
  calls.length = 0
  answer = new Response('{}', { status: 200 })
  await custom.send(email)
  const body = JSON.parse(calls[0].init.body as string)
  assert.equal(body.from, 'Someone <a@b.c>')
  assert.equal(body.reply_to, 'r@b.c')
})

test('the environment picks the mailer: Resend with a key, else the console', () => {
  const saved = { ...process.env }
  try {
    delete process.env.RESEND_API_KEY
    assert.ok(mail.mailerFromEnv() instanceof mail.LogMailer)
    process.env.RESEND_API_KEY = ' re_key '
    process.env.MAIL_FROM = 'Greg <g@mail.example.com>'
    process.env.REPLY_TO = ''
    const m = mail.mailerFromEnv()
    assert.ok(m instanceof mail.ResendMailer)
    assert.equal((m as InstanceType<Mail['ResendMailer']>).from, 'Greg <g@mail.example.com>')
    assert.equal((m as InstanceType<Mail['ResendMailer']>).replyTo, 'greg@schier.co')
  } finally {
    for (const name of ['RESEND_API_KEY', 'MAIL_FROM', 'REPLY_TO']) {
      if (saved[name] === undefined) delete process.env[name]
      else process.env[name] = saved[name]
    }
  }
})
