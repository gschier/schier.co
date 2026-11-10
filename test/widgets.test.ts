// Widgets (BRIEF.md, Widgets):
//   node --test test/widgets.test.ts
//
// The fence and its props as src/lib/widgets.ts reads them; the placeholder
// src/server/markdown.ts draws; the publish refusal in
// src/server/postActions.ts; the MCP's list_widgets; and
// scripts/widget-publish.mjs building a widget and publishing it to a
// scratch directory as storage (never the bucket: the AWS_* variables are
// unset for the run), with its versions in a scratch manifest, served back
// through /media/. The widgets folder is a scratch one too (WIDGETS_DIR),
// holding a fixture widget whose build is a few lines of node, so nothing
// is installed.

import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, beforeEach, describe, test } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { checkWidgetJson, defaults, fenceText, findFences, parsePin, propsBody, propsSummary, readProps, setProp, sizeStyle, type Manifest } from '../src/lib/widgets.ts'
import type { PropSpec, WidgetJson } from '../src/lib/widgetContract.ts'
import { contentHash, publishWidget, putVersion, readManifest, widgetStorage } from '../scripts/widget-publish.mjs'
import { handler, root, scratch, signedIn, site, type Handler } from './help.ts'

const hello = JSON.parse(readFileSync(join(root, 'widgets/hello/widget.json'), 'utf8')) as WidgetJson
const SCHEMA = hello.props

// ---------------------------------------------------------------------------
// The fence and its props, as plain functions

