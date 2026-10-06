# Shared pantry — Phase 04: Server logging and the item model

- **Date:** 2026-10-06 (Tasks 11–12 re-planned against the phase 02 code at
  `364c91e` on 2026-10-07)
- **Status:** **Tasks 11–12: Approved.** **Task 13: Outline.** Before executing
  it, re-run `plan-feature` Phases 2–4 on Task 13 once phase 03 has landed
  (it needs Task 9's offers service).
- **Requirements confirmed by user:** yes — 2026-10-06
- **Part of:** `plans/2026-10-06-shared-pantry-00-overview.md`. It leans on
  §3 and §4.
- **Depends on phases:** Tasks 11 and 12 need only phase 01 (Task 4), so they
  run in parallel with phase 03 (overview §5.1). Task 13 needs phase 03,
  because offer-some needs Task 9.

## 1. Summary

The app gains structured, redacted server-side logs and a live stats view for
the week 11 crit ("Fly by instruments"), and a pure name-to-defaults guesser
built from the USDA FoodKeeper data. Task 13 later gives items real substance:
- measure types: fill, count, have
- labelled estimates with attribution and latest-wins
- expiry buckets backed by an estimated date that moves on its own

**Week 11 crit spec** (read from the course API on 2026-10-07,
`crits/10-fly-by-instruments`). Its checkable lines that this phase serves:
1. "your final project logs what its users do, server-side, deployed by the
   cutoff"
2. "a live view of those logs shows what the app's users are doing right now:
   a log tail or a simple stats page is enough"
3. "you demo by instruments alone … no clicking through your own UI"
4. "the logging lands in the final-project repo and outlives the crit"

The brief asks for one structured line per thing a user does: **who, what,
when**. `flyctl logs` tailed in a terminal counts as the live view; so does a
small stats page. No tracing library or dashboard product.

**Parallel-work rule (this session ran alongside phase 03).** Phase 03
Tasks 8–10 and 20 edit `schema.ts`, `households.ts`, `items.ts`, `live.ts`,
`sse.ts`, `snapshot.ts`, `env.d.ts`, `events.ts`, `Base.astro`,
`PantryList.tsx`, `pantryState.ts`, `useLiveStream.ts`, `pages/index.astro`,
`pages/items/[id]/outcome.ts`, `pages/history*` and `CLAUDE.md`. **Tasks 11
and 12 create new files and do not edit any of those**, except the one small,
named seam in Task 11 step 6 (§4.1) and a new section in `CLAUDE.md`.

## 2. Requirements (this phase)

### 2.1 Functional

| FR | Part implemented here |
| --- | --- |
| FR11, FR13 | **Task 12:** the name → measure, category, shelf-life and icon-key guess, as a pure function and generated data. Wired into `addItem` by Task 13 |
| FR12, FR13 (storage and buckets), FR26, FR32 | **Task 13** (outline) |

### 2.2 Non-functional

| NFR | Part implemented here |
| --- | --- |
| NFR-Course | Task 11: one structured line per user action, to stdout (read with `flyctl logs`), and a live stats view |
| NFR-Privacy | Task 11: logs and the stats view contain no locations, pickup notes, photos, raw tokens, cookies, member names, household names, item names or full URLs (invite and device links carry tokens in the path) |
| NFR-Resources | Task 11: a 200-entry in-memory ring, no new dependency. Task 12: the client table is at most 8 KB gzipped (spec §4 "compact guess table") |

### 2.3 Out of scope for this phase

| Deferred | Phase |
| --- | --- |
| Visual controls (slider, tape, panel) | 05 (Task 14) |
| Wiring `guess()` into `addItem`, columns, buckets, offer-some | Task 13 |
| OpenMoji files and the icon-key → file map | 05 (Task 15) |
| Attribution text in the README | The README is user-authored (overview §3). FoodKeeper is CC0 and needs none; the data's source is recorded beside the data instead |
| A log shipper, a tracing library, a dashboard product | Never (crit spec) |

### 2.4 Assumptions

- See overview §2.4.
- **FoodKeeper licence: verified 2026-10-07.** The Data.gov record
  `https://catalog.data.gov/dataset/fsis-foodkeeper-data` lists **CC0 1.0**
  (public domain dedication) for the English JSON, with no attribution or
  other condition. Task 12 records this, with the URL and date, in
  `src/data/FOODKEEPER.md` and in its commit message.
- **The raw file cannot be fetched by a script.** The published URL
  `http://www.fsis.usda.gov/shared/data/EN/foodkeeper.json` answers plain
  `curl`, and `curl` with a browser User-Agent, with 403 "Access Denied"
  (checked 2026-10-07). Task 12 therefore starts from a file saved by a real
  browser (the Chrome tools, or the user) into `scripts/data/foodkeeper-en.json`.
  If neither can fetch it, Task 12 is blocked: ask the user to save it.
- **The stats view is public and aggregate-only** (Task 11): it shows counts
  and the last 30 actions as `who` (8 hex characters of a token hash) +
  action + status + time. No household, member or item names. This is a call
  the user may veto after seeing it (Task 11 human review); the alternative is
  a `flyctl secrets` token gate.
- **"Who" is a device, not a person:** the first 8 hex characters of the
  stored token hash. It cannot be turned back into a token.

## 3. Existing code context (verified 2026-10-07, commit `364c91e`)

**Task 11**
- `src/middleware.ts` (14 lines) is the only middleware. It reads the cookie
  and sets `context.locals.session`:
  ```ts
  export const onRequest = defineMiddleware((context, next) => {
    const token = context.cookies.get(DEVICE_COOKIE)?.value;
    context.locals.session = token ? sessionForToken(db, token) : null;
    return next();
  });
  ```
  Phase 03 does not edit it.
- `context.routePattern: string` exists on Astro's context (7.3.5, e.g.
  `/items/[id]/outcome`). Use the **pattern**, never `context.url.pathname`:
  `/join/[token]` and `/device/[token]` carry link tokens in the path.
