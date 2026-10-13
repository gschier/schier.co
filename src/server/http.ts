import { createHash, timingSafeEqual } from 'node:crypto'
import type { ZodType } from 'zod'

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', ...init.headers },
  })
}

export function error(status: number, message: string): Response {
  return json({ error: message }, { status })
}

/// Parse and validate a JSON body. Returns a Response on failure.
export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T | Response> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return error(400, 'Body must be JSON')
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    return json({ error: 'Invalid body', issues: result.error.issues }, { status: 422 })
  }
  return result.data
}

/// Whether [given] is [secret], compared in a time that says nothing of how
/// much of it matched: each is hashed first, so the two compared are always
/// the same length, and every byte of them is compared.
export function sameSecret(given: string, secret: string): boolean {
  return timingSafeEqual(digest(given), digest(secret))
}

const digest = (text: string) => createHash('sha256').update(text).digest()
