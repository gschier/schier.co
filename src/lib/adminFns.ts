import { createServerFn } from '@tanstack/react-start'
import { notFoundData } from '#/server/pages'
import { editorData, newsletterStatus, preview, publish, remove, savePost, sendNewsletter, setListed, unpublish, type SaveInput } from '#/server/editor'

// The admin pages' server functions, each a call into src/server/editor.ts,
// which checks a signed-in session and the input. In the browser these are
// fetches to the server; the module they call is never sent there.

/// The editor's post, or nothing for a new one; the site's 404 signed out
/// or for an id no post has.
export const getEditor = createServerFn({ method: 'GET' })
  .validator((id: string | null) => id)
  .handler(async ({ data }) => (await editorData(data)) ?? notFoundData())

export const savePostFn = createServerFn({ method: 'POST' })
  .validator((input: SaveInput) => input)
  .handler(({ data }) => savePost(data))

export const publishFn = createServerFn({ method: 'POST' })
  .validator((id: string) => id)
  .handler(({ data }) => publish(data))

export const unpublishFn = createServerFn({ method: 'POST' })
  .validator((id: string) => id)
  .handler(({ data }) => unpublish(data))

export const setListedFn = createServerFn({ method: 'POST' })
  .validator((input: { id: string; unlisted: boolean }) => input)
  .handler(({ data }) => setListed(data))

export const deleteFn = createServerFn({ method: 'POST' })
  .validator((id: string) => id)
  .handler(({ data }) => remove(data))

export const previewFn = createServerFn({ method: 'POST' })
  .validator((input: { markdown: string; date?: string }) => input)
  .handler(({ data }) => preview(data))

export const newsletterStatusFn = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(({ data }) => newsletterStatus(data))

export const sendNewsletterFn = createServerFn({ method: 'POST' })
  .validator((input: { id: string; to?: string; dryRun?: boolean }) => input)
  .handler(({ data }) => sendNewsletter(data))
