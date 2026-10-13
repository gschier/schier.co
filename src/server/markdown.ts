// Markdown to HTML for posts, reproducing the Go site's renderer
// (internal/renderer.go and internal/templates.go: blackfriday v2 with
// bfchroma), so a post reads the same after the port. Checked against the
// Go site by test/markdown.test.ts.

import type { Code, Definition, Emphasis, FootnoteDefinition, FootnoteReference, Heading, Html, Image, Link, Nodes, Paragraph, Parent, PhrasingContent, Root, RootContent, Text } from 'mdast'
import type { Node } from 'unist'
import type { Processor } from 'unified'
import { bundledLanguages, createHighlighter, type Highlighter } from 'shiki'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import { unified } from 'unified'

/// A post's markdown as the HTML the Go site renders for it.
export async function renderMarkdown(markdown: string): Promise<string> {
  // The Go site's markdown filter: blackfriday does not like Windows line
  // endings.
  const source = prepare(markdown.replace(/\r\n/g, '\n'))
  const highlighter = await shiki()
  await loadLanguages(highlighter, source)
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm, { singleTilde: false })
    .use(withoutHtmlFlow)
    .use(() => (tree: Root) => blackfriday(tree, source, highlighter))
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(source)
  return String(file)
}

/// HTML blocks are found the way blackfriday finds them (htmlBlocks), not
/// by CommonMark's rules, so micromark is told not to look for them.
function withoutHtmlFlow(this: Processor) {
  const data = this.data()
  ;(data.micromarkExtensions ??= []).push({ disable: { null: ['htmlFlow'] } })
}

/// Source rewrites for what blackfriday reads differently and the tree
/// cannot recover:
/// - a list nested under an item by fewer spaces than the item's text is
///   indented (blackfriday nests any item indented more than its parent);
/// - `1)`, which blackfriday does not take as a list item;
/// - a line indented less than four spaces after a blank line in a list,
///   which ends the list in blackfriday;
/// - a paragraph ended by an indented line or a list item with no blank line
///   between (NoEmptyLineBeforeBlock: blackfriday starts a code block or a
///   list, where CommonMark carries on the paragraph);
/// - a link whose destination escapes a closing parenthesis inside a pair,
///   as in `(Fortune_(Unix\))`.
function prepare(source: string): string {
  const lines = source.split('\n')
  const out: string[] = []
  let fence = ''
  let paragraph = false
  const items: { indent: number; content: number }[] = []
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]!
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (fence || f) {
      if (f && (!fence || f[1]!.startsWith(fence))) fence = fence ? '' : f[1]![0]!.repeat(3)
      out.push(line)
      paragraph = false
      continue
    }
    const blank = line.trim() === ''
    const afterBlank = i === 0 || lines[i - 1]!.trim() === ''
    if (afterBlank && line.startsWith('<')) {
      // An HTML block is left as it is.
      const size = htmlBlock(lines.slice(i).join('\n'))
      if (size > 0) {
        const block = lines.slice(i).join('\n').slice(0, size).replace(/\n$/, '')
        const count = block.split('\n').length
        out.push(...lines.slice(i, i + count))
        i += count - 1
        paragraph = false
        continue
      }
    }
    line = line.replace(/\]\(([^()\s]*)\(([^()\s]*)\\\)\)/g, ']($1($2))')
    // `1)` does not start a list item in blackfriday.
    line = line.replace(/^(\s*\d{1,9})\)(?=[ \t])/, '$1\\)')
    if (items.length && afterBlank && !blank && !LIST_ITEM.test(line) && /^ {1,3}\S/.test(line)) {
      // After a blank line, an item goes on only with lines indented four
      // spaces; anything less ends the list.
      line = line.trimStart()
    }
    if (/^\S/.test(line) && !LIST_ITEM.test(line) && afterBlank) items.length = 0
    const indented = /^( {4}|\t)/.test(line)
    const m = LIST_ITEM.exec(line)
    if (paragraph && !items.length && !blank && (indented || m)) out.push('')
    if (m) {
      let indent = m[1]!.length
      while (items.length && items[items.length - 1]!.indent >= indent) items.pop()
      const parent = items[items.length - 1]
      if (parent && indent < parent.content) {
        line = ' '.repeat(parent.content) + line.slice(indent)
        indent = parent.content
      }
      items.push({ indent, content: indent + m[2]!.length + m[3]!.length })
    }
    paragraph = !blank && !m && !items.length && (paragraph || !indented) && !/^ {0,3}(#|>|([-*_] *){3,}$|=+ *$)/.test(line)
    out.push(line)
  }
  return out.join('\n')
}

