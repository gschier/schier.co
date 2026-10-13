# schier.co

Greg's personal site and blog, a TanStack Start app on Railway. See
`AGENTS.md` for how to work in the repo and `BRIEF.md` for every decision.

```sh
docker compose up -d      # local Postgres on 5439
cp .env.example .env
npm install
npm run db:migrate
npm run dev               # http://localhost:3200
```

Dev needs no bucket: images are kept in `.media/`, and one a post uses but
`.media/` lacks is fetched once from `ASSETS_FALLBACK_URL` (the old CDN).

`npm run typecheck` and `npm test` check it; the tests make their own
scratch databases on the same Postgres.
