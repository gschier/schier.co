import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { AuthForm, FormInput } from '#/components/authForm'
import { pageHead } from '#/components/site'
import { afterSignIn, formFields, login, registrationOpen, rememberForm, rememberedForm } from '#/server/auth'
import { redirect, sameOrigin, textError } from '#/server/pages'

// Signing in (Go's /login, templates/pages/auth/login.html): an email and
// password, checked by src/server/auth.ts. Signed in, the browser goes to
// ?to= if it names a path on this site, else to /admin. Refused, the form
// is drawn again with what was typed and why.

const getLogin = createServerFn({ method: 'GET' }).handler(async () => ({ form: rememberedForm(), registration: registrationOpen() }))

export const Route = createFileRoute('/login')({
  loader: () => getLogin(),
  head: (ctx) => {
    const head = pageHead({ title: 'Login' }, ctx)
    return { ...head, meta: [...head.meta, { name: 'robots', content: 'noindex' }] }
  },
  server: {
    handlers: {
      POST: async ({ request, next }) => {
        if (!sameOrigin(request)) return textError(403, 'Forbidden')
        const field = await formFields(request)
        const email = field('email')
        const outcome = await login(email, field('password'))
        if (outcome.ok) return redirect(afterSignIn(new URL(request.url).searchParams.get('to')), 303)
        rememberForm(request, { email, name: '', error: outcome.error })
        return next()
      },
    },
  },
  component: Login,
})

function Login() {
  const { form, registration } = Route.useLoaderData()
  return (
    <AuthForm
      title="Sign In"
      error={form.error}
      actions={
        <>
          {registration && <a href="/register">or signup</a>}
          <button className="btn">Login</button>
        </>
      }
    >
      <FormInput label="Email" type="email" name="email" placeholder="me@example.com" autoFocus autoComplete="username" value={form.email} />
      <FormInput label="Password" type="password" name="password" placeholder="•••••••••••••••••" autoComplete="current-password" />
    </AuthForm>
  )
}
