# PZS Hut Availability

A Next.js app for checking accommodation availability at selected Slovenian Alpine Association (PZS) huts. It lists huts by region, shows them on a map, and queries the Bentral booking embed used by each hut.

## Setup

Requires Node.js 20.9 or newer and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Before a production deployment, run:

```bash
npm run typecheck
npm run lint
npm run build
```

## Bentral Integration

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
