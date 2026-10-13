// The sign-in and registration forms' pieces, as the Go site drew them
// (templates/pages/auth/*.html and templates/partials/form-input.html), with
// its class names, so the stylesheet applies as it did.

import type { ReactNode } from 'react'
import { Site } from '#/components/site'

/// One labelled input: partials/form-input.html.
export function FormInput(props: { label: string; name: string; type?: string; placeholder?: string; autoFocus?: boolean; value?: string; autoComplete?: string }) {
  const id = `i-${props.name}`
  return (
    <div className="form-row">
      <label className="form-label" htmlFor={id}>
        {props.label}
      </label>
      <input
        className="form-input"
        type={props.type ?? 'text'}
        name={props.name}
        placeholder={props.placeholder}
        id={id}
        autoFocus={props.autoFocus}
        autoComplete={props.autoComplete}
        defaultValue={props.value}
      />
    </div>
  )
}

/// A form page: its heading, the refusal if there was one, its fields and
/// its actions. Posts to the page's own address, query and all.
export function AuthForm({ title, error, children, actions }: { title: string; error: string; children: ReactNode; actions: ReactNode }) {
  return (
    <Site>
      <div className="container form-wrapper">
        <h1>{title}</h1>
        <form method="post">
          {error && <p className="notice notice--danger">{error}</p>}
          {children}
          <div className="form-actions">{actions}</div>
        </form>
      </div>
    </Site>
  )
}
