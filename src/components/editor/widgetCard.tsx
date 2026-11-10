// The editor's widgets (BRIEF.md, Widgets): the card drawn in place of a
// ```widget fence in the body, and the picker that inserts one.
//
// The card is a React portal into the element CodeMirror keeps for the
// fence (codemirror.ts, "Widgets"). Closed, it says the widget's name, its
// pin and its settings in a line; open, it is a form made from the pinned
// version's props schema, a version control, and the fence's text. The
// fence stays the document: the card reads its text, and every change in the
// form is a transaction on it, so undo (Cmd-Z, here too) takes it back.
//
// The picker lists the published widgets (and, on the dev server, the local
// folders as {name}@dev) and inserts a fence pinned to the latest version
// with every default. It opens from Insert widget and from a slash alone on
// a line; on one pane it is a sheet.

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { EditorView } from '@codemirror/view'
import { Ico } from '#/components/editor/icons'
import { defaults, fenceText, formatValue, latest, parsePin, propsSummary, readProps, readValue, setProp, widgetAt, type Catalog, type Pin } from '#/lib/widgets'
import type { PropSpec, PropValue } from '#/lib/widgetContract'

type Body = typeof import('#/components/editor/codemirror')

/// Why a pin has no schema to read, in words; null when it has one.
function pinProblem(info: string, pin: Pin | null, widgets: Catalog, dev: boolean): string | null {
  if (!pin) return info ? `"widget ${info}" pins no widget: write it as widget {name}@{version}` : 'This fence names no widget: write widget {name}@{version}'
  const entry = widgets.find((w) => w.name === pin.name)
  if (!entry) return `No widget is named "${pin.name}"`
  if (pin.version === 'dev') {
    if (!dev) return `${pin.name}@dev is a local build, which only the dev server runs`
    if (!entry.dev) return `${pin.name} has no folder under widgets/`
    return null
  }
  if (!widgetAt(entry, pin.version)) return `${pin.name} has no published version ${pin.version}`
  return null
}

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

// ---------------------------------------------------------------------------
// The card

export type CardProps = {
  dom: HTMLElement
  info: string
  body: string
  view: EditorView
  cm: Body
  widgets: Catalog
  dev: boolean
}

