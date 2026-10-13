import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { Site, SubscriptionForm, pageHead } from '#/components/site'
import { isAdmin } from '#/server/admin'
import { listSubscribers } from '#/server/newsletter'
import { isoformat } from '#/server/views'

// The newsletter page (templates/pages/page/newsletter.html): the form, and
// for the admin every subscriber.

const getSubscribers = createServerFn({ method: 'GET' }).handler(async () => {
  if (!(await isAdmin())) return null
  return (await listSubscribers()).map((s) => ({ id: s.id, created: isoformat(s.createdAt), email: s.email, unsubscribed: s.unsubscribed }))
})

export const Route = createFileRoute('/newsletter/')({
  loader: () => getSubscribers(),
  head: (ctx) => pageHead({ title: 'Email Newsletter', description: 'Subscribe to the newsletter to be the first to hear about new posts' }, ctx),
  component: Newsletter,
})

function Newsletter() {
  const subscribers = Route.useLoaderData()
  return (
    <Site>
      <div className="container content">
        <h1>Keep in Touch</h1>
        <label htmlFor="subscription-email">
          <p>If you'd like to receive blog post updates straight to your inbox, feel free to subscribe to my newsletter 🥳</p>
        </label>
        <SubscriptionForm />
        <p>
          <a href="/">&laquo; Home</a>
        </p>

        {subscribers && (
          <>
            <hr />
            <h2>
              Subscribers <code>{subscribers.length}</code>
            </h2>
            <table>
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Email</th>
                  <th style={{ width: '2em' }}></th>
                </tr>
              </thead>
              <tbody>
                {subscribers.map((s) => (
                  <tr key={s.id}>
                    <td>{s.created}</td>
                    <td>
                      <code style={{ wordBreak: 'break-all' }}>{s.email}</code>
                    </td>
                    <td>{s.unsubscribed ? '✘' : '✔'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </Site>
  )
}