- `src/pages/items/index.ts` answers a validation error with
  `context.rewrite("/")`; read `routePattern` **before** `next()` so the line
  names the route the user asked for.
- Endpoints that exist at `364c91e`, with their POST patterns:
  `/households`, `/items`, `/items/[id]/outcome`, `/history/[id]/undo`,
  `/join/code`, `/join/[token]/accept`, `/device/[token]/accept`,
  `/household/invite-link`, `/household/device-link`, `/household/leave`,
  `/household/members/[id]/remove`; and GET `/events` (SSE), `/api/pantry`.
- Astro's runtime is Node standalone, so `node:async_hooks`
  `AsyncLocalStorage` is available and propagates through `next()`.
- Tests: unit (`src/**/*.test.ts`, no server) and spec (`spec/**/*.test.ts`,
  against the running app over HTTP). **A spec test cannot read the app's
  stdout**, so line shape is unit-tested and the stats view is what the spec
  can observe. `astro:middleware` is a virtual module that vitest cannot
  import, so all logic lives in `src/lib/` and the middleware stays a few lines.
- `spec/http.ts`: `client(baseUrl, { headers })` has its own cookie jar;
  give each test its own `fly-client-ip` (see `ownAddress()` in
  `spec/live.test.ts`). `spec/people.ts` has `startHousehold`.
- Conventions: `import type` for types; Biome formatting (`pnpm format`);
  services take `db` first and never touch requests; endpoints are thin.

**Task 12**
- No `src/data/` and no `scripts/data/` exist. `scripts/` holds only
  `check-evidence.ts`, which Node runs directly (`node scripts/x.ts`, Node 24
  strips types), so the build script needs no package.json entry and **no
  `package.json` edit** is planned (phase 03 and Task 18 may edit it).