const LIST_ITEM = /^( *)([-*+]|\d{1,9}\.)( +)\S/

// ---------------------------------------------------------------------------
// The tree, reworked as blackfriday renders it

function blackfriday(tree: Root, source: string, highlighter: Highlighter) {
  htmlBlocks(tree, source)
  blockQuirks(tree, source)
  const ctx: Context = { source, highlighter, sp: new Smartypants(), notes: footnotes(tree), definitions: definitions(tree) }
  walk(tree, ctx)
  if (ctx.notes.order.length) tree.children.push(...footnoteList(ctx))
}

type Context = {
  source: string
  highlighter: Highlighter
  sp: Smartypants
  notes: Notes
  definitions: Map<string, Definition>
}

function walk(parent: Parent, ctx: Context) {
  const children = parent.children as RootContent[]
  for (let i = 0; i < children.length; i++) {
    let node = children[i]!
    if (node.type === 'linkReference' || node.type === 'imageReference') {
      const def = ctx.definitions.get(node.identifier)
      if (def) {
        node = children[i] =
          node.type === 'linkReference'
            ? { type: 'link', url: def.url, title: def.title, children: node.children, position: node.position }
            : { type: 'image', url: def.url, title: def.title, alt: node.alt, position: node.position }
      }
    }
    let replaced: RootContent[] | undefined
    switch (node.type) {
      case 'text':
        children[i] = raw(ctx.sp.process(escapeHTML(textValue(node, ctx.source))))
        continue
      case 'heading':
        headingId(node, ctx.source)
        break
      case 'link':
        replaced = link(node, ctx.source)
        break
      case 'emphasis':
        replaced = intraword(node, ctx.source) ?? strongFirst(node, ctx.source)
        break
      case 'image':
        children[i] = image(node, ctx.sp)
        continue
      case 'code':
        children[i] = code(node, ctx.highlighter)
        continue
      case 'list':
        // blackfriday always starts a numbered list at 1.
        node.start = null
        break
      case 'footnoteReference':
        children[i] = footnoteRef(node, ctx.notes)
        continue
    }
    if (replaced) {
      children.splice(i, 1, ...replaced)
      i--
      continue
    }
    if ('children' in node) walk(node, ctx)
  }
}

/// Link and image reference definitions, by identifier; the first wins.
function definitions(tree: Root): Map<string, Definition> {
  const found = new Map<string, Definition>()
  const visit = (node: Nodes) => {
    if (node.type === 'definition' && !found.has(node.identifier)) found.set(node.identifier, node)
    if ('children' in node) for (const child of node.children) visit(child)
  }
  visit(tree)
  return found
}

const start = (node: Node) => node.position?.start.offset ?? -1
const end = (node: Node) => node.position?.end.offset ?? -1

// ---------------------------------------------------------------------------
// Blocks

