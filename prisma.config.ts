import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

// Migrations and introspection go straight to Postgres. Runtime queries use
// DATABASE_URL (see src/server/db.ts). DIRECT_URL is only needed where
// DATABASE_URL goes through a pooler; without it, the one URL serves both.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DIRECT_URL ? env('DIRECT_URL') : env('DATABASE_URL') },
})
