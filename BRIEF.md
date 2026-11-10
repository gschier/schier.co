# schier.co port

Greg's personal site and blog, ported from Go (gorilla/mux, pongo2
templates, Parcel 1 frontend) to TanStack Start, modelled on Platform
Pixels' `web/` (`~/Workspace/platformpixels2/web`). This file holds the
product decisions, dated. Decisions are Greg's. Where a task conflicts with
this file, say so and stop rather than guess.

## Goals (2026-10-13)

- One stack across Greg's projects: TanStack Start, React, Prisma on
  Postgres, Tailwind 4, Railway.
- Write more. An admin MCP so posts can be drafted, edited and published
  from agents and, later, a mobile companion.
- Port first, redesign after. The port reproduces the current site's
  pages, URLs, feeds and behaviour so it can be checked against the running
  Go site. The visual redesign is a separate project on the new stack.
- Off DigitalOcean Spaces and Mailjet: images in a Railway bucket, email
  through Resend.

## Where it lives

- The new app was built in `web/` beside the Go code, then on
  2026-10-13 ("No need to keep the go site. It's in git already") the Go
  code was deleted and `web/` moved to the repo root in the same commit.
  Paths in this file written as `web/...` are now relative to the root.
- Production is the Railway project `schier.co` (workspace Schier.co),
  services Web and Postgres. At cutover the Web service builds the app
  from the repo root with Railpack; the Postgres service stays and Prisma
  takes over its schema with a baseline migration. No data moves.
- A Railway bucket `assets` is created in the project at cutover and its
  credentials referenced into the Web service as the AWS_* variables.

## Stack

As Platform Pixels' `web/`, which is the reference for layout, config and
conventions:

- TanStack Start (React 19), file routes under `src/routes`, server
  functions for admin actions, server route handlers for feeds, MCP and
  assets. Vite 8, Nitro, TypeScript 6 strict, `#/` alias for `src/`.
- Tailwind 4 via the Vite plugin, one `src/styles.css`.
- Prisma 7 with `@prisma/adapter-pg`, client generated into
  `src/generated/prisma`, migrations in `prisma/migrations`, run by
  `npm run migrate` as the Railway pre-deploy command.
- Local Postgres from `web/docker-compose.yml` on host port 5439
  (5433 is Platform Pixels', 5438 the old Go compose's).
- Markdown: unified (remark-parse, remark-gfm, remark-rehype,
  rehype-stringify) with Shiki for code blocks, rendered on the server.
  Must reproduce what the Go renderer does: headings get id anchors,
  links open in a new tab with noopener, code blocks are highlighted.
- Markdown, built 2026-10-13 (`src/server/markdown.ts`,
  `test/markdown.test.ts`): 122 of 123 published posts render identically
  to the Go site. Accepted differences: the post
  `simple-vanilla-javascript-typing-carousel` writes `&lt;span&gt;` in its
  markdown and blackfriday escaped it a second time, so the live site shows
  the entity text; the port shows `<span>` as the author meant, and the
  test exempts that post. Code blocks are highlighted by Shiki (`pre.shiki`
  with inline colours) where Go used chroma classes; the code text is
  compared and must match, the highlighting markup is not. The port's
  stylesheet therefore needs its own `pre` and `code` styles rather than
  the Go site's `syntax.css`.
- Sentry (server) and OpenPanel (page views), both off until their
  variables are set, exactly as Platform Pixels wires them.
- Tests with `node --test` against a scratch database the tests create,
  never the compose one.
- No SDKs for S3 or Resend: hand-signed S3 calls copied from Platform
  Pixels' `src/server/s3.ts`, and a Resend mailer modelled on Kabook's
  `crates/server/src/mail.rs` (plain HTTP to `https://api.resend.com/emails`).

## Data

Prisma models over the existing tables, keeping column names so the
baseline migration is a no-op on production:

- `BlogPost`: id, createdAt, updatedAt, userId, content, date, editedAt,
  image, summary, published, score, shares, slug, stage, title, unlisted,
  views, votesTotal, votesUsers, tags (text[]), donations.
