import { createFileRoute } from '@tanstack/react-router'
import { Site, pageHead } from '#/components/site'

// Where subscribing lands (templates/pages/page/thanks.html).
export const Route = createFileRoute('/newsletter/thanks')({
  head: (ctx) => pageHead({ title: 'Thanks!', description: 'Thank you for signing up to the newsletter!' }, ctx),
  component: () => (
    <Site>
      <div className="container content">
        <h1>Subscribed!</h1>
        <p>You should receive a confirmation email shortly! 💌🙂</p>
        <p>
          <a href="/">&laquo; Home</a>
        </p>
      </div>
    </Site>
  ),
})
