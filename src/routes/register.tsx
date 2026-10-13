import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { AuthForm, FormInput } from '#/components/authForm'
import { NotFound, pageHead } from '#/components/site'
import { afterSignIn, formFields, register, registrationOpen, rememberForm, rememberedForm } from '#/server/auth'
import { notFoundData, redirect, sameOrigin, textError } from '#/server/pages'

// Making an account (Go's /register, templates/pages/auth/register.html),
// only while REGISTRATION=enable; otherwise the site's 404. A new account is
// signed in and goes where signing in goes.

const getRegister = createServerFn({ method: 'GET' }).handler(async () => (registrationOpen() ? { form: rememberedForm() } : notFoundData()))

export const Route = createFileRoute('/register')({
  loader: () => getRegister(),
  head: (ctx) => {
    const head = pageHead(ctx.loaderData && 'form' in ctx.loaderData ? { title: 'Register' } : {}, ctx)
    return { ...head, meta: [...head.meta, { name: 'robots', content: 'noindex' }] }
  },
  server: {
    handlers: {
      POST: async ({ request, next }) => {
        // Closed, the page drawn is the 404.
        if (!registrationOpen()) return next()
        if (!sameOrigin(request)) return textError(403, 'Forbidden')
        const field = await formFields(request)
        const [email, name] = [field('email'), field('name')]
        const outcome = await register(email, name, field('password'))
        if (outcome.ok) return redirect(afterSignIn(new URL(request.url).searchParams.get('to')), 303)
        rememberForm(request, { email, name, error: outcome.error })
        return next()
      },
    },
  },
  component: Register,
})

function Register() {
  const data = Route.useLoaderData()
  if ('notFound' in data) return <NotFound posts={data.posts} />
  const { form } = data
  return (
    <AuthForm
      title="Create an Account"
      error={form.error}
      actions={
        <>
          <a href="/login">or login</a>
          <button className="btn">Register</button>
        </>
      }
    >
      <FormInput label="Email" type="email" name="email" placeholder="me@example.com" autoFocus autoComplete="username" value={form.email} />
      <FormInput label="Name" name="name" placeholder="Tim Burton" autoComplete="name" value={form.name} />
      <FormInput label="Password" type="password" name="password" placeholder="•••••••••••••••••" autoComplete="new-password" />
    </AuthForm>
  )
}