- `biome.json` `files.includes` lists ignored paths with `!`. Add
  `!scripts/data` so the raw 3rd-party file is not formatted or linted. (This
  file is not in phase 03's list.)
- No item column for any of this exists yet; Task 12 touches no schema.

### Interfaces from earlier phases (exact)

Copied from the source at `364c91e`; Task 11 needs only these.

```ts
// src/lib/session.ts
export const DEVICE_COOKIE = "pantry_device";
export function hashToken(token: string): string;   // sha256 hex

// src/lib/households.ts
export interface Household { id: string; name: string; inviteCode: string; createdAt: number }
export interface Member { id: string; householdId: string; name: string; createdAt: number }
export interface Session { member: Member; household: Household }
export function sessionForToken(db: Db, token: string): Session | null;

// src/lib/db.ts
export const db: Db;
```

Task 11 needs **nothing from phase 03**: unknown routes fall back to their
pattern as the action name, and the table below pre-names phase 03's planned
routes (phase 03 §4.4).

## 4. Approach

### 4.1 Logging (Task 11)

**One line per request, JSON, to stdout.** Skipped: `/_astro/*`, `/stats`,
`/stats.json` (the view must not log itself). Shape (`RequestLine`):

```ts
// src/lib/requestLog.ts
export interface RequestLine {
  ts: string;             // ISO 8601, UTC
  kind: "request";
  method: string;
  route: string;          // Astro route pattern, never the raw path
  action: string;         // from ACTIONS, else `${method} ${route}`
  status: number;         // 500 when the handler threw
  ms: number;             // integer
  who: string | null;     // 8 hex of hashToken(cookie), only if the cookie resolved to a session
  hh: string | null;      // 8 hex of sha256("hh:" + household.id), same condition
  detail?: Record<string, string | number | boolean>;   // allowlisted keys only
  err?: string;           // error class name only, never the message
}
```

- **`ACTIONS`** names every user-facing endpoint, e.g. `"POST /items"` →
  `"item.add"`, `"POST /items/[id]/outcome"` → `"item.outcome"`,
  `"GET /events"` → `"stream.open"`, `"GET /"` → `"view.pantry"`,
  `"GET /history"` → `"view.history"`, `"POST /households"` →
  `"household.create"`, `"POST /join/[token]/accept"` → `"household.join"`,
  `"POST /join/code"` → `"household.join"`, with its `detail.via` of
  `"link"`/`"code"` where the endpoint sets it, and so on for every endpoint in
  §3. It also pre-names phase 03's planned routes (`POST /communities/create`
  → `community.create`, `POST /communities/join/code`,
  `POST /communities/join/[token]/accept` → `community.join`,
  `POST /communities/[id]/leave` → `community.leave`,
  `POST /offers/create` → `offer.create`, `POST /offers/[id]/claim` →
  `offer.claim`, `…/collected`, `…/release`, `…/withdraw`, `…/note`,
  `GET /offers` → `view.offers`).
- **A unit test fails when a POST endpoint file has no `ACTIONS` entry**, so a
  new endpoint can't ship unnamed. Entries for routes that do not exist yet
  are allowed.
- **`redact(fields)`** keeps only allowlisted keys with primitive values, and
  clamps strings to 40 characters. Allowlist: `outcome`, `via`, `kind`,
  `count`, `reason`. Anything else is dropped, including `note`, `lat`, `lng`,
  `token`, `cookie`, `photo`, names and any value that is an object.
- **`logDetail(fields)`** (`src/lib/log.ts`) adds allowlisted detail to the
  current request's line from anywhere, through an `AsyncLocalStorage`, so
  endpoints and services need no `locals` plumbing. It is a no-op outside a
  request.
- **Errors:** a throw from the handler is logged with `status: 500` and
  `err: error.constructor.name`, then rethrown.
- **Sink:** `process.stdout.write(JSON.stringify(line) + "\n")`. A sink
  failure never fails the request (CLAUDE.md "Live changes" applies the same
  rule to streams).
- **Stats ring** (`src/lib/stats.ts`): the last 200 action lines in memory and
  per-action counters since boot. `snapshot(now)` returns:

