// The editor's copy of what is being written, kept in the browser's local
// storage after every change, so a closed tab, a crash or a lost connection
// loses nothing. A post's copy is under its id, a new post's under one key
// for all new posts. Saving clears it. On opening, a copy that differs from
// the server's and is newer than its last change is offered back, never put
// in silently.

const PREFIX = 'schierco:editor:'

export type Draft<F> = {
  fields: F
  /// When it was kept, in milliseconds.
  at: number
}

export const draftKey = (id: string | undefined) => `${PREFIX}${id ?? 'new'}`

export function readDraft<F>(key: string): Draft<F> | null {
  try {
    const text = window.localStorage.getItem(key)
    if (!text) return null
    const draft = JSON.parse(text) as Draft<F>
    return draft && typeof draft.at === 'number' && draft.fields ? draft : null
  } catch {
    return null
  }
}

export function writeDraft<F>(key: string, fields: F) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ fields, at: Date.now() } satisfies Draft<F>))
  } catch {
    // Storage full or refused (a private window): nothing kept.
  }
}

export function clearDraft(key: string) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // As above.
  }
}
