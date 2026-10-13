import { createFileRoute } from '@tanstack/react-router'
import { subscribe } from '#/server/newsletter'
import { redirect, sameOrigin, textError } from '#/server/pages'

// The subscription forms' target (Go's routeSubscribe): subscribes the
// address, or subscribes it again, and goes to the thanks page. A form with
// the hidden username filled in is a bot's, and goes there without
// subscribing anyone.
export const Route = createFileRoute('/forms/newsletter/subscribe')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!sameOrigin(request)) return textError(403, 'Forbidden')
        const form = await formOf(request)
        const email = (form.get('email') ?? '').toString()
        if (!email) return textError(400, 'Email address required')
        if ((form.get('username') ?? '').toString() !== '') {
          console.log(`newsletter: subscriber caught by the honeypot: ${email}`)
          return redirect('/newsletter/thanks', 303)
        }
        try {
          await subscribe(email, (form.get('name') ?? '').toString())
        } catch (error) {
          return textError(400, error instanceof Error ? error.message : 'Email address required')
        }
        return redirect('/newsletter/thanks', 303)
      },
    },
  },
})

async function formOf(request: Request): Promise<URLSearchParams | FormData> {
  const type = request.headers.get('content-type') ?? ''
  if (type.includes('multipart/form-data')) return request.formData()
  return new URLSearchParams(await request.text())
}
