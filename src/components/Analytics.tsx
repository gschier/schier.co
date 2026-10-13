import { useEffect } from 'react'
import type { OpenPanel } from '@openpanel/web'

// Browser-side OpenPanel: page views, outgoing links, elements with a
// data-track attribute, and track() below. Silent no-op until
// VITE_OPENPANEL_CLIENT_ID is set, so local dev sends nothing, and for
// Greg's own visits (see the root route).

let op: OpenPanel | null = null
let ready: Promise<void> | null = null
let disabled = false

function init() {
  const clientId = import.meta.env.VITE_OPENPANEL_CLIENT_ID as string | undefined
  if (!clientId || disabled || ready) return ready
  ready = import('@openpanel/web').then(({ OpenPanel }) => {
    op = new OpenPanel({
      clientId,
      apiUrl: import.meta.env.VITE_OPENPANEL_API_URL as string | undefined,
      trackScreenViews: true,
      trackOutgoingLinks: true,
      trackAttributes: true,
    })
  })
  return ready
}

/// Fire a site event from the browser. Safe to call before init or unset.
export function track(name: string, properties: Record<string, unknown> = {}) {
  void init()?.then(() => op?.track(name, properties))
}

/// With [off] nothing is sent from this page load at all.
export function Analytics({ off }: { off: boolean }) {
  useEffect(() => {
    disabled = off
    void init()
  }, [off])
  return null
}
