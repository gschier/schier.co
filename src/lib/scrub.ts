// What goes to Sentry with nothing in it that identifies anyone or lets
// them in (src/server/sentry.ts, scripts/migrate.mjs). Copied from
// Platform Pixels' web/src/lib/scrub.ts.
//
// Taken out of every event, whatever Sentry's defaults: the user (an
// address, an id), the request's cookies, body and every header but the
// browser's name and the type of the body, so the admin's cookie, the
// MCP's bearer token and what a request carried (the admin token to sign
// in, an email address for the newsletter) never leave, nor a stack
// frame's variables, the server's name, or a city Sentry would place a
// report in. Every string that can carry an address has the values of
// secret parameters (`?token=`, `&key=` and the like), names and
// passwords in addresses, bearer and basic credentials and email
// addresses replaced.

import type { Breadcrumb, ErrorEvent, Event, NodeOptions } from '@sentry/tanstackstart-react'

/// What Sentry's SDK may collect by itself, which by default is nearly
/// everything (filtered for what it knows to be secret): here, none of a
/// request's cookies or bodies, no response headers, of the request's only
/// the browser's name and the type of the body, no user, no variables of a
/// stack frame, nothing of a database query's data. scrubEvent takes the
/// same out again, so nothing rests on these.
export const collected: NodeOptions['dataCollection'] = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: { allow: ['user-agent', 'content-type'] }, response: false },
  httpBodies: [],
  stackFrameVariables: false,
  databaseQueryData: false,
  queues: false,
  genAI: { inputs: false, outputs: false },
  graphQL: { document: false, variables: false },
}

const userInfo = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/?#@]+@/gi
const secret = /(^|[?&#;\s])([^=&#?;\s]*(?:editor|token|key|secret|password|passwd|signature|auth|session|user|public_?id)[^=&#?;\s]*)=[^&#\s]*/gi
const bearer = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi
const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g

/// The request headers an event keeps; every other one is dropped.
const KEPT_HEADERS = new Set(['user-agent', 'content-type'])

export function scrubText(text: string): string {
  return text
    .replace(userInfo, '$1[Filtered]@')
    .replace(secret, '$1$2=[Filtered]')
    .replace(bearer, '$1 [Filtered]')
    .replace(email, '[email]')
}

/// Every string in [value], however deep, through [scrubText].
export function scrubValue<T>(value: T): T {
  if (typeof value === 'string') return scrubText(value) as T
  if (Array.isArray(value)) return value.map(scrubValue) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubValue(v)])) as T
  }
  return value
}

/// One parameter's value, scrubbed as it would be in an address.
const param = (key: string, value: string) => scrubText(`?${key}=${value}`).slice(key.length + 2)

/// A query string as Sentry keeps it: a string, an object or a list of pairs.
function scrubQuery(query: unknown): unknown {
  if (typeof query === 'string') return scrubText(`?${query}`).slice(1)
  if (Array.isArray(query)) return query.map(([k, v]) => [k, param(String(k), String(v))])
  if (query && typeof query === 'object') return Object.fromEntries(Object.entries(query).map(([k, v]) => [k, param(k, String(v))]))
  return query
}

export function scrubEvent<T extends Event | ErrorEvent>(event: T): T {
  delete event.user
  // The machine's own name, and where Sentry would place the address a
  // report came from (a city), though it keeps no address.
  delete event.server_name
  event.sdk = { ...event.sdk, settings: { ...event.sdk?.settings, infer_ip: 'never' } }
  const request = event.request
  if (request) {
    const headers = Object.fromEntries(Object.entries(request.headers ?? {}).filter(([k]) => KEPT_HEADERS.has(k.toLowerCase())))
    event.request = {
      url: request.url && scrubText(request.url),
      method: request.method,
      query_string: scrubQuery(request.query_string) as typeof request.query_string,
      headers,
    }
  }
  if (event.message) event.message = scrubText(event.message)
  if (event.logentry) event.logentry = scrubValue(event.logentry)
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = scrubText(exception.value)
    for (const frame of exception.stacktrace?.frames ?? []) delete frame.vars
  }
  if (event.transaction) event.transaction = scrubText(event.transaction)
  if (event.tags) event.tags = scrubValue(event.tags)
  if (event.extra) event.extra = scrubValue(event.extra)
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb)
  return event
}

export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb {
  if (crumb.message) crumb.message = scrubText(crumb.message)
  if (crumb.data) crumb.data = scrubValue(crumb.data)
  return crumb
}