```ts
// src/lib/stats.ts
export interface StatsSnapshot {
  since: number;                           // process start, epoch ms
  now: number;
  requests: number;
  errors: number;                          // status >= 500
  actions: Record<string, number>;         // counts since boot, by action
  activeDevices: number;                   // distinct `who` in the last 5 minutes
  perMinute: { minute: number; n: number }[];   // last 10 whole minutes, oldest first
  recent: { ts: string; who: string | null; action: string; status: number }[];   // newest first, at most 30
}
```
  Every logged request line is recorded in the ring and counted under its
  `action`; the skipped paths above are never logged, so never recorded.
- **Endpoints and page:** `GET /stats.json` (200, `Cache-Control: no-store`,
  `StatsSnapshot`), `GET /stats` (a server-rendered page in `Base`, with a
  small inline script that polls `/stats.json` every 2 s and redraws the
  numbers and the recent list; without scripts it shows the first render).
  Neither needs a session. Neither edits `Base.astro` (it only renders inside
  it) or adds a nav entry.
- **Merge seam with phase 03 (Task 11 step 6, last, optional to defer):**
  `logDetail({ outcome })` in `src/pages/items/[id]/outcome.ts` and
  `logDetail({ via })` in `src/pages/join/code.ts` and
  `src/pages/join/[token]/accept.ts`. Phase 03 edits `outcome.ts` (publishing
  offer changes), so do this step **after rebasing on whichever phase 03 task
  has landed**; it is two lines and an import, and a conflict is trivial. The
  rest of Task 11 works without it (the `detail` is simply absent).

### 4.2 Guessing (Task 12)

```ts
// src/lib/guess.ts: pure, no node imports, so the client can import it (Tasks 13 and 14)
export type Measure = "fill" | "count" | "have";
export type Category =
  | "dairy" | "produce" | "grains" | "tins" | "meat"
  | "frozen" | "condiments" | "drinks" | "snacks" | "other";
export interface Guess { category: Category; measure: Measure; shelfDays: number | null; iconKey: string | null }
export interface GuessEntry { keywords: string[]; category: Category; measure: Measure; shelfDays: number | null; iconKey: string | null }
export type GuessTable = GuessEntry[];
export function normaliseName(name: string): string;
export function makeGuesser(table: GuessTable): (name: string) => Guess;
```

- **`normaliseName`:** lowercase, trim, replace any non-letter run with one
  space, and singularise each word: `ies`→`y`, `ves`→`f` only for the word
  list `loaves, halves, leaves`, `es` after `s x z ch sh`, else drop a
  trailing `s` unless the word ends `ss`. `"Eggs "` → `"egg"`,
  `"Tomatoes"` → `"tomato"`, `"Cheese"` → `"cheese"` (no change).
- **Matching:** build a `Map` from each normalised keyword to its entry (first
  entry wins on a duplicate keyword). For a name, try every contiguous run of
  words, longest run first, left to right, and return the first hit. So
  `"skim milk"` → the `milk` entry; `"coconut milk"` → the `coconut milk`
  entry when present. No match → the **unknown guess**:
  `{ category: "other", measure: "have", shelfDays: null, iconKey: null }`
  (spec FR11: unknown foods default to Have).
- **`iconKey`:** the matched entry's lowercase slug (`"milk"`, `"egg"`), or
  `null`. Task 15 maps keys to OpenMoji files and falls back to the category.
  It is a stable contract: renaming a key is a change to Task 15's map.
