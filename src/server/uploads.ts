import { storage } from './storage'

// Images for posts, put in storage (the Railway bucket, or a directory on
// disk without one) where the Go site put them in the DigitalOcean Space
// (internal/upload.go): images/a/{unix seconds}{ext}, referenced from posts
// by the site path that serves them (/media/...).
// Two uploads in the same second share a key, as they did before, and the
// second replaces the first.

/// The extension of [name] as Go's path.Ext gives it (from the last dot of
/// the last segment), kept only when it is a plain one like `.png`.
function extension(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  const ext = dot >= 0 ? base.slice(dot) : ''
  return /^\.[A-Za-z0-9]{1,10}$/.test(ext) ? ext : ''
}

/// Put an image in storage and return the path a post uses for it,
/// `/media/images/a/{unix}{ext}`.
export async function uploadImage(bytes: Uint8Array, contentType: string, originalName: string): Promise<string> {
  const key = `images/a/${Math.floor(Date.now() / 1000)}${extension(originalName)}`
  await storage().put(key, bytes, bytes.byteLength, contentType || 'application/octet-stream')
  return `/media/${key}`
}