describe('pins and fences', () => {
  test('a pin is a name and a whole version, or dev', () => {
    assert.deepEqual(parsePin('hello@3'), { name: 'hello', version: 3 })
    assert.deepEqual(parsePin(' grain-cross-section@dev '), { name: 'grain-cross-section', version: 'dev' })
    for (const bad of ['hello', 'hello@', 'hello@0', 'hello@1.5', 'hello@latest', 'Hello@1', '-x@1', 'hello@1 extra', '', null]) assert.equal(parsePin(bad), null, String(bad))
  })

  test('fences are found with their pin and body, and other fences are stepped over', () => {
    const md = [
      'Intro.',
      '',
      '```widget hello@2',
      'count: 3',
      'shape: dots',
      '```',
      '',
      '````md',
      '```widget quoted@1',
      '```',
      '````',
      '',
      '~~~widget other@dev',
      '~~~',
      '',
      '```widget',
      'count: 1',
      '```',
      '',
      '```widget open@1',
      'count: 9',
    ].join('\n')
    const fences = findFences(md)
    assert.deepEqual(
      fences.map((f) => ({ info: f.info, pin: f.pin, body: f.body, text: md.slice(f.from, f.to) })),
      [
        { info: 'hello@2', pin: { name: 'hello', version: 2 }, body: 'count: 3\nshape: dots', text: '```widget hello@2\ncount: 3\nshape: dots\n```' },
        { info: 'other@dev', pin: { name: 'other', version: 'dev' }, body: '', text: '~~~widget other@dev\n~~~' },
        { info: '', pin: null, body: 'count: 1', text: '```widget\ncount: 1\n```' },
        { info: 'open@1', pin: { name: 'open', version: 1 }, body: 'count: 9', text: '```widget open@1\ncount: 9' },
      ],
    )
    assert.deepEqual(findFences('```widgets x@1\n```\n```js\nwidget\n```'), [], 'only a fence whose language is widget')
  })

  test('props are read against the schema, with defaults for what is missing or bad', () => {
    assert.deepEqual(readProps('', SCHEMA), { props: defaults(SCHEMA), problems: [] })
    assert.deepEqual(readProps('count: 7\nshape: diamonds\nanimate: false\ncaption: Hi: there, you', SCHEMA), {
      props: { count: 7, shape: 'diamonds', animate: false, caption: 'Hi: there, you' },
      problems: [],
    })
    const bad = readProps('count: lots\nshape: hexagons\nanimate: maybe\ncolour: red\nnot a line\n\ncount: 40\ncaption:', SCHEMA)
    assert.deepEqual(bad.props, { count: 5, shape: 'bars', animate: true, caption: '' })
    assert.deepEqual(bad.problems, [
      'count: "lots" is not a number, so the default (5) is used',
      'shape: "hexagons" is not one of bars, dots, diamonds, so the default (bars) is used',
      'animate: "maybe" is not true or false, so the default (true) is used',
      '"colour" is not a setting of this widget, so it is ignored',
      'Line 5 is not key: value, so it is ignored',
      '"count" is set twice; the last one counts',
      'count: 40 is outside 1 to 12, so the default (5) is used',
    ])
  })

  test('props round-trip through the fence body', () => {
    const cases = [
      defaults(SCHEMA),
      { count: 1, shape: 'dots', animate: false, caption: 'One: two, three' },
      { count: 12, shape: 'diamonds', animate: true, caption: 'true' },
      { count: 2.5, shape: 'bars', animate: false, caption: '42' },
    ]
    for (const props of cases) {
      const body = propsBody(SCHEMA, props)
      assert.deepEqual(readProps(body, SCHEMA), { props, problems: [] }, body)
    }
    const fence = fenceText({ name: 'hello', version: 4 }, SCHEMA)
    assert.equal(fence, '```widget hello@4\ncount: 5\nshape: bars\nanimate: true\ncaption: Click a shape to pick it.\n```')
    const [found] = findFences(`Before.\n\n${fence}\n\nAfter.`)
    assert.deepEqual(readProps(found!.body, SCHEMA).props, defaults(SCHEMA))
  })

  test('setting a prop rewrites its line in place and nothing else', () => {
    const body = 'count: 3\n# a note\nshape: dots\nshape: bars'
    assert.equal(setProp(body, 'count', 9), 'count: 9\n# a note\nshape: dots\nshape: bars')
    assert.equal(setProp(body, 'shape', 'diamonds'), 'count: 3\n# a note\nshape: dots\nshape: diamonds', 'the line that counts, the last')
    assert.equal(setProp(body, 'animate', false), 'count: 3\n# a note\nshape: dots\nshape: bars\nanimate: false')
    assert.equal(setProp('count: 3\n\n', 'caption', 'Two\nlines '), 'count: 3\ncaption: Two lines\n\n')
    assert.equal(setProp('', 'count', 2), 'count: 2')
  })

  test('the closed card says the settings in words', () => {
    assert.equal(propsSummary(SCHEMA, { count: 3, shape: 'dots', animate: false, caption: 'Hi' }), 'count: 3, shape: Dots, animate: off, caption: "Hi"')
  })

  test("widget.json is checked, and hello's passes", () => {
    assert.deepEqual(checkWidgetJson(hello, 'hello'), [])
    assert.deepEqual(checkWidgetJson({ ...hello, id: 'hello' }, 'other'), ['id "hello" is not the folder\'s name "other"'])
    const broken = {
      ...hello,
      size: { aspectRatio: '16/9; color: red' },
      props: [
        { key: 'a', label: 'A', type: 'enum', default: 'x', options: [{ value: 'y', label: 'Y' }] },
        { key: 'b', label: 'B', type: 'number', default: 20, min: 0, max: 10 },
        { key: 'a', label: 'A again', type: 'boolean', default: true },
        { key: 'c', label: 'C', type: 'colour', default: '#fff' },
      ],
    }
    assert.deepEqual(checkWidgetJson(broken, 'hello'), [
      'size needs an aspectRatio such as "16 / 9" or a height in pixels',
      'prop "a": the default is not one of its options',
      'prop "b": the default is not between min and max',
      'prop "a": given twice',
      'prop "c": type must be enum, number, boolean or string',
    ])
    assert.equal(sizeStyle({ aspectRatio: '16 / 9' }), 'aspect-ratio: 16 / 9')
    assert.equal(sizeStyle({ height: 240 }), 'min-height: 240px')
    assert.equal(sizeStyle({ aspectRatio: '1; background: red' }), '')
  })

  test('every widget keeps an exact copy of the contract', () => {
    const contract = readFileSync(join(root, 'src/lib/widgetContract.ts'), 'utf8')
    const folders = readdirSync(join(root, 'widgets'), { withFileTypes: true }).filter((d) => d.isDirectory())
    assert.ok(folders.length > 0)
    for (const folder of folders) {
      const copy = join(root, 'widgets', folder.name, 'src/contract.ts')
      assert.ok(existsSync(copy), `${folder.name} has src/contract.ts`)
      assert.equal(readFileSync(copy, 'utf8'), contract, `${folder.name}'s contract is the site's`)
    }
  })
})

