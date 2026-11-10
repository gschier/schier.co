import { pageHead } from '#/components/site'

// The editor's <head>, in a module of its own: a route's head is part of
// the code every page loads, and the editor (src/components/editor.tsx) and
// what it carries (its widget card, the widget loader) should load only
// with the editor's page.

type HeadContext = Parameters<typeof pageHead>[1]

/// The editor's <title> and meta, kept out of search engines.
export function editorHead(title: string, ctx: HeadContext) {
  const head = pageHead({ title: title ? `Edit ${title}` : 'Edit' }, ctx)
  return { ...head, meta: [...head.meta, { name: 'robots', content: 'noindex' }] }
}