/// Raw HTML blocks as blackfriday finds them: at the start of a block, a
/// block-level tag whose matching close ends a line followed by a blank
/// line (or the end), or a comment or <hr> followed by a blank line.
/// Everything in between is left as written, blank lines included. Any other
/// HTML at the start of a block is inline HTML in a paragraph.
function htmlBlocks(parent: Parent, source: string) {
  const children = parent.children as RootContent[]
  for (let i = 0; i < children.length; i++) {
    const node = children[i]!
    const from = start(node)
    // At the top level the tag must start the line; in a list item or a
    // quote, blackfriday has taken the indent or marker off already.
    const atStart = parent.type !== 'root' || node.position?.start.column === 1
    if (from >= 0 && atStart && source[from] === '<' && node.type !== 'html') {
      const size = htmlBlock(source.slice(from))
      if (size > 0) {
        let to = from + size
        let j = i
        while (j + 1 < children.length && start(children[j + 1]!) < to) j++
        to = Math.max(to, end(children[j]!))
        children.splice(i, j - i + 1, { type: 'html', value: source.slice(from, to).replace(/\n+$/, ''), position: { start: node.position!.start, end: children[j]!.position!.end } })
        continue
      }
    }
    if ('children' in node && node.type !== 'paragraph' && node.type !== 'heading') htmlBlocks(node as Parent, source)
  }
}

/// blackfriday's html(): the length of the HTML block at the start of
/// [data], or 0.
function htmlBlock(data: string): number {
  if (data[0] !== '<') return 0
  let i = 1
  while (i < data.length && isalnum(data[i]!)) i++
  const tag = data.slice(1, i)
  if (!BLOCK_TAGS.has(tag)) return htmlComment(data) || htmlHr(data)
  if (tag === 'ins' || tag === 'del') return 0
  i = 1
  while (i < data.length) {
    i++
    while (i < data.length && !(data[i - 1] === '<' && data[i] === '/')) i++
    if (i + 2 + tag.length >= data.length) break
    const j = htmlFindEnd(tag, data.slice(i - 1))
    if (j > 0) return i + j - 1
  }
  return 0
}

function htmlFindEnd(tag: string, data: string): number {
  if (tag === 'hr') return 2
  const close = `</${tag}>`
  if (!data.startsWith(close)) return 0
  let i = close.length
  let skip = isEmpty(data.slice(i))
  if (skip === 0) return 0
  i += skip
  if (i >= data.length) return i
  skip = isEmpty(data.slice(i))
  if (skip === 0) return 0
  return i + skip
}

function htmlComment(data: string): number {
  if (!data.startsWith('<!--') || data.length < 5) return 0
  let i = 5
  while (i < data.length && !(data[i - 2] === '-' && data[i - 1] === '-' && data[i] === '>')) i++
  if (i >= data.length) return 0
  i++
  const j = isEmpty(data.slice(i))
  return j > 0 ? i + j : 0
}

function htmlHr(data: string): number {
  if (!/^<[hH][rR][ />]/.test(data)) return 0
  let i = 3
  while (i < data.length && data[i] !== '>' && data[i] !== '\n') i++
  if (data[i] !== '>') return 0
  i++
  const j = isEmpty(data.slice(i))
  return j > 0 ? i + j : 0
}

/// The length of a blank line at the start of [data], newline included.
function isEmpty(data: string): number {
  if (!data) return 0
  let i = 0
  for (; i < data.length && data[i] !== '\n'; i++) if (data[i] !== ' ' && data[i] !== '\t') return 0
  if (data[i] === '\n') i++
  return i
}

const isalnum = (c: string) => /^[A-Za-z0-9]$/.test(c)

const BLOCK_TAGS = new Set(
  'blockquote del div dl fieldset form h1 h2 h3 h4 h5 h6 iframe ins math noscript ol pre p script style table ul address article aside canvas figcaption figure footer header hgroup main nav output progress section video'.split(' '),
)

/// Two block rules where blackfriday differs from CommonMark:
/// - a line of dashes straight after a list item, with no blank line, is
///   more of the item's text, not a rule;
/// - a setext heading is only the line above the underline; the lines before
///   it stay a paragraph.
function blockQuirks(parent: Parent, source: string) {
  const children = parent.children as RootContent[]
  for (let i = 0; i < children.length; i++) {
    const node = children[i]!
    const prev = children[i - 1]
    if (node.type === 'thematicBreak' && prev?.type === 'list' && !/\n[ \t]*\n/.test(source.slice(end(prev), start(node)))) {
      const para = lastParagraph(prev)
      if (para) {
        para.children.push({ type: 'text', value: '\n' + source.slice(start(node), end(node)) })
        children.splice(i, 1)
        i--
        continue
      }
    }
    if (node.type === 'heading' && source[start(node)] !== '#') {
      const split = splitSetext(node)
      if (split) {
        children.splice(i, 1, ...split)
        i++
        continue
      }
    }
    if ('children' in node) blockQuirks(node as Parent, source)
  }
}