// ---------------------------------------------------------------------------
// The site, over a scratch widgets folder and a scratch media directory

type Markdown = typeof import('../src/server/markdown.ts')
type Actions = typeof import('../src/server/postActions.ts')
type Editor = typeof import('../src/server/editor.ts')
type Server = typeof import('../src/server/mcp/server.ts')

const AWS = ['AWS_ENDPOINT_URL', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET_NAME', 'AWS_DEFAULT_REGION'] as const

let s: Awaited<ReturnType<typeof scratch>>
let app: Awaited<ReturnType<typeof site>>
let markdown: Markdown
let actions: Actions
let editor: Editor
let media: Handler
let widgetsDir: string
let assets: string
let cookie: string

/// A widget with no dependencies whose build is a node one-liner: index.js
/// and an asset beside it.
const TINY: WidgetJson = {
  id: 'tiny',
  name: 'Tiny',
  description: 'A widget for the tests.',
  build: { command: 'node build.mjs', output: 'dist' },
  size: { aspectRatio: '3 / 1' },
  props: [
    { key: 'n', label: 'N', type: 'number', default: 2, min: 0, max: 9 },
    { key: 'word', label: 'Word', type: 'string', default: 'hi' },
  ],
}

async function fixture(name: string, widget: WidgetJson, build = '') {
  const dir = join(widgetsDir, name)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'widget.json'), JSON.stringify(widget, null, 2))
  await writeFile(
    join(dir, 'build.mjs'),
    build ||
      [
        "import { mkdirSync, writeFileSync } from 'node:fs'",
        "mkdirSync('dist/assets', { recursive: true })",
        "writeFileSync('dist/index.js', 'export function mount(el, { props }) { el.textContent = JSON.stringify(props); return { update() {}, destroy() {} } }\\n')",
        "writeFileSync('dist/assets/dot.svg', '<svg xmlns=\"http://www.w3.org/2000/svg\"/>')",
        "writeFileSync('dist/.hidden', 'not published')",
      ].join('\n'),
  )
  return dir
}

const manifestPath = () => join(widgetsDir, 'manifest.json')
const writeManifest = (m: Manifest) => writeFile(manifestPath(), JSON.stringify(m, null, 2))
const quiet = () => {}

/// Runs [fn] inside a request of Start's own carrying [cookie], as
/// test/admin.test.ts does, so isAdmin() reads its session.
function asAdmin<T>(fn: () => Promise<T>): Promise<T> {
  const storage = (globalThis as Record<symbol, { run: (store: unknown, fn: () => Promise<T>) => Promise<T> } | undefined>)[Symbol.for('tanstack-start:event-storage')]
  assert.ok(storage, "Start's request store is loaded")
  const request = new Request('http://localhost/_serverFn/x', { method: 'POST', headers: { cookie } })
  return storage.run({ request, requestUrl: new URL(request.url) }, fn)
}

before(async () => {
  for (const k of AWS) delete process.env[k]
  delete process.env.ASSETS_FALLBACK_URL
  widgetsDir = await mkdtemp(join(tmpdir(), 'sc-widgets-'))
  assets = await mkdtemp(join(tmpdir(), 'sc-widget-media-'))
  process.env.WIDGETS_DIR = widgetsDir
  process.env.ASSETS_DIR = assets
  s = await scratch('widgets')
  app = await site(s.url)
  markdown = await app.load<Markdown>('/src/server/markdown.ts')
  actions = await app.load<Actions>('/src/server/postActions.ts')
  editor = await app.load<Editor>('/src/server/editor.ts')
  media = await handler(app.load, '/src/routes/media/$.ts', 'GET')
  cookie = (await signedIn(s)).cookie
})

