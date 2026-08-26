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

## Production architecture

The public web service never calls Bentral. A search reads the most recent matching Postgres snapshot and returns it immediately with its timestamp/source link. A missing or stale snapshot is deduplicated into a refresh job, so visitors never wait for an upstream scrape.

The `refresh_jobs.cache_key` primary key makes concurrent requests safe. A worker claims jobs with `FOR UPDATE SKIP LOCKED`, processes sequentially, checks every unit's `unavailDates` calendar, and only prices calendar-available units. `unavail` blocks, `unavail_start` is allowed only on departure, and `unavail_end` is allowed. Durable price cache entries last one week and include hut, unit, dates, and guests.

There is no cron or scheduled poller: an idle deployment makes zero Bentral requests.

## Railway deployment

1. Create a Railway project and add PostgreSQL.
2. Create a web service from this repository; use Railway's normal build and `npm run start`, with the Postgres `DATABASE_URL` reference.
3. Create a second service from the same repository, using the same `DATABASE_URL` and start command `npm run worker`.
4. Run `npm run db:migrate` once in a Railway shell or one-off deployment before serving traffic.
5. Keep the worker at one replica initially; it is intentionally sequential and rate-limited.

Required: `DATABASE_URL` on both services. Optional: `AVAILABILITY_FRESH_FOR_MS` (default 900000), `DATABASE_POOL_MAX`, `BENTRAL_REQUEST_DELAY_MS` (default 1500), `WORKER_IDLE_POLL_MS` (default 5000), and `WORKER_ID`. Do not expose them as `NEXT_PUBLIC_*` variables.

## Bentral integration

Hut definitions in `lib/huts.ts` contain the public Bentral embed URL, building ID, and embed key for each supported hut. The server fetches the embed page, extracts accommodation units, then posts date and guest details to Bentral's availability endpoint.

This is an integration with Bentral's public embed behavior, not a documented or versioned API. It assumes that the iframe continues to expose a `user` field and either a `unit_data` JavaScript object or the current unit-selection markup. Availability is inferred from the first available pricing response, so results should be treated as a guide and confirmed on the linked Bentral booking page.

## Cache Behavior

The server keeps an in-memory cache and persists it to `.cache/bentral-cache.json` when the local filesystem is writable.

- Parsed accommodation units are cached for 7 days.
- Availability results are cached for 24 hours and are marked stale after 15 minutes in the UI.
- Failed availability checks are cached for 15 minutes to avoid repeatedly retrying a failing upstream request.
- Requests for the same cache key made concurrently share one upstream request.

The `.cache` directory is ignored by Git. On serverless or ephemeral deployments, the persistent cache may not survive a restart or may be unavailable; the in-memory cache still works for the lifetime of an instance.

## Limitations

- The hut catalog is manually maintained and only covers the huts listed in `lib/huts.ts`.
- Bentral can change its embed HTML, request fields, availability response, or access policy without notice, which can break parsing or checks.
- This app does not complete bookings, validate final prices, or guarantee availability.
- There is no upstream rate limiting, retry/backoff policy, or automated test suite yet. Be mindful of bulk availability checks in production.