- `User`, `Session`: carried over for the data; see Admin.
- `NewsletterSubscriber`: id, createdAt, updatedAt, email, name,
  unsubscribed.
- `NewsletterSend`: id, createdAt, description, key, recipients.

## Pages and routes

Every public URL the Go router serves, with the same output. Redirects it
performs (old `/tags/{tag}`, `/blog/{slug}.html`, year-month-day slugs,
`/rss.xml`) are kept. Redirects for anything dropped go in the brief
before it is dropped.

- `/` home with the five most recent posts.
- `/blog`, `/blog/page/{n}`, `/blog/tags`, `/blog/tags/{tag}`,
  `/blog/search`, `/blog/{slug}`, `/blog/rss.xml`.
- `/blog/share/{slug}/{platform}` and `/blog/donate/{slug}` counters.
- `/projects`, `/books`.
- `/newsletter`, `/newsletter/thanks`, `/newsletter/unsubscribe/{id}`,
  `POST /forms/newsletter/subscribe`.
- `/robots.txt`, `/debug/health`.
- `/media/{key}` serves stored objects (see Images).
- `/mcp` the admin MCP.
- `/login`, `/logout`, `/register` (only with `REGISTRATION=enable`), and
  `/admin` with the editor, replacing `/blog/new` and `/blog/drafts`.

Votes and donations are carried as data. Their public UI (vote button,
donate link) is ported as-is for now; dropping it is a redesign decision.

Built 2026-10-13 (`src/server/posts.ts`, `views.ts`, `rss.ts`,
`src/components/site.tsx`, the routes, `src/styles.css`, 30 tests,
`scripts/compare-sites.mjs`, `scripts/screenshots.mjs`). The RSS feed
matches Go's item for item, and 20 screenshot pairs match apart from code
token colours. Decisions taken there:

- Views, shares, votes and donate clicks bump only their counter. Go
  saved the whole post on each, which set `edited_at` to the last view
  time; that was a bug and is not copied.
- Go's "Updated {date}" notice never showed (its date parse failed); the
  port leaves it out.
- `/blog/donate/{slug}` counts a share, as Go did; the `donations` column
  is never written by the site. (Earlier wording above saying "donations"
  was wrong.)
- Posts with the same date are ordered by id as a tiebreak so a group
  never splits across pages; recommended posts with equal scores are
  newest first.
- Forms are protected by an origin check on POST instead of Go's CSRF
  token. The vote endpoint is `/api/blog/vote`.
- The old `t.schier.co` analytics script is not ported; OpenPanel takes
  over.
- Admin URLs are `/admin` (drafts and posts), `/admin/new` and
  `/admin/edit/{id}`, from `adminLinks` in `src/components/site.tsx`;
  sign-in is `/login`, sign-out `/logout`. `/blog/drafts` and `/blog/new`
  are 404.
- Favicons and images live under `/static/...` as on the Go site.

## Admin and auth

