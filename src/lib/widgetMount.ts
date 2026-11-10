// Widgets running in a post (BRIEF.md, Widgets): the post page and the
// editor's preview hand their article to a Widgets, which finds the
// placeholders src/server/markdown.ts drew (div.widget with data-widget-src
// and data-widget-props), loads each module with a dynamic import, once per
// address however many times the post uses it, and mounts it into a plain
// element inside the placeholder. The page imports this file only when the
// post has a placeholder, so a post with no widget loads no widget code.
//
// sync() can be called again after the article's HTML was replaced, as the
// preview does after each keystroke: a widget whose module (name and
// version) is unchanged is moved into the new placeholder and given its new
// props with update(), not torn down and built again. Placeholders are
// matched in order, per module.
//
// A placeholder that names no widget there is (data-widget-error), or a
// module that fails to load or mount, shows its reason to the admin; a
// reader keeps the fallback line. Nothing a widget does can break the page.

import { devModuleUrl } from '#/lib/widgets'
import type { MountedWidget, Props, WidgetModule } from '#/lib/widgetContract'

const modules = new Map<string, Promise<WidgetModule>>()

/// The module at [src], fetched once for the page's life (a failure is
/// forgotten, so the next sync tries again).
export function loadWidget(src: string): Promise<WidgetModule> {
  let module = modules.get(src)
  if (!module) {
    module = import(/* @vite-ignore */ src) as Promise<WidgetModule>
    modules.set(src, module)
    module.catch(() => modules.delete(src))
  }
  return module
}

type Live = {
  /// The module's address; a placeholder with the same one can take it over.
  src: string
  /// What the fence pins: hello@3, hello@dev.
  pin: string
  /// The placeholder it is in now.
  placeholder: HTMLElement
  /// What the widget draws into.
  host: HTMLElement
  /// The props, as the placeholder had them (JSON).
  props: string
  /// What the placeholder held before the widget took it (the fallback
  /// line), put back if the widget fails.
  fallback: Node[]
  instance: MountedWidget | null
  /// It failed to load, mount or update, and shows the fallback.
  failed: boolean
  gone: boolean
}

const parse = (json: string): Props => {
  try {
    const props = JSON.parse(json) as unknown
    return props && typeof props === 'object' ? (props as Props) : {}
  } catch {
    return {}
  }
}

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error))

/// A line the admin sees in the placeholder, saying what went wrong.
function notice(placeholder: HTMLElement, text: string) {
  placeholder.querySelector(':scope > .widget__notice')?.remove()
  const p = document.createElement('p')
  p.className = 'widget__notice'
  p.textContent = `Widget: ${text}`
  placeholder.prepend(p)
}

export class Widgets {
  private live: Live[] = []
  private events: EventSource | null = null

  constructor(private readonly options: { admin: boolean }) {}

  /// Mounts the widgets in [root], keeping the ones already mounted whose
  /// module is the same.
  sync(root: HTMLElement) {
    const previous = this.live
    const taken = new Set<Live>()
    const next: Live[] = []
    for (const placeholder of root.querySelectorAll<HTMLElement>('div.widget')) {
      const error = placeholder.dataset.widgetError
      const src = placeholder.dataset.widgetSrc
      if (error || !src) {
        if (this.options.admin) notice(placeholder, error ?? 'this fence names no widget')
        continue
      }
      const props = placeholder.dataset.widgetProps ?? '{}'
      // One that failed is mounted afresh, in case the new props suit it.
      const same = previous.find((l) => !taken.has(l) && !l.failed && l.src === src)
      if (same) {
        taken.add(same)
        same.placeholder = placeholder
        same.fallback = [...placeholder.childNodes]
        if (same.instance) this.show(same)
        if (same.props !== props) {
          same.props = props
          if (same.instance) this.attempt(same, () => same.instance?.update(parse(props)))
        }
        next.push(same)
      } else next.push(this.mount(placeholder, src, props))
    }
    for (const l of previous) if (!taken.has(l)) this.drop(l)
    this.live = next
    if (import.meta.env.DEV && next.some((l) => l.pin.endsWith('@dev'))) this.listen()
  }

  /// Takes every widget out.
  destroy() {
    for (const l of this.live) this.drop(l)
    this.live = []
    this.events?.close()
    this.events = null
  }

  private mount(placeholder: HTMLElement, src: string, props: string): Live {
    const host = document.createElement('div')
    host.className = 'widget__host'
    const live: Live = { src, pin: placeholder.dataset.widget ?? '', placeholder, host, props, fallback: [...placeholder.childNodes], instance: null, failed: false, gone: false }
    loadWidget(src).then(
      (module) => {
        if (live.gone) return
        if (typeof module?.mount !== 'function') return this.fail(live, `${src} has no mount export`)
        this.show(live)
        this.attempt(live, () => {
          live.instance = module.mount(host, { props: parse(live.props) })
        })
      },
      (error) => !live.gone && this.fail(live, `${src} did not load: ${reason(error)}`),
    )
    return live
  }

  /// Puts [live]'s element in its placeholder in place of the fallback, and
  /// lets go of the space the placeholder held for it.
  private show(live: Live) {
    if (live.host.parentElement !== live.placeholder) live.placeholder.replaceChildren(live.host)
    live.placeholder.style.removeProperty('aspect-ratio')
    live.placeholder.style.removeProperty('min-height')
    live.placeholder.dataset.widgetMounted = ''
  }

  private attempt(live: Live, run: () => void) {
    try {
      run()
    } catch (error) {
      this.fail(live, `${live.pin} failed: ${reason(error)}`)
    }
  }

  /// Takes a failed widget out and puts the fallback line back, with the
  /// reason for the admin.
  private fail(live: Live, text: string) {
    console.error(`widget: ${text}`)
    live.failed = true
    const instance = live.instance
    live.instance = null
    try {
      instance?.destroy()
    } catch {}
    live.host.remove()
    live.host.replaceChildren()
    const placeholder = live.placeholder
    if (!placeholder.contains(live.fallback[0] ?? null)) placeholder.replaceChildren(...live.fallback)
    delete placeholder.dataset.widgetMounted
    if (this.options.admin) notice(placeholder, text)
  }

  private drop(live: Live) {
    live.gone = true
    try {
      live.instance?.destroy()
    } catch (error) {
      console.error(`widget: ${live.pin} failed to stop: ${reason(error)}`)
    }
    live.instance = null
    live.host.remove()
  }

  /// Dev server only: mounts a local build again when it changes
  /// (vite.config.ts's /__widgets/events), with the props it had.
  private listen() {
    if (this.events || typeof EventSource === 'undefined') return
    this.events = new EventSource('/__widgets/events')
    this.events.onmessage = (event) => {
      const { name, stamp } = JSON.parse(event.data) as { name: string; stamp: number }
      const src = devModuleUrl(name, stamp)
      this.live = this.live.map((l) => {
        if (l.pin !== `${name}@dev` || l.src === src) return l
        this.drop(l)
        l.placeholder.dataset.widgetSrc = src
        return this.mount(l.placeholder, src, l.props)
      })
    }
  }
}