function lastParagraph(node: Nodes): Paragraph | undefined {
  if (node.type === 'paragraph') return node
  if ('children' in node && node.children.length) return lastParagraph(node.children[node.children.length - 1] as Nodes)
  return undefined
}

function splitSetext(heading: Heading): [Paragraph, Heading] | undefined {
  const kids = heading.children
  for (let k = kids.length - 1; k >= 0; k--) {
    const kid = kids[k]!
    if (kid.type === 'break') {
      return [
        { type: 'paragraph', children: kids.slice(0, k + 1) },
        { ...heading, children: kids.slice(k + 1) },
      ]
    }
    if (kid.type !== 'text') continue
    const nl = kid.value.lastIndexOf('\n')
    if (nl < 0) continue
    return [
      { type: 'paragraph', children: [...kids.slice(0, k), { type: 'text', value: kid.value.slice(0, nl) }] },
      { ...heading, children: [{ type: 'text', value: kid.value.slice(nl + 1) }, ...kids.slice(k + 1)] },
    ]
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Inline

const raw = (value: string): Html => ({ type: 'html', value })
const text = (value: string): Text => ({ type: 'text', value })

/// Links as blackfriday makes them, or the text it would leave instead:
/// - one with an empty destination, `[Jekyll]()`, is not a link;
/// - bare email addresses and www. addresses are not linked (blackfriday's
///   autolinks need a scheme);
/// - links that leave the site open in a new tab with rel="noopener"
///   (HrefTargetBlank and NoopenerLinks); relative ones are left alone.
function link(node: Link, source: string): PhrasingContent[] | undefined {
  const written = source.slice(start(node), end(node))
  if (node.url === '' && written.startsWith('[') && written.endsWith('()')) {
    return [text('['), ...node.children, text(']()')]
  }
  const bare = !written.startsWith('[') && !written.startsWith('<')
  if (bare && (node.url.startsWith('mailto:') || /^www\./i.test(written))) return [text(written)]
  if (isRelativeLink(node.url)) return undefined
  // blackfriday writes href, target, rel, then title.
  const title = node.title
  node.title = null
  node.data = {
    ...node.data,
    hProperties: { ...node.data?.hProperties, target: '_blank', rel: ['noopener'], ...(title != null ? { title } : {}) },
  }
  return undefined
}

/// NoIntraEmphasis: a single `*` that closes emphasis must not be followed
/// by a letter or digit, or it is just an asterisk.
function intraword(node: Emphasis, source: string): PhrasingContent[] | undefined {
  const after = source[end(node)]
  if (after === undefined || isspace(after) || ispunct(after)) return undefined
  const mark = source[start(node)]!
  return [text(mark), ...node.children, text(mark)]
}

/// `***both***` is strong around emphasis in blackfriday, the other way
/// round in CommonMark.
function strongFirst(node: Emphasis, source: string): PhrasingContent[] | undefined {
  const only = node.children[0]
  if (node.children.length !== 1 || only?.type !== 'strong') return undefined
  const written = source.slice(start(node), end(node))
  if (!/^(\*\*\*|___)/.test(written)) return undefined
  return [{ ...only, children: [{ ...node, children: only.children }] }]
}

/// A text's value with backslash escapes as blackfriday reads them: only its
/// own set of characters can be escaped, so `\"` keeps its backslash.
function textValue(node: Text, source: string): string {
  const written = source.slice(start(node), end(node))
  if (!written.includes('\\') || /[&\n]/.test(written)) return node.value
  let out = ''
  let commonmark = ''
  for (let i = 0; i < written.length; i++) {
    const c = written[i]!
    const next = written[i + 1]
    if (c === '\\' && next !== undefined && ispunct(next)) {
      out += BF_ESCAPES.includes(next) ? next : c + next
      commonmark += next
      i++
      continue
    }
    out += c
    commonmark += c
  }
  // Only when the source reads back as the parser read it.
  return commonmark === node.value ? out : node.value
}

const BF_ESCAPES = '\\`*_{}[]()#+-.!:|&<>~'

// ---------------------------------------------------------------------------
// Footnotes, as blackfriday writes them

type Notes = { order: string[]; definitions: Map<string, FootnoteDefinition> }

/// Takes the footnote definitions out of the tree; references number them
/// in the order they are first used.
function footnotes(tree: Root): Notes {
  const definitions = new Map<string, FootnoteDefinition>()
  tree.children = tree.children.filter((node) => {
    if (node.type !== 'footnoteDefinition') return true
    if (!definitions.has(node.identifier)) definitions.set(node.identifier, node)
    return false
  })
  return { order: [], definitions }
}

function footnoteRef(node: FootnoteReference, notes: Notes): Html {
  let n = notes.order.indexOf(node.identifier) + 1
  if (n === 0) n = notes.order.push(node.identifier)
  const slug = slugify(node.label ?? node.identifier)
  return raw(`<sup class="footnote-ref" id="fnref:${slug}"><a href="#fn:${slug}">${n}</a></sup>`)
}

/// The list blackfriday puts after the post: a rule, then each note's text
/// in a numbered list.
function footnoteList(ctx: Context): RootContent[] {
  const notes = ctx.notes
  const element = (tagName: string, properties: Record<string, string>, children: unknown[]) =>
    ({ type: 'paragraph', data: { hName: tagName, hProperties: properties }, children }) as Paragraph
  const items = notes.order.flatMap((id) => {
    const def = notes.definitions.get(id)
    if (!def) return []
    const li = element('li', { id: `fn:${slugify(def.label ?? id)}` }, def.children.flatMap((c) => (c.type === 'paragraph' ? c.children : [])))
    walk(li, ctx)
    return [li]
  })
  return [element('div', { className: 'footnotes' }, [raw('<hr />'), element('ol', {}, items)])]
}

/// blackfriday's slugify for footnote anchors.
function slugify(label: string): string {
  let out = ''
  let sym = false
  for (const ch of label) {
    if (isalnum(ch)) {
      sym = false
      out += ch
    } else if (!sym) {
      out += '-'
      sym = true
    }
  }
  return out.replace(/^-+/, '').replace(/-+$/, '')
}

/// Headings get an id from their markdown source (blackfriday's
/// AutoHeadingIDs with sanitized_anchor_name), or the one given with
/// `{#id}`. No link is inserted; the post page's script adds that.
function headingId(node: Heading, source: string) {
  if (start(node) < 0) return
  let text = source.slice(start(node), end(node))
  let id = ''
  if (/^ {0,3}#/.test(text)) {
    text = text.replace(/^ *#+ */, '')
    const custom = /\{#([^}]*)\}/.exec(text)
    if (custom) {
      id = custom[1]!
      text = text.slice(0, custom.index).replace(/ +$/, '')
    }
    text = text.replace(/#+$/, '').replace(/ +$/, '')
  } else {
    // Setext: the line above the underline.
    const lines = text.split('\n')
    text = lines[lines.length - 2] ?? ''
  }
  if (id) {
    // `{#id}` is not part of the heading's text.
    const last = node.children[node.children.length - 1]
    if (last?.type === 'text') last.value = last.value.replace(/ *\{#[^}]*\} *$/, '')
  } else {
    id = anchorName(text)
  }
  node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id } }
}

/// github.com/shurcooL/sanitized_anchor_name: letters and numbers,
/// lowercased, with any run of other characters between them one hyphen.
function anchorName(text: string): string {
  let out = ''
  let dash = false
  for (const ch of text) {
    if (/[\p{L}\p{N}]/u.test(ch)) {
      if (dash && out) out += '-'
      dash = false
      out += ch.toLowerCase()
    } else {
      dash = true
    }
  }
  return out
}

function isRelativeLink(link: string): boolean {
  return link.startsWith('#') || (link.startsWith('/') && !link.startsWith('//')) || link.startsWith('./') || link.startsWith('../')
}

/// blackfriday writes images itself, the alt text through smartypants.
function image(node: Image, sp: Smartypants): Html {
  let html = `<img src="${escapeHTML(node.url)}" alt="${sp.process(escapeHTML(node.alt ?? ''))}`
  if (node.title != null) html += `" title="${escapeHTML(node.title)}`
  return raw(`${html}" />`)
}

// ---------------------------------------------------------------------------
// Code blocks

let highlighterPromise: Promise<Highlighter> | undefined
const shiki = () => (highlighterPromise ??= createHighlighter({ themes: [THEMES.light, THEMES.dark], langs: [] }))

/// Shiki's two themes: the light one's colours are written inline, the dark
/// one's as --shiki-dark variables on each token, which the stylesheet
/// switches to in dark mode (src/styles.css, "Code blocks").
const THEMES = { light: 'github-light', dark: 'github-dark' } as const

/// A fenced block in its language, through Shiki; with no language, or one
/// Shiki does not know, plain (chroma's fallback lexer, as bfchroma is set up
/// without autodetection). chroma is given the whole info string, so
/// anything after the language makes the block plain too.
function code(node: Code, highlighter: Highlighter): Html {
  const lang = language(node.meta ? `${node.lang} ${node.meta}` : node.lang)
  // A browser drops a newline straight after <pre>, so the Go site's blocks
  // never start with a blank line.
  const value = node.value.replace(/^\n/, '')
  return raw(highlighter.codeToHtml(value, { lang, themes: THEMES }))
}

function language(info: string | null | undefined): string {
  const name = (info ?? '').trim().toLowerCase()
  if (name && Object.hasOwn(bundledLanguages, name)) return name
  return 'text'
}

/// Loads every language the posts use before rendering, since Shiki's
/// codeToHtml is synchronous.
async function loadLanguages(highlighter: Highlighter, source: string) {
  const wanted = new Set<string>()
  for (const m of source.matchAll(/^ {0,3}(?:```|~~~)[ \t]*([^\s`]+)/gm)) {
    const lang = language(m[1])
    if (lang !== 'text') wanted.add(lang)
  }
  const missing = [...wanted].filter((l) => !highlighter.getLoadedLanguages().includes(l))
  if (missing.length) await highlighter.loadLanguage(...(missing as (keyof typeof bundledLanguages)[]))
}

// ---------------------------------------------------------------------------
// Escaping and smartypants, as blackfriday does them

function escapeHTML(s: string): string {
  return s.replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'))
}

const PUNCT = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'
const isspace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v'
const ispunct = (c: string) => c !== '' && PUNCT.includes(c)
const isdigit = (c: string) => c >= '0' && c <= '9' && c.length === 1
const wordBoundary = (c: string) => c === '' || isspace(c) || ispunct(c)
const lower = (c: string | undefined) => (c ?? '').toLowerCase()

/// blackfriday's SPRenderer with CommonHTMLFlags: smart quotes, LaTeX
/// dashes, fractions, ellipses and (c) (r) (tm). Quote state carries across
/// the document. '' stands for blackfriday's 0 byte, the edge of a text.
class Smartypants {
  inSingle = false
  inDouble = false

  process(text: string): string {
    let out = ''
    let mark = 0
    for (let i = 0; i < text.length; i++) {
      const action = this.action(text[i]!)
      if (!action) continue
      if (i > mark) out += text.slice(mark, i)
      const prev = i > 0 ? text[i - 1]! : ''
      const [html, skip] = action.call(this, prev, text.slice(i))
      out += html
      i += skip
      mark = i + 1
    }
    if (mark < text.length) out += text.slice(mark)
    return out
  }

  private action(c: string): ((prev: string, text: string) => [string, number]) | undefined {
    switch (c) {
      case '"':
        return this.doubleQuote
      case '&':
        return this.amp
      case "'":
        return this.singleQuote
      case '(':
        return this.parens
      case '-':
        return this.dash
      case '.':
        return this.period
      case '`':
        return this.backtick
      case '<':
        return this.leftAngle
    }
    if (c >= '1' && c <= '9') return this.number
    return undefined
  }

  private quote(prev: string, next: string, quote: 'd' | 's', which: 'inSingle' | 'inDouble'): string {
    let open: boolean
    if (prev === '' && next === '') open = !this[which]
    else if (isspace(prev) && next === '') open = true
    else if (ispunct(prev) && next === '') open = false
    else if (next === '') open = false
    else if (prev === '' && isspace(next)) open = false
    else if (isspace(prev) && isspace(next)) open = !this[which]
    else if (ispunct(prev) && isspace(next)) open = false
    else if (isspace(next)) open = false
    else if (prev === '' && ispunct(next)) open = false
    else if (isspace(prev) && ispunct(next)) open = true
    else if (ispunct(prev) && ispunct(next)) open = !this[which]
    else if (ispunct(next)) open = false
    else if (prev === '') open = true
    else if (isspace(prev)) open = true
    else if (ispunct(prev)) open = true
    else open = false
    this[which] = open
    return `&${open ? 'l' : 'r'}${quote}quo;`
  }

  private singleQuote(prev: string, text: string): [string, number] {
    if (text.length >= 2) {
      const t1 = lower(text[1])
      if (t1 === "'") return [this.quote(prev, text[2] ?? '', 'd', 'inDouble'), 1]
      if ((t1 === 's' || t1 === 't' || t1 === 'm' || t1 === 'd') && (text.length < 3 || wordBoundary(text[2]!))) return ['&rsquo;', 0]
      if (text.length >= 3) {
        const t2 = lower(text[2])
        if (((t1 === 'r' && t2 === 'e') || (t1 === 'l' && t2 === 'l') || (t1 === 'v' && t2 === 'e')) && (text.length < 4 || wordBoundary(text[3]!))) {
          return ['&rsquo;', 0]
        }
      }
    }
    return [this.quote(prev, text[1] ?? '', 's', 'inSingle'), 0]
  }

  private parens(_prev: string, text: string): [string, number] {
    const t1 = lower(text[1])
    const t2 = lower(text[2])
    if (text.length >= 3) {
      if (t1 === 'c' && t2 === ')') return ['&copy;', 2]
      if (t1 === 'r' && t2 === ')') return ['&reg;', 2]
      if (text.length >= 4 && t1 === 't' && t2 === 'm' && text[3] === ')') return ['&trade;', 3]
    }
    return [text[0]!, 0]
  }

  private dash(_prev: string, text: string): [string, number] {
    if (text.startsWith('---')) return ['&mdash;', 2]
    if (text.startsWith('--')) return ['&ndash;', 1]
    return ['-', 0]
  }

  private amp(prev: string, text: string): [string, number] {
    if (text.startsWith('&quot;')) return [this.quote(prev, text[6] ?? '', 'd', 'inDouble'), 5]
    if (text.startsWith('&#0;')) return ['', 3]
    return ['&', 0]
  }

  private period(_prev: string, text: string): [string, number] {
    if (text.startsWith('...')) return ['&hellip;', 2]
    if (text.startsWith('. . .')) return ['&hellip;', 4]
    return ['.', 0]
  }

  private backtick(prev: string, text: string): [string, number] {
    if (text.startsWith('``')) return [this.quote(prev, text[2] ?? '', 'd', 'inDouble'), 1]
    return ['`', 0]
  }

  private doubleQuote(prev: string, text: string): [string, number] {
    return [this.quote(prev, text[1] ?? '', 'd', 'inDouble'), 0]
  }

  private leftAngle(_prev: string, text: string): [string, number] {
    const i = text.indexOf('>')
    if (i < 0) return [text, text.length - 1]
    return [text.slice(0, i + 1), i]
  }

  /// SmartypantsFractions: digits/digits at word boundaries become a
  /// superscript over a subscript.
  private number(prev: string, text: string): [string, number] {
    if (wordBoundary(prev) && prev !== '/' && text.length >= 3) {
      let numEnd = 0
      while (numEnd < text.length && isdigit(text[numEnd]!)) numEnd++
      if (numEnd === 0) return [text[0]!, 0]
      let denStart = numEnd + 1
      if (text.length > numEnd + 1 && text[numEnd] === '⁄') denStart = numEnd + 1
      else if (text.length < numEnd + 2 || text[numEnd] !== '/') return [text[0]!, 0]
      let denEnd = denStart
      while (denEnd < text.length && isdigit(text[denEnd]!)) denEnd++
      if (denEnd === denStart) return [text[0]!, 0]
      if (text.length === denEnd || (wordBoundary(text[denEnd]!) && text[denEnd] !== '/')) {
        return [`<sup>${text.slice(0, numEnd)}</sup>&frasl;<sub>${text.slice(denStart, denEnd)}</sub>`, denEnd - 1]
      }
    }
    return [text[0]!, 0]
  }
}

// ---------------------------------------------------------------------------
// Summaries

/// Plain text of a post's opening, for previews and descriptions: the part
/// before `<!--more-->`, or else the first paragraph, stripped of markdown
/// as the Go site's Summary (internal/helpers.go) does with go-strip-markdown,
/// newlines as spaces and -- and --- as dashes. With [words], cut to that
/// many words, with an ellipsis if anything was cut.
export function summarize(markdown: string, words?: number): string {
  const md = markdown.replace(/\r\n/g, '\n')
  const opening = md.includes('<!--more-->') ? md.split('<!--more-->')[0]! : md.split('\n\n')[0]!
  const summary = strip(opening).replace(/\n+/g, ' ').replaceAll('---', '\u2014').replaceAll('--', '\u2013').trim()
  if (words === undefined) return summary
  const all = summary.split(/\s+/).filter(Boolean)
  return all.length > words ? `${all.slice(0, words).join(' ')}\u2026` : summary
}

// RE2's \s and \S, which are ASCII only.
const S = '[\\t\\n\\f\\r ]'
const N = '[^\\t\\n\\f\\r ]'

/// github.com/writeas/go-strip-markdown v2.0.1, rule for rule, quirks
/// included (its "P1" patterns were meant as backreferences and match a
/// literal P1).
const STRIP: [RegExp, string][] = [
  [new RegExp(`^(${S}*)([*\\-+]|\\d\\.)${S}+`, 'gm'), '$1'],
  [/\n={2,}/g, '\n'],
  [/~~/g, ''],
  [/`{3}.*\n/g, ''],
  [/\*\*([^*]+)\*\*/g, '$1'],
  [/\*([^*]+)\*/g, '$1'],
  [/__([^_]+)__/g, '$1'],
  [/_([^_]+)_/g, '$1'],
  [/<(.*?)>/g, '$1'],
  [new RegExp(`^[=\\-]{2,}${S}*$`, 'g'), ''],
  [/\[\^.+?\](: .*?$)?/g, ''],
  [new RegExp(`${S}{0,2}\\[.*?\\]: .*?$`, 'g'), ''],
  [new RegExp(`!\\[(.*?)\\]${S}?[[(].*?[\\])]`, 'g'), '$1'],
  [/\[(.*?)\][[(].*?[\])]/g, '$1'],
  [new RegExp(`>${S}*`, 'g'), '  '],
  [new RegExp(`^${S}{1,2}\\[(.*?)\\]: (${N}+)( ".*?")?${S}*$`, 'g'), ''],
  [/^#{1,6}[\t\n\f\r ]*([^#]+)[\t\n\f\r ]*(#{1,6})?$/gm, '$1'],
  [new RegExp(`([*_]{1,3})(${N}.*?${N})?P1`, 'g'), '$2'],
  [/(`{3,})(.*?)?P1/gm, '$2'],
  [new RegExp(`^-{3,}${S}*$`, 'g'), ''],
  [/`(.+?)`/g, '$1'],
  [/\n{2,}/g, '\n\n'],
]

function strip(md: string): string {
  return STRIP.reduce((s, [re, to]) => s.replace(re, to), md)
}