- Greg is the only author. Sign-in is the login form, as on the Go site
  (decided 2026-10-13 after cutover: "I want the login form back. That
  was just a stop gap for pp"): `/login` with email and password checked
  against `users.password_hash` (bcrypt, `$2a$10$`), a row in `sessions`
  and a seven-day httpOnly cookie holding the session id, refreshed on
  each request as Go did; `/logout` deletes the session and clears the
  cookie. `/register` exists only while `REGISTRATION=enable`, as in Go.
  The token sign-in at `/admin?token=` is removed; `MCP_TOKEN` stays the
  bearer for `/mcp` only. The `users` and `sessions` tables are therefore
  kept for good. Built 2026-10-13 (`src/server/auth.ts`, a request
  middleware in `src/start.ts` that refreshes the cookie, 16 tests).
  Decisions taken there: sign-in lands on `/admin` (Go went to `/`); a
  wrong email takes as long as a wrong password; a stale cookie is
  cleared; new hashes are `$2b$`, old `$2a$` still check; sessions never
  expire on the server, as in Go, and the 83 rows copied from production
  stay valid, so server-side expiry is a follow-up.
- The MCP at `/mcp`: streamable HTTP, stateless, bearer `MCP_TOKEN`,
  JSON responses. Tools: list posts (with drafts), get a post, create or
  update a draft, publish, unpublish, unlist, delete, render a markdown
  preview, upload an image, and send a post to the newsletter with a
  dry-run that returns the rendered email.
- Built 2026-10-13 (`src/server/postActions.ts`, `src/server/mcp/server.ts`,
  `src/routes/mcp.ts`, 15 tests). Decisions taken there, differing from
  Go: a published post's slug cannot change (unpublish first; Go silently
  kept the old slug); `editedAt` moves only when content changes (Go moved
  it on every save); publishing refuses an empty title or content; uploads
  take only `image/*` up to 25 MB; slugs turn non-Latin scripts into
  dashes where Go transliterated them; `delete_post` has no confirm step.
  Refusals are tool errors with a plain message and are not sent to
  Sentry; other failures are.
- Built 2026-10-13 (`src/routes/admin/*`, `src/components/editor.tsx`,
  `src/server/editor.ts`, `src/lib/adminFns.ts`,
  `src/routes/api/admin/upload.ts`, 11 tests, `scripts/editor-check.mjs`
  as the reusable browser check). Decisions taken there: admin pages
  answer the site's 404 page without the cookie; logout without a cookie
  is a 404, with any cookie it clears it; the date field is UTC; Save,
  Publish, Unlist and Send save unsaved changes first; Cmd-S saves and
  leaving with unsaved changes asks; there is no autosave (Go had none);
  an uploaded image's alt text is its file name, as in Go. Shiki renders
  github-light and github-dark with CSS variables, so dark mode needs no
  inversion. The admin tests reach Start's request store through its
  internal `tanstack-start:event-storage` symbol, which an update could
  change.
- The editor page: the current one is a custom CodeMirror-ish setup in
  `frontend/editor`. Port its behaviour (markdown textarea, live preview
  via the render endpoint, image upload, publish and unlist actions) as a
  plain React page. No need to keep its code.

## Images (2026-10-13)