beforeEach(async () => {
  await rm(widgetsDir, { recursive: true, force: true })
  await rm(assets, { recursive: true, force: true })
  await mkdir(widgetsDir, { recursive: true })
  await mkdir(assets, { recursive: true })
  await writeManifest({
    hello: { versions: [{ version: 1, date: '2026-11-09T12:00:00.000Z', files: [{ path: 'index.js', size: 10, type: 'text/javascript; charset=utf-8' }], hash: 'sha256-x', widget: hello }] },
  })
  await s.rows('DELETE FROM blog_posts')
})

after(async () => {
  delete process.env.WIDGETS_DIR
  await app?.close()
  await s?.drop()
  await rm(widgetsDir, { recursive: true, force: true })
  await rm(assets, { recursive: true, force: true })
})

const attr = (html: string, name: string) => {
  const m = new RegExp(`${name}="([^"]*)"`).exec(html)
  return m ? m[1]!.replace(/&quot;/g, '"').replace(/&amp;/g, '&') : null
}

describe('the placeholder in a post', () => {
  test('a pinned version renders a sized placeholder carrying its module and props, holding the fallback line', async () => {
    const html = await markdown.renderMarkdown('Before.\n\n```widget hello@1\ncount: 3\nshape: dots\ncolour: red\n```\n\nAfter.', { url: '/blog/a-post' })
    assert.match(html, /<p>Before.<\/p>\n?<div class="widget"/)
    assert.equal(attr(html, 'data-widget'), 'hello@1')
    assert.equal(attr(html, 'data-widget-src'), '/media/widgets/hello/1/index.js')
    assert.deepEqual(JSON.parse(attr(html, 'data-widget-props')!), { count: 3, shape: 'dots', animate: true, caption: 'Click a shape to pick it.' })
    assert.equal(attr(html, 'style'), 'min-height: 240px')
    assert.match(html, /<p class="widget__fallback"><a href="\/blog\/a-post">Interactive demo: open on the site<\/a><\/p><\/div>/)
    assert.doesNotMatch(html, /<pre|<code/, 'not drawn as a code block')
    assert.match(await markdown.renderMarkdown('```widget hello@1\n```'), /<p class="widget__fallback">Interactive demo: open on the site<\/p>/, 'no address, no link')
  })

  test('a widget or version that does not exist, or a fence with no pin, renders the fallback with the reason for the admin', async () => {
    for (const [fence, error] of [
      ['```widget nope@1\n```', 'No widget is named "nope"'],
      ['```widget hello@7\n```', 'hello has no published version 7'],
      ['```widget\ncount: 2\n```', 'A widget fence needs a name and version, as in widget hello@1'],
      ['```widget hello\n```', '"widget hello" pins no widget: write it as widget {name}@{version}, as in widget hello@1'],
    ]) {
      const html = await markdown.renderMarkdown(fence, { url: 'https://schier.test/blog/x' })
      assert.equal(attr(html, 'data-widget-error'), error, fence)
      assert.equal(attr(html, 'data-widget-src'), null)
      assert.match(html, /Interactive demo: open on the site/)
    }
  })

  test('a dev pin loads the local build on the dev server, and is only the fallback in production', async () => {
    await fixture('tiny', TINY)
    let html = await markdown.renderMarkdown('```widget tiny@dev\nn: 4\n```')
    assert.equal(attr(html, 'data-widget-error'), 'tiny has not been built yet: run npm run widget:dev tiny')
    await mkdir(join(widgetsDir, 'tiny/dist'), { recursive: true })
    await writeFile(join(widgetsDir, 'tiny/dist/index.js'), 'export function mount() {}')
    html = await markdown.renderMarkdown('```widget tiny@dev\nn: 4\n```')
    assert.match(attr(html, 'data-widget-src')!, /^\/__widgets\/tiny\/index\.js\?v=\d+$/)
    assert.deepEqual(JSON.parse(attr(html, 'data-widget-props')!), { n: 4, word: 'hi' })
    assert.equal(attr(html, 'style'), 'aspect-ratio: 3 / 1')

    process.env.NODE_ENV = 'production'
    try {
      html = await markdown.renderMarkdown('```widget tiny@dev\n```')
      assert.equal(attr(html, 'data-widget-src'), null)
      assert.match(attr(html, 'data-widget-error')!, /^No widget is named "tiny"|only the dev server runs/)
    } finally {
      delete process.env.NODE_ENV
    }
  })

  test('a post with no widget fence renders as it did', async () => {
    const html = await markdown.renderMarkdown('```js\nconst widget = 1\n```\n\nwidget hello@1')
    assert.doesNotMatch(html, /class="widget"/)
  })
})

