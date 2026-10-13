// Types for scripts/migrate-assets.mjs, for the tests that import it.
import type pg from 'pg'
import type { Store } from './s3.d.mts'

type Log = (line: string) => void

export const PREFIXES: string[]
export const SPACE_URLS: string[]
export function copyAssets(
  source: Store,
  dest: Store,
  options?: { dryRun?: boolean; log?: Log },
): Promise<{ seen: string[]; copied: string[]; skipped: string[]; failed: { key: string; error: string }[] }>
export function rewritePosts(client: pg.Client, options?: { dryRun?: boolean; log?: Log }): Promise<string[]>
export function missingReferences(client: pg.Client, keys: string[]): Promise<{ slug: string; key: string }[]>