- **Data**, built by `scripts/build-foodkeeper.ts` from
  `scripts/data/foodkeeper-en.json`:
  - `src/data/foodkeeper.json`: the full `GuessTable` for the server.
  - `src/data/guess-client.json`: the same table shrunk to at most 8 KB gzipped
    (`shrink`: hand overrides first, then entries with an `iconKey`, then the
    rest, in source order, dropping `shelfDays` precision beyond whole days,
    until the gzip budget is reached).
  - `src/data/keyword-overrides.json`: hand-written entries that **win over**
    FoodKeeper (same schema as `GuessEntry`) and `categoryMap`:
    FoodKeeper category name → `Category`. Everything FoodKeeper does not
    say (measure, iconKey) comes from here and from the rules below.
  - **Measure rules** (FoodKeeper has no measure): an entry's measure is the
    override's, else by category: `produce` → `count`, `dairy`/`drinks`/
    `grains`/`tins`/`meat`/`frozen`/`snacks` → `fill`, `condiments` and
    `other` → `have`. Overrides fix the exceptions (eggs → count, cumin →
    have).
  - **Shelf life:** the *unopened* shelf life for the usual storage place
    (pantry for dry goods, refrigerator for `dairy`/`meat`, freezer for
    `frozen`), the **minimum** of the file's range, converted to days
    (days, weeks ×7, months ×30, years ×365). `null` when the file gives none.
  - `src/data/FOODKEEPER.md`: source URL, retrieval date, licence line (CC0
    1.0 per Data.gov, 2026-10-07), and the sheet and column names the script
    reads (written in step 1 from the real file).
- **The script's column names are read from the real file in Task 12 step 1,**
  not assumed. Everything file-shaped is confined to
  `buildTable(raw, overrides)` in `src/lib/foodkeeperTable.ts`; if the real
  file differs from what the fixture models, fix it there and the fixture.

## 5. Task breakdown

Tasks 11 and 12 are independent of each other and of phase 03; either can go
first. Task 13 follows phase 03 and Task 12.

### Task 11: Structured, redacted server logging with a live stats view

- [ ] Done

- **Description:** Log one JSON line per request to stdout with who/what/when,
  redacted by allowlist, and serve a live aggregate view at `/stats`, so the
  week 11 demo can run by instruments alone: `flyctl logs` for the detail,
  `/stats` for the glance.
- **Files:**
  - `src/lib/log.ts` (new) + `log.test.ts`: `redact`, `logDetail`,
    `withRequestContext`, `stdoutSink`.
  - `src/lib/requestLog.ts` (new) + `requestLog.test.ts`: `ACTIONS`,
    `RequestLine`, `describeRequest(input)`, `anon(value)`.
  - `src/lib/stats.ts` (new) + `stats.test.ts`.
  - `src/middleware.ts`: wrap the existing body (the session lookup stays
    exactly as is) in the timing, logging and error path.
  - `src/pages/stats.json.ts`, `src/pages/stats.astro` (new).
  - `CLAUDE.md`: a new `# Logging` section placed **just before
    `## Decisions (ADRs)`** (away from phase 03's "Live changes" edit): a log
    line is the app's account of what users did; never log a field that is
    not in `redact`'s allowlist; never log a raw path, name, note or token.
  - `spec/stats.test.ts` (new).
  - Step 6 only: `src/pages/items/[id]/outcome.ts`, `src/pages/join/code.ts`,
    `src/pages/join/[token]/accept.ts` (one `logDetail` call each).
- **Tests to write first (red):**
  - Unit `log.test.ts`:
    - `redact` drops every non-allowlisted key, including `note`, `lat`,
      `lng`, `token`, `cookie`, `photo`, `memberName`, `itemName`; drops
      object, array and null values; keeps `outcome`, `via`, `kind`, `count`,
      `reason`; clamps a 200-character string to 40.
    - `logDetail` inside `withRequestContext` is returned by the context;
      outside one it does nothing and does not throw; two concurrent contexts
      do not see each other's detail (run both with `Promise.all` and an
      `await` between).
  - Unit `requestLog.test.ts`:
    - `describeRequest` for `POST /items` with a resolved session gives the
      documented shape: `kind: "request"`, `action: "item.add"`, integer
      `ms`, `who` and `hh` each matching `^[0-9a-f]{8}$`.
    - **Privacy:** for route `/join/[token]` the line contains the pattern and
      **not** a token passed in the path; no field of the line contains the
      raw cookie value, the household or member name, or an item name given
      as input.
    - No session → `who: null` and `hh: null`.
    - An unnamed route → `action` is `"<METHOD> <pattern>"`.
    - A thrown error → `status: 500`, `err` is the class name, and the error
      message does not appear anywhere in the serialised line.
    - **Every POST endpoint has an action:** scan `src/pages/**` for files that
      export `POST`, map each to its Astro pattern, and expect an `ACTIONS`
      key for it. Extra keys are allowed.
    - `stdoutSink` swallows a write that throws.
  - Unit `stats.test.ts` (inject `now`): counts by action; `errors` counts 5xx;
    `activeDevices` counts distinct `who` in the last 5 minutes and ignores
    `null`; `perMinute` has 10 buckets oldest first; the ring keeps 200 and
    `recent` returns the newest 30; `/stats` and `/_astro` lines are never
    recorded.
  - Spec `spec/stats.test.ts` (own household and `fly-client-ip`):
    - `GET /stats.json` is 200 JSON with `Cache-Control: no-store`, needs no
      session, and has the `StatsSnapshot` keys.
    - After a household is created and an item added, `actions["household.create"]`
      and `actions["item.add"]` have each risen by at least 1.
    - **Privacy:** add an item named `SECRETMILK-<random>` and a member named
      `NOSY-<random>`; neither string, nor the invite link token (mint one and
      open its page), appears in `/stats.json` or `/stats`.
    - The two requests to `/stats` and `/stats.json` do not raise `requests`
      between two reads.
    - `GET /stats` is 200 HTML containing "Activity".
