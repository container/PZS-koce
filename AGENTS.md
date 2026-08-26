<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Railway deployment context

This repository is deployed in Railway project `gentle-serenity`, environment
`production`. It has three services: `PZS-koce` (Next.js web), `pzs-worker`
(background refresh worker), and `Postgres` (the durable database).

- In Railway, both application services use the private database reference
  `${{Postgres.DATABASE_URL}}`. Never replace it with a localhost URL and do
  not enable public database access merely for the deployed services.
- The web service starts with `npm run start`; the worker starts with
  `npm run worker`. Keep the worker at one replica unless the upstream rate
  posture is deliberately revisited.
- Run `npm run db:migrate` as a Railway pre-deploy command (or one-off command)
  when schema changes are introduced.
- For local development, the database is reached through Railway's encrypted
  CLI tunnel, not `postgres.railway.internal`: run `railway link`, then
  `railway connect Postgres --tunnel-only`, and leave that command running.
  Put the URL it prints in uncommitted `.env.local` as the single complete
  `DATABASE_URL` value. The localhost port is temporary and changes each time
  the tunnel is opened. Never commit or paste that URL into project files.
