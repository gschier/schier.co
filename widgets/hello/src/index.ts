// Hello shapes: a row of shapes to click, the first widget, small enough to
// read in one go. It follows the contract in widgets/README.md: mount draws
// into the element it is given, update takes new props, destroy takes it
// all out. Its styles live under .hello-widget, added to the page once.

import css from './style.css'
import type { Mount, Props } from './contract'

const STYLE_ID = 'hello-widget-style'

/// The props as this widget wants them, whatever the page passed.
type Settings = { count: number; shape: 'bars' | 'dots' | 'diamonds'; animate: boolean; caption: string }

function settings(props: Props): Settings {
  const count = Math.round(Number(props.count))
  const shape = props.shape === 'dots' || props.shape === 'diamonds' ? props.shape : 'bars'
  return {
    count: Number.isFinite(count) ? Math.min(12, Math.max(1, count)) : 5,
    shape,
    animate: props.animate !== false,
    caption: typeof props.caption === 'string' ? props.caption : '',
  }
}

/// How tall the [i]th of [count] stands, as a share of the row: a gentle
/// wave, never flat.
const height = (i: number, count: number) => 0.45 + 0.5 * Math.abs(Math.sin(((i + 1) / (count + 1)) * Math.PI * 1.5))

/// This build's styles, added once. Matched by their text, so a rebuild on
/// the dev server, or another version on the same page, brings its own.
function addStyle(doc: Document) {
  for (const style of doc.querySelectorAll<HTMLStyleElement>(`style[data-widget-style="${STYLE_ID}"]`)) {
    if (style.textContent === css) return
  }
  const style = doc.createElement('style')
  style.dataset.widgetStyle = STYLE_ID
  style.textContent = css
  doc.head.append(style)
}

export const mount: Mount = (element, { props }) => {
  const doc = element.ownerDocument
  addStyle(doc)

  const root = doc.createElement('div')
  const row = doc.createElement('ul')
  row.className = 'hello-widget__row'
  const caption = doc.createElement('p')
  caption.className = 'hello-widget__caption'
  const words = doc.createElement('span')
  const picked = doc.createElement('span')
  picked.className = 'hello-widget__picked'
  picked.setAttribute('aria-live', 'polite')
  caption.append(words, picked)
  root.append(row, caption)
  element.append(root)

  let current = settings(props)
  let choice: number | null = null

  function draw() {
    root.className = `hello-widget hello-widget--${current.shape}${current.animate ? ' hello-widget--animate' : ''}`
    if (choice !== null && choice >= current.count) choice = null
    row.replaceChildren(
      ...Array.from({ length: current.count }, (_, i) => {
        const item = doc.createElement('li')
        item.className = 'hello-widget__item'
        const stem = doc.createElement('div')
        stem.className = 'hello-widget__stem'
        stem.style.setProperty('--hw-h', `${Math.round(height(i, current.count) * 100)}%`)
        const shape = doc.createElement('button')
        shape.type = 'button'
        shape.className = 'hello-widget__shape'
        shape.style.setProperty('--hw-i', String(i))
        shape.setAttribute('aria-label', `Shape ${i + 1} of ${current.count}`)
        shape.setAttribute('aria-pressed', String(choice === i))
        shape.dataset.index = String(i)
        stem.append(shape)
        item.append(stem)
        return item
      }),
    )
    words.textContent = current.caption
    picked.textContent = choice === null ? `${current.count} ${current.count === 1 ? 'shape' : 'shapes'}` : `Picked ${choice + 1} of ${current.count}`
  }

  const onClick = (event: MouseEvent) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('.hello-widget__shape')
    if (!target) return
    const i = Number(target.dataset.index)
    choice = choice === i ? null : i
    draw()
  }
  row.addEventListener('click', onClick)
  draw()

  return {
    update(next) {
      current = settings(next)
      draw()
    },
    destroy() {
      row.removeEventListener('click', onClick)
      root.remove()
    },
  }
}