- **Implementation (green):** as §4.1. In the middleware: read `routePattern`
  and start the clock; run the existing session lookup; call `next()` inside
  `withRequestContext`; on return or throw, build the line with
  `describeRequest`, push to `stats`, write to the sink inside a try/catch,
  and return the response (or rethrow).
- **Refactor:** none.
- **Acceptance:**
  - All tests above green; `pnpm check` green.
  - Run the built app locally (`pnpm build && pnpm start | tee
    $TMP/app.log`), exercise create, add, outcome, join, then `grep` the log:
    every user action has exactly one JSON line and none contains the raw
    cookie, a token, a name or an item name. Paste two lines into the report.
  - `/stats` at 375 and 1280 px renders without horizontal overflow
    (screenshot at each) and updates within 2 s of an action.
  - `mise exec -- flyctl logs -a comp4020-final-attwelvedev` on the deployed
    app shows the JSON lines (a post-deploy check, in the phase DoD).
- **Human review:** the user reads a sample of the **local** log (the `tee`d
  file from a short two-browser session) and the `/stats` page. **Pass:** they
  could answer "what happened at 3pm, and who was doing what" from the log
  alone, without seeing anything private, and they accept the stats page being
  public (or ask for a token gate).
- **Depends on:** Task 4 (phase 01 only; it does not need phase 03).

### Task 12: FoodKeeper-backed guessing of category, measure, shelf life and icon key

- [ ] Done

- **Description:** A pure `guess(name)` and the generated data behind it, for
  Task 13 to apply on add and for the client to run optimistically. No schema,
  endpoint or UI.
- **Files:**
  - `scripts/data/foodkeeper-en.json` (new, the raw file from §2.4, committed;
    if it is over 1.5 MB, leave it untracked, record its sha256 in
    `src/data/FOODKEEPER.md`, and add it to `.gitignore`).
  - `biome.json`: add `"!scripts/data"` to `files.includes`.
  - `scripts/build-foodkeeper.ts` (new, thin CLI: read raw and overrides,
    call `buildTable` and `shrink`, write the two JSON files).
  - `src/lib/foodkeeperTable.ts` (new) + `foodkeeperTable.test.ts`:
    `buildTable(raw: unknown, overrides: { entries: GuessEntry[]; categoryMap: Record<string, Category> }): GuessTable`
    and `shrink(table: GuessTable, maxGzipBytes: number): GuessTable`.
  - `src/lib/guess.ts` (new) + `guess.test.ts`: per §4.2.
  - `src/data/keyword-overrides.json`, `src/data/foodkeeper.json`,
    `src/data/guess-client.json`, `src/data/FOODKEEPER.md` (new).
  - `scripts/guess-sample.ts` (new): prints `name → guess` for the sample list
    below, for the human review.
