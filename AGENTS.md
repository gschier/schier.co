# Working in this repo

schier.co: Greg's personal site and blog, a TanStack Start app (React,
file routes, server handlers), Prisma 7 on Postgres, Tailwind 4, Vite,
deployed on Railway. It replaced the Go site on 2026-10-13; the Go code is
in git history before that date. BRIEF.md holds every product decision,
dated. Where a task conflicts with BRIEF.md, say so and stop rather than
guess. Decisions are Greg's.

## Agents

- The planning session (the chat with Greg) writes briefs, launches
  agents, reads their reports, and does commits, pushes, deploys and
  anything that touches production. Task agents do not.
- Task agents run on Opus 5.5 (`model: opus`) unless the brief says
  otherwise. Fable is for the planning session and for a task the brief
  names as needing it; it is not the default, to protect quota.
- One fresh agent per task, briefed from this file and BRIEF.md,
  discarded when it reports. No long-running agents. Small edits (a row,
  a label, a fixture) the planning session makes itself.
- A report says what was built, every command run to verify and its
  result, and anything from the brief that was not done and why. Tests
  that fail are reported with their output, not hidden.
- Full test runs and screenshot inspection are the verification, not
  waste. Look at every screenshot you take.

## Git

- The branch is `master`, and a push to it is the production deploy
  (build, `npm run migrate` as the pre-deploy command, then the server).
  Do not push or deploy unless the task says so.
- Do not commit unless the task says so; when it does, a cruft audit
  first, then a short summary of what changed, and ask (the global rule:
  never commit without confirmation).
- Commit messages are one full sentence about what changed for a person,
  no prefixes. Read `git log --oneline -20` for the register.
- Never touch production, reading included: no Railway MCP or CLI, no
  live database, no bucket, no DigitalOcean Space, no Resend, no GET of
  schier.co, unless the task names it. The local database holds a copy of
  production's data (loaded 2026-10-13), which is what to use.

## Run and test

- `docker compose up -d` (Postgres on 5439, compose project
  `schierco-web`), `cp .env.example .env`, `npm install`,
  `npm run db:migrate`, `npm run dev` on http://localhost:3200.
- `npm run typecheck`, `npm test`, `npm run build`. Tests make a scratch
  database of their own on the local Postgres (`test/help.ts`, or
  `TEST_DATABASE_URL`) and drop it after. They never use the compose
  database `schierco`, and nothing but localhost.
- Port 3000 belongs to Platform Pixels' `vite dev`. Never kill a dev
  server you did not start; if a port you need is taken, pick another and
  say so in the report.
- Headless Chrome never comes from `/Applications/Google Chrome.app`: a
  stray one stops Greg's Chrome opening windows. Use Playwright's headless
  shell (`playwright-core` is a dev dependency; `scripts/screenshots.mjs`
  and `scripts/editor-check.mjs` show how), and kill what you start in a
  `finally` or trap.
- Start a long run and wait for it in the same turn; never end a turn
  with a run in the background.

## Code

- Dev needs no bucket: `src/server/storage.ts` keeps images in `.media/`
  (gitignored) without the AWS_* variables, and in dev fetches a missing
  one once from `ASSETS_FALLBACK_URL` (the old CDN).
- No SDKs for S3 or Resend: `src/server/s3.ts` signs its S3 calls by
  hand, and `src/server/mail.ts` is plain HTTP to Resend's API. Without
  `RESEND_API_KEY` email is logged, not sent.
- Generated, not edited by hand: `src/routeTree.gen.ts` (by the dev
  server, the build or `npm run generate-routes`; committed) and
  `src/generated` (by `prisma generate`, which `npm run db:migrate` and
  the build run; ignored).
- The tables are the Go site's, mapped in `prisma/schema.prisma`. The
  baseline migration matches production exactly, where it is marked
  applied rather than run; a schema change is a new migration.
- The admin MCP is `src/routes/mcp.ts` (bearer `MCP_TOKEN`, for the MCP
  only). The admin pages sign in with the login form at `/login`: email and
  password against `users`, a row in `sessions` and the `sid` cookie
  (`src/server/auth.ts`). Locally that is a user in the local database; a
  check makes its own throwaway user and deletes it after, and never
  changes Greg's. Tests sign in with `signedIn()` from `test/help.ts`.

## Writing

Use "and" instead of "&" in anything a person reads. Sentence case. No
emojis. Say what a thing does for a person, not what it is.
