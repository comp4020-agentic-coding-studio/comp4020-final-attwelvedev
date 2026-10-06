# 1. Astro on Node with Preact islands and SQLite

## Status

accepted

## Context

The app is a shared household pantry with neighbourhood offers
(`specs/2026-10-06-shared-pantry.md`). It has to run on one shared-cpu
machine with 256 MB of memory, keep everything on a single volume at `/data`,
answer at `/`, and publish `README.md` at `/readme/` as server-rendered HTML.
Most screens are lists that should render fast on a phone over a slow
connection; only a few parts are genuinely interactive (the pantry list with
its slider and steppers, the offers feed, the add-and-search field, toasts,
the map). Markers do a keyboard-only pass at two viewports.

I've already built a full-stack app on Astro 7 with `@astrojs/node`, Preact
islands, better-sqlite3 and Drizzle (crit 7), so I know where its edges are.

I weighed a full single-page app (React or Svelte). It would ship more
JavaScript to phones, the README page and first paint would need separate
server rendering, and I'd be learning a new setup in the week the first
version is due.

## Decision

I'll build the app with Astro using server-side rendering on Node
(`@astrojs/node`, standalone), with Preact islands only where interaction
needs them. Data lives in SQLite through better-sqlite3 with Drizzle for
schema and queries. Forms work as plain POSTs before islands hydrate (the add
field in particular). The busybox placeholder image is replaced by a Node
image running the built server on `0.0.0.0:$PORT`.

## Consequences

- One process serves pages, the API and the live stream, which keeps memory
  low and lets real-time fan-out stay in-process (ADR 0004).
- `/readme/` can render the markdown on the server, so the course check
  passes without a separate build.
- better-sqlite3 is a native module, so the Docker build has to compile or
  fetch it for Fly's architecture.
- Astro's islands mean the interactive parts are separate Preact roots;
  shared client state (the live stream) has to be passed between them on
  purpose.
- Any heavy client library (Leaflet) has to be loaded on demand to stay
  within the phone JS budget.
