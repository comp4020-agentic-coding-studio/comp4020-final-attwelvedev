# Shared pantry — Phase 04: Server logging and the item model

- **Date:** 2026-10-06
- **Status:** Outline. Before executing, re-run `plan-feature` Phases 2–4 on
  this file (overview §0). Re-read the week 11 crit spec ("Fly by
  instruments") first; it may add logging requirements.
- **Requirements confirmed by user:** yes — 2026-10-06
- **Part of:** `plans/2026-10-06-shared-pantry-00-overview.md`. It leans on
  §3 and §4.
- **Depends on phases:** Tasks 11 and 12 need only phase 01, so they can run
  in parallel with phases 02 and 03 (overview §5.1). Task 13 needs phase 03,
  because offer-some needs Task 9. Task 11 adds logging for the events from
  Tasks 6 and 9 once they exist.

## 1. Summary

The app gains structured, redacted server-side logs for the week 11 crit.
Items gain real substance:
- measure types: fill, count, have
- labelled estimates with attribution and latest-wins
- expiry buckets backed by an estimated date that moves on its own
- defaults guessed from the USDA FoodKeeper data

## 2. Requirements (this phase)

### 2.1 Functional

| FR | Part implemented here |
| --- | --- |
| FR11, FR12, FR13 | Data and server side |
| FR26 | "Offer some" reduces the remaining value |
| FR32 | Live offers update when values change |

### 2.2 Non-functional

| NFR | Part implemented here |
| --- | --- |
| NFR-Course | Server-side logging |
| NFR-Privacy | Logs never contain locations, pickup notes, photos, raw tokens or cookies |

### 2.3 Out of scope for this phase

| Deferred | Phase |
| --- | --- |
| Visual controls (slider, tape, panel) | 05 (Task 14) |

### 2.4 Assumptions

- See overview §2.4.
- **The FoodKeeper licence must be verified before bundling** (Task 12's
  first step). If it isn't public domain, stop and ask the user.

## 3. Existing code context

To be verified at phase start.

### Interfaces from earlier phases (exact)

Overview §4.2, plus phase 02/03 additions copied verbatim at phase start:
- the `publish` and `LiveEvent` types
- the offers service signatures from Task 9

## 4. Approach

- **Logging** (`src/lib/log.ts`):
  - One JSON line per request (method, route pattern, status, ms, and an
    anonymised session id = the first 8 hex characters of the token hash).
  - One JSON line per domain event.
  - A `redact()` allowlist decides which fields may be logged.
  - Wired in `src/middleware.ts`. Output goes to stdout, so it's read with
    `flyctl logs`.
- **Guessing** (`src/lib/guess.ts`):
  - `guess(name: string)` returns
    `{ category, measure: "fill"|"count"|"have", shelfDays: number|null, iconKey: string|null }`.
  - It matches against a keyword table generated from FoodKeeper by
    `scripts/build-foodkeeper.ts` into `src/data/foodkeeper.json`, plus a
    hand-written keyword overrides file.
  - The same table, shrunk, is exported for the client at
    `src/data/guess-client.json`.
- **Items:**
  - New columns: `measure`, `fill_stop` (0–4), `count`, `exact_amount`,
    `category`, `icon_key`, `estimated_expiry` (date),
    `exact_expiry` (date), `value_set_by`, `value_set_at`,
    `expiry_set_by`, `expiry_set_at`.
  - `bucketFor(estimated: string|null, exact: string|null, today: string)`
    returns
    `"past"|"use-soon"|"this-week"|"this-month"|"long-lasting"|"unknown"`.
    It is pure, unit-tested, and runs client-side in local time.
  - Thresholds: use-soon ≤ 2 days, this-week ≤ 7, this-month ≤ 31.
  - Setting a bucket stores
    `today + representative days` (2/5/20/90).
- **Endpoints:** `POST /items/:id/value`, `POST /items/:id/measure` and
  `POST /items/:id/expiry`, each publishing `item.updated` with attribution.

## 5. Task breakdown

### Task 11: Structured, redacted server logging

- **Files:** `src/lib/log.ts`, `src/lib/log.test.ts`, `src/middleware.ts`,
  the domain event call sites.
- **Tests to write first:**
  - Unit: `redact` drops non-allowlisted fields, including pickup notes,
    coordinates, tokens and photo data.
  - A request log line has the documented shape.
- **Acceptance:** `flyctl logs` shows JSON lines on the deployed app.
- **Human review:** the user reads a sample of real logs. **Pass:** they
  could answer "what happened at 3pm" without seeing anything private.
- **Depends on:** Task 4. Event logging covers Tasks 6 and 9 once present.

### Task 12: FoodKeeper-backed guessing of category, measure, shelf life and icon key

- **Files:** `scripts/build-foodkeeper.ts`, `src/data/foodkeeper.json`,
  `src/data/keyword-overrides.json`, `src/lib/guess.ts`,
  `src/lib/guess.test.ts`, attribution in the README footer and `/readme/`.
- **Tests to write first:**
  - milk → fill / dairy
  - eggs → count
  - cumin → have / long shelf life
  - an unknown word → have / null
  - Case and plural insensitive
- **Acceptance:** tests green; licence verified and recorded in the commit
  message.
- **Depends on:** Task 4.

### Task 13: Measure types, estimates with attribution, moving expiry buckets, offer-some reduction

- **Files:** `src/lib/schema.ts` + migration, `src/lib/items.ts`,
  `src/lib/expiry.ts` (+ test), endpoints, `src/lib/offers.ts` (offer-some),
  `spec/estimates.test.ts`.
- **Tests to write first:**
  - `addItem` applies the guess.
  - Latest write wins, with `value_set_by` and `value_set_at` updated.
  - The bucket moves as `today` advances (unit test with an injected date).
  - An exact date overrides the estimate.
  - "Offer some 3 of 6" leaves 3.
  - A value change on an offered item publishes to the offer channels.
- **Acceptance:** tests green.
- **Depends on:** Task 12 (and Task 9 for offer-some).

## 6. Phase Definition of Done

- [ ] Tasks 11–13 complete, each committed with `pnpm check` green
- [ ] Deployed before the week 11 crit; logs visible via `flyctl logs`
- [ ] Task 11 human review accepted
- [ ] Tick phase 04 in overview §5

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| NFR-Course (logging), NFR-Privacy (logs) | Task 11 |
| FR11 (guess), FR13 (defaults) | Task 12 |
| FR11–FR13 (model), FR26 (offer some), FR32 (value updates) | Task 13 |

## 8. Risks / open questions

None. Refine at phase start, including the week 11 crit spec.
