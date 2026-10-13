// Moves the site's images off DigitalOcean Spaces (BRIEF.md, Images):
//
//   node scripts/migrate-assets.mjs [--dry-run]
//
// 1. Lists the Space (DO_SPACES_KEY, DO_SPACES_SECRET, DO_SPACES_DOMAIN,
//    DO_SPACES_SPACE) under images/, avatar/ and other/, and copies each
//    object to the Railway bucket (the AWS_* variables) with its content
//    type, skipping those already there with the same size.
// 2. Rewrites blog_posts.content and blog_posts.image (DATABASE_URL) from
//    the Space's two addresses to /media/, which the site serves from the
//    bucket. Skipped when any copy failed, so no post points at an image
//    that is not there yet; run it again once the failures are fixed.
//
// Idempotent: a second run copies and rewrites nothing. With --dry-run it
// lists what it would copy and which posts it would rewrite, and changes
// nothing. A failed object does not stop the run; failures are listed at
// the end and the exit code is 1. The .env file is read if there is one.

import { config } from 'dotenv'
import { pathToFileURL } from 'node:url'
import pg from 'pg'
import { bucket } from './s3.mjs'

export const PREFIXES = ['images/', 'avatar/', 'other/']
export const SPACE_URLS = ['https://schierco.nyc3.cdn.digitaloceanspaces.com/', 'https://schierco.nyc3.digitaloceanspaces.com/']

/// Copy every object under PREFIXES from [source] to [dest], skipping those
/// [dest] already has at the same size. Reports through [log].
export async function copyAssets(source, dest, { dryRun = false, log = console.log } = {}) {
  const result = { seen: [], copied: [], skipped: [], failed: [] }
  for (const prefix of PREFIXES) {
    const objects = await source.list(prefix)
    log(`${prefix}: ${objects.length} objects in the Space`)
    for (const { key, size } of objects) {
      result.seen.push(key)
      try {
        const there = await dest.head(key)
        if (there && there.size === size) {
          result.skipped.push(key)
          continue
        }
        if (dryRun) {
          log(`  would copy ${key} (${size} bytes${there ? `, bucket has ${there.size}` : ''})`)
          result.copied.push(key)
          continue
        }
        const { body, contentType } = await source.get(key)
        await dest.put(key, body, contentType)
        log(`  copied ${key} (${body.length} bytes, ${contentType})`)
        result.copied.push(key)
      } catch (error) {
        log(`  failed ${key}: ${error.message}`)
        result.failed.push({ key, error: error.message })
      }
    }
  }
  return result
}

/// Rewrite the Space's addresses in posts to /media/, only in the rows that
/// have them. Returns the slugs of the posts changed (or, with [dryRun],
/// that would be).
export async function rewritePosts(client, { dryRun = false, log = console.log } = {}) {
  const [a, b] = SPACE_URLS
  const has = `strpos(content, $1) > 0 OR strpos(content, $2) > 0 OR strpos(image, $1) > 0 OR strpos(image, $2) > 0`
  let rows
  if (dryRun) {
    rows = (await client.query(`SELECT slug FROM blog_posts WHERE ${has} ORDER BY slug`, [a, b])).rows
  } else {
    rows = (
      await client.query(
        `UPDATE blog_posts
            SET content = replace(replace(content, $1, '/media/'), $2, '/media/'),
                image = replace(replace(image, $1, '/media/'), $2, '/media/')
          WHERE ${has}
      RETURNING slug`,
        [a, b],
      )
    ).rows
  }
  const slugs = rows.map((r) => r.slug).sort()
  for (const slug of slugs) log(`  ${dryRun ? 'would rewrite' : 'rewrote'} ${slug}`)
  return slugs
}

/// Keys the posts point at, through the Space or /media/, that are not in
/// [keys]: images that would show broken after the move.
export async function missingReferences(client, keys) {
  const have = new Set(keys)
  const { rows } = await client.query(`SELECT slug, content, image FROM blog_posts`)
  const pattern = /(?:https:\/\/schierco\.nyc3(?:\.cdn)?\.digitaloceanspaces\.com\/|\/media\/)((?:images|avatar|other)\/[^\s)"'<>\]]+)/g
  const missing = []
  for (const { slug, content, image } of rows) {
    for (const [, raw] of `${content}\n${image}`.matchAll(pattern)) {
      let key = raw
      try {
        key = decodeURIComponent(raw)
      } catch {}
      if (!have.has(key) && !have.has(raw)) missing.push({ slug, key })
    }
  }
  return missing
}

function env(names) {
  const missing = names.filter((n) => !process.env[n])
  if (missing.length) throw new Error(`Set ${missing.join(', ')}`)
  return Object.fromEntries(names.map((n) => [n, process.env[n]]))
}

async function main() {
  config({ quiet: true })
  const dryRun = process.argv.includes('--dry-run')
  const e = env([
    'DO_SPACES_KEY',
    'DO_SPACES_SECRET',
    'DO_SPACES_DOMAIN',
    'DO_SPACES_SPACE',
    'AWS_ENDPOINT_URL',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_S3_BUCKET_NAME',
    'DATABASE_URL',
  ])
  const source = bucket({
    endpoint: e.DO_SPACES_DOMAIN,
    key: e.DO_SPACES_KEY,
    secret: e.DO_SPACES_SECRET,
    bucket: e.DO_SPACES_SPACE,
    region: process.env.DO_SPACES_REGION || 'us-east-1',
  })
  const dest = bucket({
    endpoint: e.AWS_ENDPOINT_URL,
    key: e.AWS_ACCESS_KEY_ID,
    secret: e.AWS_SECRET_ACCESS_KEY,
    bucket: e.AWS_S3_BUCKET_NAME,
    region: process.env.AWS_DEFAULT_REGION || 'auto',
  })
  const db = new pg.Client({ connectionString: e.DATABASE_URL })

  console.log(`${dryRun ? 'Dry run: nothing is changed. ' : ''}Copying from ${source.host} to ${dest.host}`)
  const copy = await copyAssets(source, dest, { dryRun })

  await db.connect()
  let posts = null
  try {
    if (copy.failed.length && !dryRun) {
      console.log('\nPosts not rewritten: some objects failed to copy. Fix them and run again.')
    } else {
      console.log(`\n${dryRun ? 'Posts that would be rewritten' : 'Rewriting posts'}:`)
      posts = await rewritePosts(db, { dryRun })
    }
    const missing = await missingReferences(db, copy.seen)
    if (missing.length) {
      console.log(`\nPosts point at ${missing.length} images that are not in the Space:`)
      for (const { slug, key } of missing) console.log(`  ${slug}: ${key}`)
    }
  } finally {
    await db.end()
  }

  const would = dryRun ? 'would be ' : ''
  console.log(`\nObjects seen: ${copy.seen.length}`)
  console.log(`Objects ${would}copied: ${copy.copied.length}`)
  console.log(`Objects skipped (already in the bucket): ${copy.skipped.length}`)
  console.log(`Objects failed: ${copy.failed.length}`)
  console.log(`Posts ${would}rewritten: ${posts === null ? 'none (skipped)' : posts.length}`)
  if (copy.failed.length) {
    console.log('\nFailed:')
    for (const { key, error } of copy.failed) console.log(`  ${key}: ${error}`)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`migrate-assets: ${error.message}`)
    process.exit(1)
  })
}