describe('publishing a post with widgets', () => {
  const draft = (content: string) => actions.createPost({ title: `Widgets ${Math.random().toString(36).slice(2, 8)}`, content })

  test('a dev pin is refused, plainly', async () => {
    const post = await draft('Words.\n\n```widget hello@dev\n```')
    await assert.rejects(actions.publishPost(post.id), (error: Error) => {
      assert.ok(actions.isRefusal(error))
      assert.match(error.message, /cannot be published yet\. It pins hello@dev, a local build: use Prepare for publish in the editor/)
      return true
    })
    assert.equal((await actions.getPost(post.id)).published, false)
  })

  test('a dev pin in a list item or a quote, which the page renders as a widget, is refused too', async () => {
    for (const content of ['- A step:\n\n    ```widget hello@dev\n    ```', '> ```widget hello@dev\n> count: 2\n> ```']) {
      assert.match(await markdown.renderMarkdown(content), /data-widget="hello@dev"/, 'rendered as a widget')
      const post = await draft(`Words.\n\n${content}`)
      await assert.rejects(actions.publishPost(post.id), /It pins hello@dev, a local build/)
    }
    // And a published pin there, or in a fence of four backticks, runs.
    for (const content of ['> ```widget hello@1\n> ```', '````widget hello@1\n````']) {
      assert.equal(attr(await markdown.renderMarkdown(content), 'data-widget-src'), '/media/widgets/hello/1/index.js', content)
    }
  })

  test("a published post's content is held to the same, and a draft's is not", async () => {
    const post = await draft('Words.\n\n```widget hello@1\n```')
    await actions.publishPost(post.id)
    await assert.rejects(actions.updatePost(post.id, { content: 'Words.\n\n```widget hello@dev\n```' }), /is published, so this cannot be saved yet\. It pins hello@dev, a local build/)
    assert.match((await actions.getPost(post.id)).content, /hello@1/)
    assert.equal((await actions.updatePost(post.id, { content: 'Other words.\n\n```widget hello@1\ncount: 3\n```' })).published, true)
    const other = await draft('Words.')
    assert.match((await actions.updatePost(other.id, { content: '```widget hello@dev\n```' })).content, /hello@dev/)
  })

  test('a version or widget missing from the manifest is refused, and so is a fence with no pin', async () => {
    for (const [content, said] of [
      ['```widget hello@2\n```', /It pins hello@2, which is not in widgets\/manifest\.json/],
      ['```widget gone@1\n```', /It pins gone@1, which is not in widgets\/manifest\.json/],
      ['```widget\n```', /pins no widget/],
    ] as const) {
      const post = await draft(`Words.\n\n${content}`)
      await assert.rejects(actions.publishPost(post.id), said)
    }
  })

  test('a published version publishes', async () => {
    const post = await draft('Words.\n\n```widget hello@1\ncount: 2\n```\n\n````md\n```widget quoted@dev\n```\n````')
    assert.equal((await actions.publishPost(post.id)).published, true)
  })
})

