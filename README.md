# PZS Hut Availability Finder

A Next.js app for checking accommodation availability at selected Slovenian Alpine Association (PZS) huts. It lists huts by region, shows them on a map, and queries the Bentral booking embed used by each hut.

## Local setup

Requires Node.js 20.9 or newer and npm.

```bash
npm install
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Before a production deployment, run:

```bash
npm run typecheck
npm run lint
npm run build
```

In a second terminal, run the refresh worker:

```bash
npm run worker
```

Copy `.env.example` to `.env.local` and set `DATABASE_URL` first. The web app and worker must use the same database.

### Connecting locally to Railway Postgres

The deployed services use Railway private networking. From a Mac, do not use
`postgres.railway.internal`; open an encrypted tunnel instead:

```bash
railway link
railway connect Postgres --tunnel-only
```

Keep the tunnel terminal running and copy its printed complete URL into
uncommitted `.env.local` as `DATABASE_URL`. Its localhost port changes each
time the tunnel opens. Do not expose the database publicly just for local work.

## Production architecture

The public web service never calls Bentral. A search reads the latest per-hut calendar from Postgres and derives binary availability locally for the selected stay. A missing or stale calendar is deduplicated into one refresh job per hut, so visitors never wait for an upstream scrape. In Railway the web app and worker are separate services; local development connects to the remote database through the Railway tunnel.

The `refresh_jobs.cache_key` primary key makes concurrent requests safe. A worker claims jobs with `FOR UPDATE SKIP LOCKED` and processes them sequentially. One iframe response contains `unavailDates` for all unit types and the Bentral booking horizon; the app stores only the next three months. `unavail` blocks, `unavail_start` is allowed only on departure, and `unavail_end` is allowed. The application assumes one guest.

Unit metadata is permanent and changes only through the admin refresh action. Prices are independent, last-known one-night values per unit. They never affect availability and are refreshed only by the admin background action.

There is no cron or scheduled poller: an idle deployment makes zero Bentral requests.

## Railway deployment

1. Create a Railway project and add PostgreSQL.
2. Create a web service from this repository; use Railway's normal build and `npm run start`, with the Postgres `DATABASE_URL` reference.
3. Create a second service from the same repository, using the same `DATABASE_URL` and start command `npm run worker`; do not give it a public domain.
4. Run `npm run db:migrate` as a web-service pre-deploy command (or once in a Railway shell) before serving traffic.
5. Keep the worker at one replica initially; it is intentionally sequential and rate-limited.

Required: `DATABASE_URL` on both services. Optional: `AVAILABILITY_FRESH_FOR_MS` (default 900000), `DATABASE_POOL_MAX`, `BENTRAL_REQUEST_DELAY_MS` (default 0), `WORKER_IDLE_POLL_MS` (default 5000), and `WORKER_ID`. Do not expose them as `NEXT_PUBLIC_*` variables.

## Bentral integration

Hut definitions in `lib/huts.ts` contain the public Bentral embed URL, building ID, and embed key for each supported hut. The worker fetches the embed page and extracts the permanent unit catalogue plus per-unit `unavailDates`. Normal availability searches need no additional Bentral calls. The pricing endpoint is used only by the manual background price refresh.

This is an integration with Bentral's public embed behavior, not a documented or versioned API. It assumes that the iframe continues to expose a `user` field, `unavailDates`, and either a `unit_data` JavaScript object or the current unit-selection markup. Results should be treated as a guide and confirmed on the linked Bentral booking page.

## Cache Behavior

- Unit metadata is stored permanently in `bentral_units` and refreshed manually.
- Per-hut calendars are fresh for 15 minutes by default and cover three months.
- Calendar refreshes use one iframe request per hut, regardless of how many dates or units a user views.
- Last-known prices are stored indefinitely per unit and refreshed manually in the background.
- Requests for the same hut calendar share one deduplicated refresh job.

## Limitations

- The hut catalog is manually maintained and only covers the huts listed in `lib/huts.ts`.
- Bentral can change its embed HTML, request fields, availability response, or access policy without notice, which can break parsing or checks.
- This app does not complete bookings, validate final prices, or guarantee availability.
- There is no retry/backoff policy beyond delayed retries for failed jobs. Be mindful of bulk manual refreshes in production.
