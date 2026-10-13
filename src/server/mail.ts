// Sending email through Resend's HTTP API
// (https://resend.com/docs/api-reference/emails/send-email), modelled on
// Kabook's crates/server/src/mail.rs. No SDK: one POST with fetch.
//
// From MAIL_FROM, else FROM; replies to REPLY_TO, else Greg's address. With
// no RESEND_API_KEY nothing is sent: the email goes to the console instead,
// so local runs and tests need no key. Tests put a RecordingMailer in place
// with setMailer.

/// Who every email is from, unless MAIL_FROM says otherwise. The domain
/// (mail.schier.co) must be verified in Resend, or Resend refuses to send.
export const FROM = 'Gregory Schier <greg@mail.schier.co>'
/// Where replies go, unless REPLY_TO says otherwise.
export const REPLY_TO = 'greg@schier.co'
/// Resend's endpoint for sending one email.
export const RESEND_URL = 'https://api.resend.com/emails'
/// How long one send may take before it is given up as failed.
const TIMEOUT_MS = 15_000

/// One email, as plain text and as HTML.
export type Email = { to: string; subject: string; text: string; html: string }

/// Whatever sends email. A failure throws an Error whose message is the
/// reason, for the log.
export interface Mailer {
  send(email: Email): Promise<void>
}

type ResendOptions = {
  key: string
  from?: string
  replyTo?: string
  url?: string
  timeoutMs?: number
  /// For tests: a fetch that is not the network.
  fetch?: typeof fetch
}

/// Sends through Resend.
export class ResendMailer implements Mailer {
  readonly from: string
  readonly replyTo: string
  private readonly key: string
  private readonly url: string
  private readonly timeoutMs: number
  private readonly fetch: typeof fetch

  constructor(options: ResendOptions) {
    this.key = options.key
    this.from = options.from || FROM
    this.replyTo = options.replyTo || REPLY_TO
    this.url = options.url || RESEND_URL
    this.timeoutMs = options.timeoutMs ?? TIMEOUT_MS
    this.fetch = options.fetch ?? fetch
  }

  async send(email: Email): Promise<void> {
    const body = { from: this.from, reply_to: this.replyTo, to: [email.to], subject: email.subject, text: email.text, html: email.html }
    let response: Response
    try {
      response = await this.fetch(this.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      throw new Error(`Resend: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (response.ok) return
    // Resend's error is JSON with a `message`; it names no recipient.
    const said = await response.text().catch(() => '')
    throw new Error(`Resend answered ${response.status}: ${said.slice(0, 500)}`)
  }
}

/// Sends nothing: writes the email to the console instead.
export class LogMailer implements Mailer {
  async send(email: Email): Promise<void> {
    console.log(`email not sent (no RESEND_API_KEY), to ${email.to}: ${email.subject}\n${email.text}`)
  }
}

/// Sends nothing: keeps every email, for tests to look at. With [fail], a
/// send to an address it returns true for throws instead.
export class RecordingMailer implements Mailer {
  readonly sent: Email[] = []
  fail: (email: Email) => boolean = () => false

  async send(email: Email): Promise<void> {
    if (this.fail(email)) throw new Error(`recording mailer refused ${email.to}`)
    this.sent.push(email)
  }
}

const env = (name: string) => process.env[name]?.trim() || undefined

/// Resend with RESEND_API_KEY, else the console.
export function mailerFromEnv(): Mailer {
  const key = env('RESEND_API_KEY')
  if (!key) return new LogMailer()
  return new ResendMailer({ key, from: env('MAIL_FROM'), replyTo: env('REPLY_TO') })
}

let current: Mailer | null = null

/// The mailer in use: the one set with setMailer, else the environment's.
export function mailer(): Mailer {
  current ??= mailerFromEnv()
  return current
}

/// Puts [m] in place of the environment's mailer (for tests); null goes
/// back to the environment's.
export function setMailer(m: Mailer | null) {
  current = m
}

/// Text made safe to put in HTML.
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