- **Steps and tests to write first (red):**
  1. **Licence and data (no code).** Re-check the Data.gov record still says
     CC0 1.0. Fetch the raw file with a real browser into
     `scripts/data/foodkeeper-en.json`. Open it and write the sheet names and
     the column names the script will read into `src/data/FOODKEEPER.md`. If
     the licence is not CC0/public domain, or the file cannot be obtained,
     **stop and ask the user**.
  2. Unit `guess.test.ts`, against a small inline `GuessTable` fixture:
     - `normaliseName`: `"Eggs "` → `"egg"`, `"Tomatoes"` → `"tomato"`,
       `"BERRIES"` → `"berry"`, `"Loaves"` → `"loaf"`, `"hummus"` →
       `"hummus"`, `"  Soy  sauce! "` → `"soy sauce"`.
     - Longest run wins: `"coconut milk"` beats `"milk"`; `"skim milk"` →
       the `milk` entry; `"MILK"` and `"milks"` match too.
     - An unmatched word → `{ category: "other", measure: "have",
       shelfDays: null, iconKey: null }`; the empty string too.
     - First entry wins on a duplicate keyword.
  3. Unit `foodkeeperTable.test.ts`, with a fixture **copied from a few real
     rows** of the raw file:
     - `buildTable` converts day, week, month and year units to days and takes
       the minimum of the range; `null` when no value is given.
     - Storage place: a `dairy` row uses the refrigerator value; a pantry row
       the pantry value; a `frozen` row the freezer value.
     - Overrides win: an override keyword replaces the FoodKeeper entry's
       fields for the same keyword.
     - **Every category name in the real raw file appears in `categoryMap`**
       (read the real file in the test; an unmapped category fails and names
       it).
     - `shrink` returns a table whose gzipped JSON is at most the budget, keeps
       overrides before anything else, and preserves order.
  4. Unit `guess.test.ts`, against the **real generated** `src/data/foodkeeper.json`
     (after the build step):
     - `milk` → `fill`, `dairy`; `eggs` → `count`; `cumin` → `have` with
       `shelfDays` at least 365; `an unknown word` → `have`, `null`;
       case and plural insensitive (`"EGGS"`, `"Egg"`).
     - `guess-client.json` is at most **8 KB gzipped** and still guesses milk,
       eggs and cumin the same as the full table.
     - Every `iconKey` in the table matches `^[a-z0-9-]+$`; every category is
       one of the ten.
- **Implementation (green):** write `normaliseName`, `makeGuesser`,
  `buildTable`, `shrink`, the overrides (milk, eggs, cumin and the other
  exceptions the sample list below shows), run
  `node scripts/build-foodkeeper.ts` and commit the output.
- **Refactor:** none.
- **Acceptance:** tests green; `pnpm check` green; the licence line (CC0 1.0,
  Data.gov, retrieval date) is in `src/data/FOODKEEPER.md` **and** the commit
  message; `scripts/data/foodkeeper-en.json` is excluded from Biome;
  `node scripts/build-foodkeeper.ts` re-run leaves the two generated files
  byte-identical (reproducible).
- **Human review:** the user reads the output of `node scripts/guess-sample.ts`
  for: milk, skim milk, eggs, bananas, apples, bread, flour, rice, olive oil,
  cumin, ground cinnamon, soy sauce, tomato sauce, tinned tomatoes, baked
  beans, chicken breast, mince, cheddar cheese, yoghurt, butter, frozen peas,
  ice cream, orange juice, coffee, tea bags, biscuits, chips, pasta, spinach,
  carrots, onions, potatoes, lemon, lentils, honey, jam, vegemite, tofu,
  mystery thing. **Pass:** only a handful look wrong, none has a dangerous
  shelf life (no raw meat measured in months), and the wrong ones are
  fixable by adding an override.