export function WidgetCard({ dom, info, body, view, cm, widgets, dev }: CardProps) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const pin = parsePin(info)
  const entry = pin ? widgets.find((w) => w.name === pin.name) : undefined
  const widget = pin ? widgetAt(entry, pin.version) : null
  const problem = pinProblem(info, pin, widgets, dev)
  const read = widget ? readProps(body, widget.props) : null
  const notBuilt = pin?.version === 'dev' && entry?.dev && !entry.dev.built

  const fence = () => cm.fenceOf(view, dom)
  const change = (key: string, value: PropValue) => {
    const f = fence()
    if (f) cm.setFenceBody(view, f, setProp(f.body, key, value))
  }
  const repin = (version: string) => {
    const f = fence()
    if (f && pin) cm.setFencePin(view, f, `${pin.name}@${version}`)
  }
  const source = () => {
    const f = fence()
    if (f) cm.showSource(view, f)
  }

  // Undo and redo are the body's, inside the card too.
  const onKeyDown = (e: KeyboardEvent) => {
    const mod = isMac() ? e.metaKey : e.ctrlKey
    const key = e.key.toLowerCase()
    if (mod && !e.altKey && (key === 'z' || key === 'y')) {
      e.preventDefault()
      e.stopPropagation()
      if (key === 'y' || e.shiftKey) cm.redoBody(view)
      else cm.undoBody(view)
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation()
      setOpen(false)
    }
  }

  const versions = [
    ...(entry?.versions ?? []).map((v) => ({ value: String(v.version), label: `${v.version}, ${new Date(v.date).toLocaleDateString(undefined, { dateStyle: 'medium' })}` })),
    ...(dev && entry?.dev ? [{ value: 'dev', label: 'dev, the local build' }] : []),
  ]
  if (pin && !versions.some((v) => v.value === String(pin.version))) versions.push({ value: String(pin.version), label: `${pin.version}, not there` })

  const text = (() => {
    const f = fence()
    return f ? view.state.sliceDoc(f.from, f.to) : `\`\`\`widget ${info}\n${body}\n\`\`\``
  })()

  return (
    <div className={`wcard${open ? ' is-open' : ''}`} onKeyDown={onKeyDown} data-widget-card={pin ? `${pin.name}@${pin.version}` : ''}>
      <div className="wcard__head">
        <span className="wcard__icon" aria-hidden="true">
          <Ico name="widget" />
        </span>
        <div className="wcard__text">
          <div className="wcard__kind">
            Widget <span className="mono">{info || 'no pin'}</span>
          </div>
          <div className="wcard__name">{widget?.name ?? entry?.title ?? pin?.name ?? 'Widget'}</div>
          {widget?.description && <div className="wcard__desc">{widget.description}</div>}
        </div>
        {widget && read && <div className="wcard__props">{propsSummary(widget.props, read.props)}</div>}
        <div className="wcard__acts">
          {open ? (
            <button type="button" className="btn btn--xs" onClick={() => setOpen(false)}>
              Done
            </button>
          ) : (
            <>
              <button type="button" className="btn btn--xs btn--gray" onClick={() => setOpen(true)}>
                Edit
              </button>
              <button type="button" className="wcard__link" onClick={source}>
                source
              </button>
            </>
          )}
        </div>
      </div>

      {(problem || notBuilt || (read && read.problems.length > 0)) && (
        <ul className="wcard__problems" role="status">
          {problem && <li>{problem}</li>}
          {notBuilt && <li>{`${pin!.name} has not been built yet: run npm run widget:dev ${pin!.name}`}</li>}
          {read?.problems.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}

      {open && (
        <>
          <div className="wcard__form">
            {pin && (
              <div className="wprop wprop--version">
                <div className="wprop__label">
                  <label htmlFor={`${id}-version`}>Version</label>
                  <span className="mono">@{String(pin.version)}</span>
                </div>
                <select id={`${id}-version`} value={String(pin.version)} onChange={(e) => repin(e.target.value)}>
                  {versions.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {widget && read && (
              <div className="wprops">
                {widget.props.map((spec) => (
                  <Prop key={spec.key} id={`${id}-${spec.key}`} spec={spec} value={read.props[spec.key] ?? spec.default} onChange={(v) => change(spec.key, v)} />
                ))}
              </div>
            )}
          </div>
          <details className="wcard__source">
            <summary>
              <Ico name="chevron" />
              Source <span className="wcard__hint">the fence in the markdown</span>
            </summary>
            <pre>{text}</pre>
            <button type="button" className="wcard__link" onClick={source}>
              Edit it as text
            </button>
          </details>
        </>
      )}
    </div>
  )
}

/// One prop's field, by its type. A field being typed in keeps what is
/// typed until it loses focus, while the fence takes each good value.
function Prop({ id, spec, value, onChange }: { id: string; spec: PropSpec; value: PropValue; onChange: (value: PropValue) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const label = (
    <div className="wprop__label">
      <label htmlFor={spec.type === 'enum' && segmented(spec) ? undefined : id} id={`${id}-label`}>
        {spec.label}
      </label>
      <span className="mono">{spec.key}</span>
    </div>
  )
  const help = spec.help ? <p className="wprop__help">{spec.help}</p> : null
  const wrap = (children: ReactNode, wide = false) => (
    <div className={`wprop wprop--${spec.type}${wide ? ' wprop--wide' : ''}`}>
      {children}
      {help}
    </div>
  )

  switch (spec.type) {
    case 'enum':
      return wrap(
        <>
          {label}
          {segmented(spec) ? (
            <div className="wseg" role="radiogroup" aria-labelledby={`${id}-label`}>
              {spec.options.map((o) => (
                <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'is-on' : undefined} onClick={() => onChange(o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
          ) : (
            <select id={id} value={String(value)} onChange={(e) => onChange(e.target.value)}>
              {spec.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </>,
      )
    case 'number': {
      const n = typeof value === 'number' ? value : spec.default
      const pct = spec.max > spec.min ? ((n - spec.min) / (spec.max - spec.min)) * 100 : 0
      return wrap(
        <>
          {label}
          <div className="wrange-row">
            <span className="wnum">
              <input
                id={id}
                type="number"
                inputMode="decimal"
                min={spec.min}
                max={spec.max}
                step={spec.step ?? 1}
                value={draft ?? String(n)}
                onChange={(e) => {
                  setDraft(e.target.value)
                  const read = readValue(spec, e.target.value.trim())
                  if ('value' in read) onChange(read.value)
                }}
                onBlur={() => setDraft(null)}
                onKeyDown={noSubmit}
              />
              {spec.unit && <span>{spec.unit}</span>}
            </span>
            <input
              type="range"
              className="wrange"
              aria-labelledby={`${id}-label`}
              min={spec.min}
              max={spec.max}
              step={spec.step ?? 1}
              value={n}
              style={{ ['--pct' as string]: `${pct}%` }}
              onChange={(e) => onChange(Number(e.target.value))}
            />
          </div>
        </>,
        true,
      )
    }
    case 'boolean':
      return wrap(
        <label className="wtoggle">
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          <span className="wtoggle__track" />
          <span className="wtoggle__label">{spec.label}</span>
          <span className="mono">{spec.key}</span>
        </label>,
      )
    case 'string':
      return wrap(
        <>
          {label}
          <input
            id={id}
            type="text"
            value={draft ?? String(value)}
            onChange={(e) => {
              setDraft(e.target.value)
              onChange(formatValue(e.target.value))
            }}
            onBlur={() => setDraft(null)}
            onKeyDown={noSubmit}
          />
        </>,
        true,
      )
  }
}

/// Enter in a card's field does not save the post, as it would in the
/// editor's other fields.
const noSubmit = (e: KeyboardEvent) => {
  if (e.key === 'Enter') e.preventDefault()
}

/// A few short options are a segmented control; more, a select.
const segmented = (spec: PropSpec) => spec.type === 'enum' && spec.options.length <= 4 && spec.options.reduce((n, o) => n + o.label.length, 0) <= 36

// ---------------------------------------------------------------------------
// The picker

/// One thing the picker can insert.
type Choice = { key: string; pin: Pin; title: string; description: string; fence: string }

function choices(widgets: Catalog, dev: boolean): Choice[] {
  const out: Choice[] = []
  for (const w of widgets) {
    const newest = latest(w)
    if (newest) {
      const pin = { name: w.name, version: newest.version }
      out.push({ key: `${w.name}@${newest.version}`, pin, title: newest.widget.name, description: newest.widget.description, fence: fenceText(pin, newest.widget.props, defaults(newest.widget.props)) })
    }
    if (dev && w.dev) {
      const pin = { name: w.name, version: 'dev' as const }
      out.push({ key: `${w.name}@dev`, pin, title: `${w.dev.widget.name} (local build)`, description: w.dev.widget.description, fence: fenceText(pin, w.dev.widget.props) })
    }
  }
  return out
}

export type PickerProps = {
  widgets: Catalog
  dev: boolean
  /// Where it hangs from, in the window: under the line it was opened at.
  /// Null for a sheet.
  at: { top: number; left: number; width: number; above: boolean } | null
  onPick: (fence: string) => void
  onClose: () => void
}

export function WidgetPicker({ widgets, dev, at, onPick, onClose }: PickerProps) {
  const [query, setQuery] = useState('')
  const [on, setOn] = useState(0)
  const search = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const all = useMemo(() => choices(widgets, dev), [widgets, dev])
  const words = query.trim().toLowerCase()
  const shown = words ? all.filter((c) => `${c.key} ${c.title} ${c.description}`.toLowerCase().includes(words)) : all

  useEffect(() => {
    search.current?.focus({ preventScroll: true })
  }, [])
  useEffect(() => setOn(0), [words])
  useEffect(() => {
    list.current?.querySelector('.is-on')?.scrollIntoView({ block: 'nearest' })
  }, [on])

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOn((i) => Math.min(i + 1, shown.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setOn((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const choice = shown[on]
      if (choice) onPick(choice.fence)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
  }

  const style = at ? { top: at.above ? undefined : at.top, bottom: at.above ? window.innerHeight - at.top : undefined, left: at.left, width: at.width } : undefined

  return (
    <>
      <div className={`wpicker-scrim${at ? '' : ' wpicker-scrim--sheet'}`} onMouseDown={onClose} />
      <div className={`wpicker${at ? '' : ' wpicker--sheet'}`} style={style} role="dialog" aria-label="Insert widget" onKeyDown={onKeyDown}>
        <div className="wpicker__head">
          <span className="editor__grabber" />
          <h2>Insert widget</h2>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
        <div className="wpicker__search">
          <Ico name="search" />
          <input ref={search} type="text" aria-label="Search widgets" placeholder="Search widgets" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div ref={list} className="wpicker__list" role="listbox" aria-label="Widgets">
          {shown.map((c, i) => (
            <button
              key={c.key}
              type="button"
              role="option"
              aria-selected={i === on}
              className={`wpicker__item${i === on ? ' is-on' : ''}`}
              onMouseEnter={() => setOn(i)}
              onClick={() => onPick(c.fence)}
            >
              <span className="wpicker__icon" aria-hidden="true">
                <Ico name="widget" />
              </span>
              <span className="wpicker__text">
                <span className="wpicker__name">{c.title}</span>
                <span className="wpicker__desc">{c.description}</span>
                <span className="wpicker__meta mono">{c.key}</span>
              </span>
            </button>
          ))}
          {!shown.length && <p className="wpicker__none">{all.length ? 'No widget matches.' : dev ? 'No widgets yet: make a folder under widgets/ (see widgets/README.md).' : 'No widgets are published yet.'}</p>}
        </div>
        <div className="wpicker__foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> to choose
          </span>
          <span>
            <kbd>Enter</kbd> to insert
          </span>
          <span>
            <kbd>Esc</kbd> to close
          </span>
        </div>
      </div>
    </>
  )
}