- Railway buckets are private, so the site serves images itself:
  `/media/{key}` (was `/assets/`; renamed 2026-10-13 because Vite emits
  the site's own build files under `/assets/`) fetches the object from the bucket and returns it with
  its content type and `Cache-Control: public, max-age=31536000, immutable`.
  Keys are what they were in the Space: `images/...`, `avatar/...`,
  `other/...`.
- New uploads go to `images/a/{unix}{ext}` as before and posts reference
  them as `/media/images/a/...`.
- `scripts/migrate-assets.mjs` moves everything off DigitalOcean. It lists
  the Space `schierco` (endpoint `nyc3.digitaloceanspaces.com`, DO_SPACES_*
  credentials) under `images/`, `avatar/` and `other/`, copies each object
  to the bucket with its content type, skipping ones already present with
  the same size, then rewrites every post's `content` and `image` from
  `https://schierco.nyc3.cdn.digitaloceanspaces.com/` and
  `https://schierco.nyc3.digitaloceanspaces.com/` to `/media/`. Idempotent;
  prints what it did; `--dry-run` only reports. `db-backups/` (951 stale
  20-byte files) is not copied.
- The Space stays up for a while after cutover for inbound links from
  elsewhere, then Greg deletes it.
- Local development needs no bucket (2026-10-13, "I want dev to be very
  fast"). Object storage sits behind one small interface,
  `src/server/storage.ts`, with two backends: the Railway bucket when the
  AWS_* variables are set, else a directory on disk, `ASSETS_DIR`
  (default `web/.media`, gitignored). `/media/{key}` and uploads use
  whichever is configured. In dev, a key missing from the directory is
  fetched once from `ASSETS_FALLBACK_URL` if set (the Space's CDN while it
  lives) and saved to the directory, so real posts show their images on
  the first visit without a copy step. `railway dev` does not emulate
  buckets (its generated compose holds only the Postgres service), so this
  is the local story.
- Built 2026-10-13: the route, `uploadImage`, and
  `scripts/migrate-assets.mjs`. Decision taken there: if any object fails
  to copy, the script does not rewrite posts, so no post ever points at an
  image the bucket lacks; a second run finishes the job.
- Postgres stays the only database, locally too. SQLite would mean a
  second dialect (the `tags text[]` column, the baseline migration, the
  scratch-database tests) for no speed the local container does not
  already give.

Space contents on 2026-10-13: images/ 273 objects 259 MB, avatar/ 5,
other/ 5, db-backups/ 951 (6 MB, not needed).

## Newsletter (2026-10-13)

- Subscribers and sends stay in Postgres as they are.
- Mailjet goes. Email is sent through Resend's HTTP API from `MAIL_FROM`
  (a verified subdomain, to be set up in Resend), with replies to Greg's
  address. With no `RESEND_API_KEY` the email is logged, not sent, so
  local runs and tests need no key. Tests use a recording fake.
- Two emails, as plain functions returning text and HTML: welcome on
  subscribe, and new post. Keep them minimal; Greg wants to rework what
  the newsletter sends, so they only need to be correct, not final.
- Sending a post is an admin action (editor button and MCP tool). A
  `NewsletterSend` row with key `post:{slug}` prevents a second send, and
  so do the Go site's old rows keyed by post id. As in Go, only a post
  dated within the last 24 hours can be sent, so publishing a post must
  set its `date` to now (Go set it at creation; the new publish action
  sets it at publish). A test send to one address is recorded under a
  `TEST:` key and does not block the real send.
- Built 2026-10-13 (`src/server/mail.ts`, `emails.ts`, `newsletter.ts`).
  Decisions taken there: a welcome goes only to a new subscriber, not on
  re-subscribe; a failed welcome is logged, not an error to the
  subscriber; addresses match case-insensitively; the send row is written
  before the first email so two sends cannot overlap, and is deleted if
  every email failed so the post can be sent again.

## Editor (2026-11-09)

- The body is CodeMirror 6 with markdown and GFM, replacing the textarea.
  The syntax marks always stay visible, on every line; the text is styled
  around them: headings larger by level, bold and italic drawn, inline
  code and fenced blocks on a faint ground, links coloured, list marks and
  quotes dimmed, in the site's colours and its dark mode. The whole body
  stays in the mono face, as the textarea and the mockup have it (16px on
  a phone, so iOS does not zoom). Spelling is checked.
- The keys stay as they were: Tab inserts a tab, or indents the selected
  lines two spaces; Shift-Tab takes that back; Enter keeps the indent and
  continues no list; Cmd-S saves; Escape leaves full screen. Undo is
  CodeMirror's history, and an inserted or replaced image is one step of
  it.
- An image alone on its line shows its thumbnail, alt text, size and
  Replace under the line. An upload shows the local file dimmed with a
  running bar, and its markdown goes in only when the upload is done, so a
  save mid-upload stores no placeholder. An image inside a paragraph gets
  nothing.
- The preview stays server-rendered half a second after typing stops, and
  scrolls to the heading the cursor is under.
- Layout follows the mockup's breakpoints. 1200 wide and up: the site's
  nav, the title, Other Fields folded (saying what is in it), then body
  and preview side by side filling the window, each scrolling on its own,
  with the buttons under the body held on screen. 1000 to 1199: the same
  without the nav. Below 1000: one pane, with the way back and the state
  at the top and a bar at the bottom holding Preview or Write and Image on
  the left, Publish and Save on the right, riding above the on-screen
  keyboard. Write and Preview is that one control, not also in the top
  bar. Unlist, View, Delete and the newsletter move into Other Fields,
  which opens as a sheet; a refusal floats above the bar.
- The newsletter's status and buttons live in Other Fields at every size.
  The editor pages have no footer.
- The admin installs as an app: its own manifest (start `/admin`,
  standalone, the site's favicons and colours) and the iOS tags, on the
  admin's pages only; the public pages keep the site's manifest. No
  service worker; offline is not a goal.
- Nothing is lost: every change is kept in the browser's local storage
  under the post's id (one key for a new post) until a save succeeds. On
  opening, a kept copy that differs from the server's and is newer than
  its last change is offered with Restore and Discard, never restored
  silently. This replaces "there is no autosave" above.
- Left for the widget round: the widget card, the picker, Insert widget,
  fence rendering and the slash command. (Built in that round; see
  Widgets.)

## Widgets (2026-11-09)

Interactive demos inside posts, first round. `widgets/README.md` is the
contract for whoever writes one.

- A widget is a folder `widgets/<name>/`, a project of its own: its own
  `package.json`, lockfile and build, making one ES module (`index.js` in
  its output folder, with any assets it loads relative to
  `import.meta.url`). The site never installs or builds widgets: their
  `node_modules` and `dist` are gitignored, the site's `tsconfig.json`
  excludes the folder and Tailwind does not scan it, so the Railway build
  is unaffected.
- `widget.json`: id (the folder's name), name, description, build command,
  optional watch command, output folder, a size hint (`aspectRatio` or
  `height`) and the props schema, the site's own: key, label, optional help,
  default, and a type of `enum` (options with labels), `number` (min, max,
  step, unit), `boolean` or `string`. Checked by `checkWidgetJson`
  (`src/lib/widgets.ts`).
- The module exports `mount(element, { props })` returning
  `{ update(props), destroy() }`. It draws into a plain element (no iframe,
  no shadow DOM), keeps its styles under its own class and uses the site's
  CSS variables, which follow its light and dark themes. The types are
  `src/lib/widgetContract.ts`; each widget keeps an exact copy at
  `src/contract.ts`, and a test checks the copies match.
- Publishing is `npm run widget:publish <name>`
  (`scripts/widget-publish.mjs`): the widget's own `npm ci` and build, the
  next version (an integer from 1, one past the highest in the manifest or
  in storage), the output uploaded under `widgets/<name>/<version>/` through
  the site's storage (the bucket with the `AWS_*` variables, else
  `ASSETS_DIR`, in `src/server/storage.ts`'s layout), and the version
  recorded in the committed `widgets/manifest.json` with its date, files, a
  sha256 of the files and its whole `widget.json`. A version already in
  storage is refused: versions are immutable. `widgets/` is a storage key
  prefix, served at `/media/widgets/...` with the immutable cache header.
  One bucket serves dev and prod; production knows only the committed
  manifest.
- Decided in the build: a version published to the directory rather than
  the bucket is marked `"storage": "disk"` in the manifest and production
  ignores it, so a dev publish committed by mistake never points readers at
  a missing file; the script says so when it happens.
- A post pins one with a fence, ```` ```widget hello@1 ````, props as
  `key: value` lines read against that version's schema. An unknown key or
  a bad value falls back to the default and is listed on the editor's card;
  nothing throws. `src/server/markdown.ts` renders it as a `div.widget`
  carrying the pin, the module's address and the props, sized by the size
  hint, holding "Interactive demo: open on the site" linked to the post,
  which is what the feed shows (posters come later).
- The post page and the editor's preview mount widgets with
  `src/lib/widgetMount.ts`, loaded only when the post has a placeholder: a
  dynamic import per module address, once however often the post uses it.
  A preview re-render keeps a widget whose module did not change, moving its
  element into the new HTML and calling `update`. A fence naming a widget or
  version there is not shows the reason to the admin and the fallback to
  readers; a widget that fails to load or throws does the same.
- Dev versions: `<name>@dev`, on the dev server only, loads the local build
  from `/__widgets/<name>/` (a Vite middleware in `vite.config.ts`, so no
  such route exists in a production build, where a dev pin renders the
  fallback). `npm run widget:dev <name>` installs and runs the widget's
  watch; `/__widgets/events` tells open pages when a build changes, and they
  mount the new one with the props they had.
- Prepare for publish, in the editor on the dev server when the post has
  dev pins: lists them, publishes each through `publishWidget`, and repins
  the fences in one undoable change. Publishing a post refuses a dev pin, a
  version not in the manifest, or a widget fence with no pin
  (`publishPost`, so the editor and the MCP both refuse).
- The editor (after the mockup on the branch `stetta/tk_mw9rgdpu86gx556o`,
  `design/editor/`): a widget fence is a card, a CodeMirror block
  decoration hosting a React portal (`src/components/editor/widgetCard.tsx`).
  Closed: the name, the pin, the description and the settings in a line,
  with Edit and source. Open: a version control (published versions, and
  dev on the dev server), a form from the pinned version's schema (an enum
  of up to four short options is a segmented control, else a select; a
  number is a field with a slider; a boolean a toggle; a string a text
  field), and the fence's text folded under it with Edit it as text, which
  shows the fence as lines again with "show the card" to go back. Every
  form edit is a transaction on the fence's text, changing only the line
  it touches, and Cmd-Z and Cmd-Shift-Z inside the card are the body's undo
  and redo. Posters are not in this round, so the card has an icon where
  the mockup has one.
- The picker: Insert widget beside Upload image (and + in the phone's bottom
  bar), or a `/` alone on a line. It lists the manifest's widgets at their
  latest version and, on the dev server, the local folders as `@dev`, and
  inserts the fence with every default on lines of its own (in place of the
  slash). A popover under the line on two panes, a sheet on one. The
  mockup's "in N posts" count is left out.
- The MCP has `list_widgets`: each published widget's name, title,
  description, versions, latest version, its props schema and an example
  fence.
- The first widget is `widgets/hello`, Hello shapes: a row of bars, dots or
  diamonds to click, with count (number), shape (enum), animate (boolean)
  and caption (string), built with esbuild, its one dependency.
- Decided in the build: the editor's `<head>` moved to
  `src/components/editor/head.ts`. The admin routes imported it from the
  editor's module, which put the whole editor in the chunk every page loads;
  now the editor, its card and the widget loader load only on the editor's
  pages, and a post with no widget loads no widget code. The body's bar
  shows its three buttons as icons alone when the pane is under 640px wide.
- Not in this round: posters and screenshots, image resizing, variables
  shared between widgets, self-hosted fonts, the content architecture,
  widget analytics.

## Deploy

Push to `master` deploys, once the Web service points at `web/`. Pre-deploy
runs `npm run migrate`. Variables on the Web service after cutover:
`DATABASE_URL` (and `DIRECT_URL` only if a pooler is ever put in front of
it), `BASE_URL`, `MCP_TOKEN`, `AWS_ENDPOINT_URL`,
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET_NAME`,
`AWS_DEFAULT_REGION`, `RESEND_API_KEY`, `MAIL_FROM`, and optionally
`SENTRY_DSN`, `VITE_OPENPANEL_CLIENT_ID`, `VITE_OPENPANEL_API_URL`
(`https://op.mountainlooplabs.com/api`; both are baked in at build time).
The OpenPanel project is `Schier.co` in the Mountain Loop OpenPanel. The
DO_SPACES_*, MAILJET_* and CSRF_KEY variables are removed after the asset
migration has run.

## Cutover (done 2026-10-13, 18:55 UTC)

The planning session does these, in order, with Greg's go-ahead at each
step that touches production.

1. Done 2026-10-13: the Railway bucket `assets` (region sjc, id
   aa81abea-13de-4238-9953-8d3e895d7445) exists in the schier.co project
   and the Web service has `AWS_ENDPOINT_URL`, `AWS_ACCESS_KEY_ID`,
   `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET_NAME` and `AWS_DEFAULT_REGION`
   as references to it. Still Greg's: a Resend API key with
   `mail.schier.co` verified, then `RESEND_API_KEY`, `MAIL_FROM` and
   `MCP_TOKEN` on the Web service.
2. Run `scripts/migrate-assets.mjs --dry-run` then for real against
   production (the Space credentials from the Web service, the bucket's
   AWS_* variables, production `DATABASE_URL` over the TCP proxy). This
   rewrites posts to `/media/`, which the Go site then serves as broken
   images until step 5, so do it just before cutover, or do the copy early
   and the rewrite at cutover (the script's two halves are idempotent).
3. Mark the Prisma baseline applied on production:
   `npx prisma migrate resolve --applied <baseline folder>` with BOTH
   `DIRECT_URL` and `DATABASE_URL` set to production on the command line.
   `prisma.config.ts` loads `.env` first and prefers `DIRECT_URL`, so with
   only `DATABASE_URL` overridden the command silently runs against the
   local database and reports success. That happened on 2026-10-13: the
   first deploy failed its pre-deploy migrate with P3005 (schema not
   empty) until the resolve was rerun with both set. No schema change
   happens.
4. Reconfigure the Web service before the push so the first build of the
   new code is right: builder Railpack (replacing the Heroku builder),
   pre-deploy command `npm run migrate` (a service setting; the CLI's
   dot-path edit reports "no changes" for it, so apply a JSON patch with
   `railway environment edit --json` and
   `{"services":{"<web id>":{"deploy":{"preDeployCommand":["npm run migrate"]}}}}`),
   start `npm start`, health check `/debug/health` kept, replicas as now.
5. Done: commit 570623a pushed; the first two deployments failed on the
   P3005 above, the third (816076c0) succeeded. Verified live: every
   public page and redirect, 20 RSS items, Shiki code blocks, images still
   from the old CDN, `/mcp` 401 without and initialised with the token,
   `/admin?token=` sets the cookie. Rollback would be `git revert` and
   push, with the builder set back to Heroku.
6. Asset migration run 2026-10-13 against production: 283 objects
   copied (265 MB), 0 failed, 42 posts rewritten to `/media/`; the live
   site serves them from the bucket. The Space stays up for inbound links
   for now. `DO_SPACES_*`, `MAILJET_*`, `CSRF_KEY`, `MIGRATE_ON_START` and
   `STATIC_URL` removed from the service the same day.
7. Register the admin MCP in Claude Code at user scope as `schier-co`,
   with the bearer token in `~/.schierco-mcp-token`, as Platform Pixels
   does with `platform-pixels` and `~/.platformpixels-mcp-token`.
8. Later: delete the Space once inbound links have had their grace period;
   drop `users` and `sessions`.

## Verification

- The Go site ran locally (`docker compose up` at the repo root, port
  8084) as the reference during the port; to run it again, check out a
  commit before 2026-10-13. Its database volume `schierco_postgres` (port
  5438) still exists on Greg's Mac. The port's database on 5439 holds a
  copy of production's data from 2026-10-13: 127 posts, 123 published,
  371 subscribers.
- The Go site's `POST /blog/render` (form fields content, slug, title,
  tags, date, partial=true) returns the post partial with the rendered
  markdown inside it, which is how the new renderer is compared.
- A render test runs every published post's markdown through the new
  renderer and compares the HTML to the Go renderer's output, normalised
  for whitespace. Differences are listed, not hidden; the brief records
  any accepted ones.
- Before cutover, a crawl of every URL in the RSS feed and the nav on both
  sites compares status codes and titles.

## Follow-ups noted at cutover

- A signed-out visit to `/admin` gets the 404 page with the title "Posts
  – Gregory Schier"; the title should be the plain 404's.
- Prisma prints an upgrade notice (7.10 to 8.0 rc) in the pre-deploy log;
  ignore until 8 is stable.
- Register the MCP in Claude Code (step 7) from Greg's own machine
  profile; this session's `claude` has no user-scope servers.

## Later, not in the port

- Visual redesign and any restructure of pages.
- Mobile writing companion (likely a PWA of the editor first).
- Dropping `users` and `sessions`.
- Deleting the DigitalOcean Space.