- **Depends on:** Task 4 (phase 01 only).

### Task 13: Measure types, estimates with attribution, moving expiry buckets, offer-some reduction

*(Outline: re-plan before executing. Needs phase 03's Task 9 and Task 12.)*

- **Approach to keep:**
  - New item columns: `measure`, `fill_stop` (0–4), `count`, `exact_amount`,
    `category`, `icon_key`, `estimated_expiry` (date), `exact_expiry` (date),
    `value_set_by`, `value_set_at`, `expiry_set_by`, `expiry_set_at`.
  - `bucketFor(estimated: string|null, exact: string|null, today: string)`
    returns `"past"|"use-soon"|"this-week"|"this-month"|"long-lasting"|"unknown"`;
    pure, unit-tested, runs client-side in local time. Thresholds: use-soon
    ≤ 2 days, this-week ≤ 7, this-month ≤ 31. Setting a bucket stores
    `today + representative days` (2/5/20/90).
  - Endpoints: `POST /items/:id/value`, `/measure`, `/expiry`, each
    publishing `item.updated` with attribution.
- **Files:** `src/lib/schema.ts` + migration, `src/lib/items.ts`,
  `src/lib/expiry.ts` (+ test), endpoints, `src/lib/offers.ts` (offer-some),
  `spec/estimates.test.ts`.
- **Tests to write first:**
  - `addItem` applies `guess` (Task 12).
  - Latest write wins, with `value_set_by` and `value_set_at` updated.
  - The bucket moves as `today` advances (injected date).
  - An exact date overrides the estimate.
  - "Offer some 3 of 6" leaves 3.
  - A value change on an offered item publishes to the offer channels.
- **Acceptance:** tests green.
- **Depends on:** Task 12 (and Task 9 for offer-some).

## 6. Phase Definition of Done

- [ ] Tasks 11–13 complete, each committed with `pnpm check` green
- [ ] Task 11 human review accepted
- [ ] Task 12 human review accepted
- [ ] Deployed before the week 11 crit; `mise exec -- flyctl logs -a comp4020-final-attwelvedev`
      shows one JSON line per user action, and `/stats` on the fly.dev URL
      moves when two browsers use the app (the deployed-app check for NFR-Course)
- [ ] `/ship` check for the week 11 deliverable: the logging is in the repo
      and outlives the crit
- [ ] Tick phase 04 in overview §5

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| NFR-Course (logging; crit lines 1–4) | Task 11 (lines, stats view, deploy check in §6) |
| NFR-Privacy (logs) | Task 11 (`log.test.ts`, `requestLog.test.ts` privacy cases, `spec/stats.test.ts`) |
| NFR-Resources (ring size, client table size) | Task 11 (200-entry ring), Task 12 (8 KB gzip test) |
| FR11 (guess the measure), FR13 (defaults from FoodKeeper) | Task 12 |
| FR11–FR13 (model), FR26 (offer some), FR32 (value updates) | Task 13 |
| Human review (log readability, guess quality) | Task 11, Task 12 |

## 8. Risks / open questions

None for Tasks 11–12. Notes the executor must not lose:

- **The raw FoodKeeper file needs a real browser to download** (§2.4); if that
  fails, Task 12 stops at step 1 and asks the user.
- **Merge risk with phase 03:** only Task 11 step 6 touches a phase 03 file
  (`items/[id]/outcome.ts`), by two lines. Do that step last, after rebasing.
  If phase 03's Task 8 adds an endpoint before Task 11 lands, the "every POST
  endpoint has an action" test will name it; add its `ACTIONS` entry (the
  planned ones are already there).
- **The week 11 crit is "demo by instruments alone":** check on the day that
  a dozen concurrent users' story is legible in `flyctl logs`; if not, that is
  the finding, not a bug in this phase.
- **Task 13 stays an outline**; re-plan it after phase 03.