describe('list_widgets', () => {
  test('lists each published widget with its versions, the latest schema and a fence', async () => {
    const tiny2 = { ...TINY, name: 'Tiny two' }
    await writeManifest({
      tiny: {
        versions: [
          { version: 2, date: '2026-11-09T13:00:00.000Z', files: [], hash: 'sha256-b', widget: tiny2 },
          { version: 1, date: '2026-11-09T12:00:00.000Z', files: [], hash: 'sha256-a', widget: TINY },
        ],
      },
    })
    await fixture('local-only', { ...TINY, id: 'local-only' })
    const mcp = await app.load<Server>('/src/server/mcp/server.ts')
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    await mcp.createAdminServer().connect(serverSide)
    const client = new Client({ name: 'test', version: '0.0.0' })
    await client.connect(clientSide)
    try {
      const result = (await client.callTool({ name: 'list_widgets', arguments: {} })) as { isError?: boolean; content: { text: string }[] }
      assert.ok(!result.isError, result.content[0]?.text)
      assert.deepEqual(JSON.parse(result.content[0]!.text), [
        {
          name: 'tiny',
          title: 'Tiny two',
          description: 'A widget for the tests.',
          versions: [1, 2],
          latest: 2,
          props: TINY.props,
          fence: '```widget tiny@2\nn: 2\nword: hi\n```',
        },
      ])
    } finally {
      await client.close()
    }
  })
})

describe('scripts/widget-publish.mjs, to a directory', () => {
  const env = () => ({ ASSETS_DIR: assets })

  test('builds the widget, uploads it as version 1 and records it in the manifest', async () => {
    await fixture('tiny', TINY)
    const lines: string[] = []
    const entry = await publishWidget('tiny', { widgetsDir, env: env(), log: (l) => lines.push(l) })
    assert.equal(entry.version, 1)
    assert.deepEqual(entry.files, [
      { path: 'assets/dot.svg', size: '<svg xmlns="http://www.w3.org/2000/svg"/>'.length, type: 'image/svg+xml' },
      { path: 'index.js', size: readFileSync(join(widgetsDir, 'tiny/dist/index.js')).length, type: 'text/javascript; charset=utf-8' },
    ])
    assert.equal(entry.storage, 'disk')
    assert.deepEqual(entry.widget, TINY)
    assert.ok(lines.some((l) => l.includes('$ node build.mjs')))
    assert.ok(lines.some((l) => /do not commit this manifest entry/.test(l)))

    // Stored as the site's storage keeps it, and served from /media/.
    assert.ok(existsSync(join(assets, 'widgets/tiny/1/index.js')))
    assert.ok(!existsSync(join(assets, 'widgets/tiny/1/.hidden')))
    const res = await media({ request: new Request('http://localhost/media/widgets/tiny/1/index.js'), params: { _splat: 'widgets/tiny/1/index.js' } })
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'text/javascript; charset=utf-8')
    assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable')
    assert.match(await res.text(), /export function mount/)

    // The manifest has it beside what was there, with a hash of the files.
    const manifest = await readManifest(manifestPath())
    assert.deepEqual(Object.keys(manifest), ['hello', 'tiny'])
    assert.deepEqual(manifest.tiny!.versions, [JSON.parse(JSON.stringify(entry))])
    const files = ['assets/dot.svg', 'index.js'].map((path) => ({ path, body: readFileSync(join(widgetsDir, 'tiny/dist', path)), type: '' }))
    assert.equal(entry.hash, contentHash(files))
    assert.match(entry.hash, /^sha256-[0-9a-f]{64}$/)

    // Then the page can pin it.
    const html = await markdown.renderMarkdown('```widget tiny@1\nword: yo\n```')
    assert.equal(attr(html, 'data-widget-src'), '/media/widgets/tiny/1/index.js')
  })

  test('counts up, past any version storage already has, and never overwrites one', async () => {
    await fixture('tiny', TINY)
    assert.equal((await publishWidget('tiny', { widgetsDir, env: env(), log: quiet })).version, 1)
    assert.equal((await publishWidget('tiny', { widgetsDir, env: env(), log: quiet })).version, 2)
    // A version in storage the manifest lacks (published from elsewhere).
    await mkdir(join(assets, 'widgets/tiny/5'), { recursive: true })
    await writeFile(join(assets, 'widgets/tiny/5/index.js'), 'export function mount() {}')
    assert.equal((await publishWidget('tiny', { widgetsDir, env: env(), log: quiet })).version, 6)
    assert.deepEqual(
      (await readManifest(manifestPath())).tiny!.versions.map((v) => v.version),
      [1, 2, 6],
    )
    const before = await readFile(join(assets, 'widgets/tiny/2/index.js'), 'utf8')
    await assert.rejects(putVersion(widgetStorage(env()), 'tiny', 2, [{ path: 'index.js', body: Buffer.from('changed'), type: 'text/javascript' }]), {
      name: 'PublishError',
      message: /tiny@2 is already in .* a published version is never overwritten/,
    })
    assert.equal(await readFile(join(assets, 'widgets/tiny/2/index.js'), 'utf8'), before)
  })

  test('two publishes at once cannot both take a version', async () => {
    await fixture('tiny', TINY)
    const results = await Promise.allSettled([1, 2].map(() => publishWidget('tiny', { widgetsDir, env: env(), log: quiet })))
    const done = results.filter((r) => r.status === 'fulfilled')
    const refused = results.filter((r) => r.status === 'rejected')
    assert.equal(done.length, 1, 'one publishes')
    assert.equal(done[0]!.value.version, 1)
    assert.equal(refused.length, 1, 'the other is refused')
    assert.match(String(refused[0]!.reason.message), /tiny@1 is already in .* never overwritten/)
    // A claimed version's folder counts, even if its upload failed.
    await mkdir(join(assets, 'widgets/tiny/2'))
    assert.equal((await publishWidget('tiny', { widgetsDir, env: env(), log: quiet })).version, 3)
  })

  test('refuses a bad name, a missing folder, a bad widget.json and a failed build, plainly', async () => {
    await assert.rejects(publishWidget('../etc', { widgetsDir, env: env(), log: quiet }), { name: 'PublishError', message: /is not a widget's name/ })
    await assert.rejects(publishWidget('ghost', { widgetsDir, env: env(), log: quiet }), { name: 'PublishError', message: /There is no widget folder/ })
    await fixture('broken', { ...TINY, id: 'broken', props: [{ key: 'n', label: 'N', type: 'number', default: 20, min: 0, max: 9 } as PropSpec] })
    await assert.rejects(publishWidget('broken', { widgetsDir, env: env(), log: quiet }), { name: 'PublishError', message: /prop "n": the default is not between min and max/ })
    await fixture('failing', { ...TINY, id: 'failing' }, "console.error('the build broke'); process.exit(3)")
    await assert.rejects(publishWidget('failing', { widgetsDir, env: env(), log: quiet }), { name: 'PublishError', message: /node build.mjs failed \(exit 3\)[\s\S]*the build broke/ })
    await fixture('empty', { ...TINY, id: 'empty' }, '// writes nothing')
    await assert.rejects(publishWidget('empty', { widgetsDir, env: env(), log: quiet }), { name: 'PublishError', message: /the build wrote no dist\/index.js/ })
    assert.deepEqual(Object.keys(await readManifest(manifestPath())), ['hello'], 'nothing recorded')
    assert.ok(!existsSync(join(assets, 'widgets')), 'nothing uploaded')
  })

  test("the editor's Prepare for publish publishes each dev pin through the same code, on the dev server", async () => {
    await fixture('tiny', TINY)
    await cp(join(widgetsDir, 'tiny'), join(widgetsDir, 'other'), { recursive: true })
    await writeFile(join(widgetsDir, 'other/widget.json'), JSON.stringify({ ...TINY, id: 'other' }))
    const out = await asAdmin(() => editor.prepareWidgets({ names: ['tiny', 'other', 'tiny'] }))
    assert.ok(out.ok, !out.ok ? out.error : '')
    assert.deepEqual(out.value.versions, { tiny: 1, other: 1 })
    assert.equal(out.value.failed, null)
    assert.deepEqual(
      out.value.widgets.filter((w) => w.versions.length).map((w) => [w.name, w.versions.map((v) => v.version)]),
      [
        ['hello', [1]],
        ['other', [1]],
        ['tiny', [1]],
      ],
    )
    assert.ok(existsSync(join(assets, 'widgets/other/1/index.js')))

    const missing = await asAdmin(() => editor.prepareWidgets({ names: ['tiny', 'ghost'] }))
    assert.ok(missing.ok)
    assert.deepEqual(missing.value.versions, { tiny: 2 })
    assert.match(missing.value.failed!, /^ghost was not published: There is no widget folder/)
  })
})
