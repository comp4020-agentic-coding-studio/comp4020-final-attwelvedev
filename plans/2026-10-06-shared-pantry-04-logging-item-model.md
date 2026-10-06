# Shared pantry — Phase 04: Server logging and the item model

- **Date:** 2026-10-06 (Tasks 11–12 re-planned against the phase 02 code at
  `364c91e` on 2026-10-07; Task 13 re-planned and split into Tasks 13, 21 and 22
  against the code at `43c6d87` on 2026-10-07)
- **Status:** Tasks 11–12 are **done** (`b267898`, `6704cba`). **Tasks 13, 21 and
  22: Approved.**
- **Requirements confirmed by user:** yes — 2026-10-06; Tasks 13, 21 and 22
  re-confirmed 2026-10-07 (split into three, Offer some splits into a new item
  and merges back on withdraw, data and API only, the attribution, date and
  no-backfill defaults of §4.3)
- **Part of:** `plans/2026-10-06-shared-pantry-00-overview.md`. It leans on
  §3 and §4.
- **Depends on phases:** Tasks 11 and 12 needed only phase 01 (Task 4). Tasks
  13, 21 and 22 need phase 03 (done at `abc34e3`: Task 22 builds on Tasks 9 and
  20) and Task 12, and run in the order 13, 21, 22.

## 1. Summary

The app gains structured, redacted server-side logs and a live stats view for
the week 11 crit ("Fly by instruments"), and a pure name-to-defaults guesser
built from the USDA FoodKeeper data (both done). Tasks 13, 21 and 22 then give
items real substance, in the data and the API but not yet in the UI (phase 05
builds the controls):
- **Task 13:** measure types (fill, count, have), amounts, and expiry buckets
  backed by an estimated date that moves on its own; the guess is applied on add
- **Task 21:** writes for each, with attribution and latest-wins, live to the
  household
- **Task 22:** Offer some (a portion split into its own item, merged back on
  withdraw) and amounts and dates on live offers, without ever saying who set them

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
| FR11, FR13 | **Task 12 (done):** the name → measure, category, shelf-life and icon-key guess, as a pure function and generated data. **Task 13:** applied by `addItem` |
| FR11–FR13 (model and buckets) | **Task 13:** the columns, `bucketFor` and the moving estimate |
| FR12 (estimates, attribution, latest wins), FR13 (setting a bucket or exact date), FR11 (changing the measure) | **Task 21** |
| FR26 (Offer some), FR32 (editing values updates the live offer) | **Task 22** |

### 2.2 Non-functional

| NFR | Part implemented here |
| --- | --- |
| NFR-Course | Task 11: one structured line per user action, to stdout (read with `flyctl logs`), and a live stats view |
| NFR-Privacy | Task 11: logs and the stats view contain no locations, pickup notes, photos, raw tokens, cookies, member names, household names, item names or full URLs (invite and device links carry tokens in the path) |
| NFR-Resources | Task 11: a 200-entry in-memory ring, no new dependency. Task 12: the client table is at most 8 KB gzipped (spec §4 "compact guess table"). Tasks 13–22: no new dependency |
| NFR-Privacy (offers) | Task 22: neighbour and claimer payloads carry an item's amount and dates, never who set them |
| NFR-Effortless | Task 21 keeps every write one request with no confirmation; Task 14 builds the one-tap controls |

### 2.3 Out of scope for this phase

| Deferred | Phase |
| --- | --- |
| Visual controls (slider, stepper, expiry picker, tape, panel), sending `today`, the client guess for pending rows, attribution wording, the "Offer some…" control in the sheet, past-estimate on offers | 05 (Task 14) |
| Backfilling existing items with a guess | Never: items already on the volume read as Have / other / Unknown until someone edits them |
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
- **Tasks 13, 21, 22 (confirmed 2026-10-07):** the attribution reading rule, the
  date handling, Offer some's split-and-merge and the neighbour-payload privacy
  rule are in §4.3.
- **The stats view is public and aggregate-only** (Task 11): it shows counts
  and the last 30 actions as `who` (8 hex characters of a token hash) +
  action + status + time. No household, member or item names. This is a call
  the user may veto after seeing it (Task 11 human review); the alternative is
  a `flyctl secrets` token gate.
- **"Who" is a device, not a person:** the first 8 hex characters of the
  stored token hash. It cannot be turned back into a token.

## 3. Existing code context (Tasks 11–12 verified at `364c91e`; Tasks 13, 21, 22 at `43c6d87`; both 2026-10-07)

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

**Tasks 13, 21 and 22** (verified 2026-10-07, commit `43c6d87`)
- Baseline: `pnpm typecheck` 0 errors, `pnpm lint` clean, `pnpm test:unit` 308
  passed in 23 files. Spec files need the running app (`APP_URL`).
- `src/lib/schema.ts` `items`: `id`, `household_id` (cascade), `name`,
  `created_by` (members, set null), `created_at`, `removed_at`. No measure,
  category, amount or date column exists. The migrations end at
  `drizzle/0005_solid_random.sql` (passkeys). `openDb(path)` in `src/lib/db.ts`
  runs `./drizzle` on open (so `openDb(":memory:")` in a unit test migrates a
  fresh database), and `Db`, `Tx` are exported there.
- `src/lib/items.ts` today:
  ```ts
  export interface Item { id: string; householdId: string; name: string; createdBy: string; createdAt: number }
  export function addItem(db: Db, session: Session, name: string): Item
  export function listPantry(db: Db, householdId: string): Item[]
  export function recordOutcome(db, session, itemId, outcome: "used" | "binned"): HistoryEntry & { offerChanges: OfferChange[] }
  export function undoOutcome(db, session, historyId): Item
  ```
  `toItem(row)` is private there; `addItem` is the only `insert(items)`.
  `Outcome = "used" | "binned" | "given"`.
- `src/lib/offers.ts` today: `PublicOffer { id, itemName, fromName,
  communityIds, createdAt }`, `ClaimedOffer { id, itemName, fromName, note,
  status, claimedAt }`, `OfferChange { kind: "posted" | "taken" | "closed" |
  "note"; offer: MyOffer; offererHouseholdId; communities: { id; fromName }[];
  claim: { householdId; offer: ClaimedOffer } | null }`. Private: `OfferRow`,
  `offerColumns` (joins `items.name`), `readOffer`, `changeOf`, `claimedOf`,
  `withdrawRow`. Exported: `createOffer(db, session, { itemId, note?,
  communityIds? })`, `withdrawOffer`, `retargetOnLeave(tx, householdId,
  communityId)`, `collectOffer`, `offersSnapshotFor`. `offers.item_id` is
  `references(items.id, { onDelete: "cascade" })`, and `createOffer` throws
  `ConflictError("Already offered.")` when an item has an open offer.
- `src/lib/offerEvents.ts` `offerEvents(change)` orders `offer.mine`,
  `offer.claim`, then the community events; every offer endpoint publishes
  `publishAll(offerEvents(change))`. `src/lib/live.ts` `LiveEvent` has
  `item.added { item, by, rid? }`, `item.removed`, `item.restored`, the
  membership and community events and the five `offer.*` events. `householdChannel`
  and `communityChannel` name the channels.
- `src/lib/http.ts` `withSession(context, run)` maps the domain errors to 400,
  403, 404 and 409 and a missing session to 401 for JSON; `json`, `failure`,
  `wantsJson`, `cleanRid`. `src/pages/items/index.ts` (add) predates it and
  keeps its own branching because a failed add rewrites `/`.
- Client: `pantryState.ts` `pantryReducer` handles `event.added`,
  `event.removed`, `event.restored`; `add.pending` builds the temporary `Item`
  (`id: "pending:<rid>"`, `householdId: ""`, `createdBy: ""`). `useLiveStream.ts`
  `EVENT_TYPES: LiveEvent["type"][]` lists the events the page listens for, and
  `PantryList.tsx` `onEvent` and `OffersFeed.tsx` handle them. `offersState.ts`
  `offersReducer` handles the `offer.*` actions.
- `Item` literals in tests that gain fields: `src/lib/live.test.ts` (line 6),
  `src/lib/sse.test.ts` (line 8), `src/components/pantryState.test.ts` (line 12).
- Spec helpers: `spec/neighbours.ts` (`neighbourhood`, `addPantryItem`,
  `offerItem`, `offerNamed`, `claim`, `act`, `apiOffers`, `apiPantry`,
  `openStreamFor`, `ownAddress`); `spec/live.test.ts` has a local `inviteInto(host,
  memberName)` for a second member of one household and `open(me)` for a stream,
  which Task 21's spec copies. `spec/http.ts` `client(baseUrl, { headers })`
  has `post`, `postJson`, `get`, `cookie`.
- `src/lib/guess.ts` exports `makeGuesser`, `normaliseName`, `Measure`,
  `Category`, `Guess`, `GuessEntry`, `GuessTable` (§4.2). `src/data/foodkeeper.json`
  is 45 KB; `resolveJsonModule` is on in `astro/tsconfigs/base.json`.
- Logging: `ACTIONS` in `src/lib/requestLog.ts`; the unit test "names every POST
  endpoint" fails for an endpoint with no entry. `redact`'s allowlist already
  has `kind`.
- The claimer-pantry slice (`plans/2026-10-07-claimer-pantry.md`) is planned, not
  built at `43c6d87`. Its `collectOffer` change inserts an item for the claimer;
  Task 13 hands it `insertItem`.
- Conventions: `import type`; Biome (`pnpm format`); services take `db` first
  and never touch requests; events publish after the commit (CLAUDE.md "Live
  changes"); unit tests beside the code; one spec file per area.

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
  trailing `s` unless the word ends `ss`, `us` or `is`; `oes`→`o` first
  (found in execution: the stated rules gave `tomatoe` and `hummu`). `"Eggs "` → `"egg"`,
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

### 4.3 The item model (Tasks 13, 21, 22)

**Columns added to `items`.** Migration `0006` (Task 13) adds all but
`portion_of`; migration `0007` (Task 22) adds `portion_of`. Every new column is
nullable or has a default, so `ALTER TABLE … ADD` applies to the rows already on
the Fly volume. Generated with `pnpm db:generate` after editing `schema.ts`,
never hand-written (CLAUDE.md "Generated files").

| column (TS property) | type | default | meaning |
| --- | --- | --- | --- |
| `category` | text, one of the ten `Category` values | `'other'` | from `guess` |
| `icon_key` (`iconKey`) | text | null | from `guess` |
| `measure` | text `fill` / `count` / `have` | `'have'` | from `guess`, changeable |
| `fill_stop` (`fillStop`) | integer 0–4 | 4 | 4 Full, 3 ¾, 2 ½, 1 ¼, 0 Nearly out |
| `count` | integer 1–999 | 1 | |
| `exact_amount` (`exactAmount`) | real | null | replaces the stop display until a fill stop is next set |
| `exact_unit` (`exactUnit`) | text `g` / `kg` / `ml` / `L` / `count` | null | set and cleared together with `exact_amount` |
| `estimated_expiry` (`estimatedExpiry`) | text `YYYY-MM-DD` | null | `today + shelfDays`, or `today + a bucket's days` |
| `exact_expiry` (`exactExpiry`) | text `YYYY-MM-DD` | null | the optional exact date; wins over the estimate |
| `value_set_by` / `value_set_at` | text → `members` (set null) / integer ms | null | the **value group**: measure, stop, count, exact amount |
| `expiry_set_by` / `expiry_set_at` | same | null | the **expiry group**: both dates |
| `portion_of` (`portionOf`, Task 22) | text → `items` (set null) | null | the item this one was split from by Offer some |

**Per-value, latest write wins.** Each group has one stamp. A write replaces its
group's columns and stamp unconditionally; the server applies writes in arrival
order, and SQLite serialises them. Nothing compares versions.

**Reading an attribution (stored here, displayed by Task 14).** `*_set_at` null
means **Guessed** (the app's default, and every item no one has touched).
`*_set_at` set and `*_set_by` null means **a former member** (the member left and
the foreign key cleared). Both set means that member's name, taken from the
snapshot's `members`.

**Dates.** Calendar dates are `YYYY-MM-DD` strings and no time zone is stored.
"Today" is the viewer's local date, sent by the client in a `today` form field.
`cleanToday` accepts it only when it is a real date within one day of the
server's UTC date (every real time zone is), else it uses the server's UTC date.
A plain form post has no `today`, so the estimate can be a day out: accepted,
because it is a rough estimate.

**Buckets.** `bucketFor(estimated, exact, today)` uses the exact date when there
is one, else the estimate. `d` is whole days from today to that date:

| bucket | when |
| --- | --- |
| `past` | `d < 0` |
| `use-soon` | `0 ≤ d ≤ 2` |
| `this-week` | `3 ≤ d ≤ 7` |
| `this-month` | `8 ≤ d ≤ 31` |
| `long-lasting` | `d ≥ 32` |
| `unknown` | neither date is set |

Choosing a bucket stores `today + 2 / 5 / 20 / 90` days (`unknown` stores
null) and clears the exact date. Choosing an exact date leaves the estimate
alone. Clearing the exact date leaves the estimate in force. `past` cannot be
chosen.

**Writes that depend on the measure.** `fillStop` and an exact amount need the
item to be `fill`; `count` needs `count`; a `have` item takes no value write.
Setting a `fillStop` clears `exact_amount` and `exact_unit`. Changing the
measure keeps the other measures' columns, so switching back restores them.
A write on an item that is another household's, or is removed, is a 404.

**Events.** `item.updated { item, by }` goes on the household channel, built by
`itemEvents.ts`. The client applies it per group and only if the incoming group's
`*_set_at` is not older than the row's (null counts as 0), so a late echo of an
earlier write cannot undo a later one.

**Offer some (Task 22).** `createOffer` takes `portion?: number`:
- `count` item: `1 ≤ portion ≤ count − 1`. The portion item's count is `portion`
  and the original's is `count − portion`.
- `fill` item with no exact amount: `1 ≤ portion ≤ fillStop − 1`, in quarters.
  The portion's `fillStop` is `portion`; the original's is `fillStop − portion`.
- `have` items, and fill items with an exact amount, refuse (400).
- The portion is a new item: same name, category, icon key, measure, expiry
  dates and attributions, `created_by` and `created_at` copied, `portion_of` the
  original. Both rows get `value_set_by` the offering member and `value_set_at`
  now. The offer is on the portion; the original stays in the pantry.
- Withdrawing a portion's offer (`withdrawOffer`, and a community leave that
  withdraws it) **merges it back** when the original is still in the pantry, has
  no open offer of its own, has the same measure (`count` or `fill`), neither
  side has an exact amount, and the sum fits (count ≤ 999, fill ≤ 4). The
  original takes the sum and keeps its attribution as it was; the portion row is
  deleted (its offer rows cascade). Otherwise the portion simply stays as its own
  pantry row. A portion that is used, binned or collected never merges.

**Offer payloads (Task 22).** Neighbours and claimers get what an item *is*, never
who said so:

```ts
// src/lib/offers.ts
export interface OfferValue {
  category: Category; iconKey: string | null;
  measure: Measure; fillStop: number; count: number;
  exactAmount: number | null; exactUnit: Unit | null;
  estimatedExpiry: string | null; exactExpiry: string | null;
}
```

`PublicOffer` and `ClaimedOffer` each gain `value: OfferValue`. A value change on
an item with an open offer gives an `OfferChange` of kind `"valued"`, and
`offerEvents` turns it into `offer.updated` on each target community channel when
the offer is `offered`, or `offer.claim` to the claimer when it is `claimed`.

**What this phase hands to phase 05** (exact, so Task 14 never reopens this file):

```ts
// src/lib/expiry.ts (pure, no node imports, so the client can import it)
export type Bucket = "past" | "use-soon" | "this-week" | "this-month" | "long-lasting" | "unknown";
export type SettableBucket = Exclude<Bucket, "past">;
export const REPRESENTATIVE_DAYS: Record<Exclude<SettableBucket, "unknown">, number>; // 2, 5, 20, 90
export function isCalendarDate(value: unknown): value is string;
export function addDays(date: string, days: number): string;
export function daysUntil(date: string, today: string): number; // negative once past
export function bucketFor(estimated: string | null, exact: string | null, today: string): Bucket;
export function estimateFor(bucket: SettableBucket, today: string): string | null;
export function utcToday(now?: number): string;
export function cleanToday(raw: unknown, now?: number): string;

// src/lib/items.ts
export type Unit = "g" | "kg" | "ml" | "L" | "count";
export const UNITS: readonly Unit[];
export interface Item {
  id: string; householdId: string; name: string; createdBy: string; createdAt: number;
  category: Category; iconKey: string | null;
  measure: Measure; fillStop: number; count: number;
  exactAmount: number | null; exactUnit: Unit | null;
  estimatedExpiry: string | null; exactExpiry: string | null;
  valueSetBy: string | null; valueSetAt: number | null;
  expirySetBy: string | null; expirySetAt: number | null;
}
```

Endpoints (form-encoded in, `{ item: Item }` out, `Accept: application/json`):

| endpoint | fields (exactly one group) | effect |
| --- | --- | --- |
| `POST /items` (exists) | `name`, `rid?`, `today?` | guessed fields and estimate applied |
| `POST /items/:id/value` | `fillStop` (0–4), or `count` (1–999), or `exactAmount` + `exactUnit`, or `exactAmount=` (empty clears) | value group |
| `POST /items/:id/measure` | `measure` | value group stamped, other columns kept |
| `POST /items/:id/expiry` | `bucket` + `today`, or `date`, or `clearDate=1` | expiry group |
| `POST /offers/create` (exists) | adds `portion?` | Offer some |

What Task 14 still has to do, so it is not lost: send `today` with adds and
expiry writes; swap the pending row's neutral defaults in `pantryState.ts` for
`makeGuesser(guess-client.json)`; render the controls and attributions; and add
the "Offer some…" control to `OfferSheet.tsx`, posting `portion`.


## 5. Task breakdown

Tasks 11 and 12 are done. The rest runs in order: Task 13 (the model), then
Task 21 (the writes), then Task 22 (Offer some and offer values). Each ends
green and committed.

### Task 11: Structured, redacted server logging with a live stats view

- [x] Done

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

- [x] Done

- **Description:** A pure `guess(name)` and the generated data behind it, for
  Task 13 to apply on add and for the client to run optimistically. No schema,
  endpoint or UI.
- **Files:**
  - `scripts/data/foodkeeper-en.json` (new, the raw file from §2.4, committed;
    if it is over 1.5 MB, leave it untracked, record its sha256 in
    `src/data/FOODKEEPER.md`, and add it to `.gitignore`).
  - `biome.json`: add `"!scripts/data"` to `files.includes`, and the two
    generated files `"!src/data/foodkeeper.json"` and
    `"!src/data/guess-client.json"` (found in execution: Biome would
    pretty-print them and the build would then rewrite them).
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

### Task 13: The item model: columns, expiry buckets, and the guess applied on add

- [x] Done

- **Description:** Items carry a measure, category, icon key, amounts and two
  expiry dates, all defaulted by `guess(name)` when added, and `bucketFor` turns
  the dates into the five buckets plus Unknown. No endpoint, control or visible
  change: `GET /api/pantry` and the live `item.added` payload simply carry the
  new fields. `insertItem` is the one place an item row is created.
- **Files:**
  - `src/lib/schema.ts`: the `items` columns in §4.3 (not `portion_of`).
  - `drizzle/0006_*.sql` and `drizzle/meta/*` (generated by `pnpm db:generate`).
  - `src/lib/expiry.ts` (new) + `expiry.test.ts`: the §4.3 hand-off signatures.
  - `src/lib/guessServer.ts` (new): `export const guessItem: (name: string) =>
    Guess = makeGuesser(foodkeeperTable)`, where the table is
    `src/data/foodkeeper.json` (`resolveJsonModule` is on in Astro's base tsconfig).
  - `src/lib/items.ts`: `Unit`, `UNITS`, the extended `Item`, `toItem`,
    `insertItem`, and `addItem(db, session, name, today = utcToday())`.
  - `src/lib/testItem.ts` (new): `testItem(overrides?: Partial<Item>): Item`, a
    complete `Item` for tests. `src/lib/live.test.ts`, `src/lib/sse.test.ts` and
    `src/components/pantryState.test.ts` use it in place of their `Item` literals.
  - `src/components/pantryState.ts`: the `add.pending` temporary item gets
    neutral defaults (`category: "other"`, `measure: "have"`, `fillStop: 4`,
    `count: 1`, everything else null). Task 14 swaps in the client guess.
  - `src/pages/items/index.ts`: read the `today` form field with `cleanToday`
    and pass it to `addItem`.
  - `src/lib/migrations.test.ts` (new).
  - `spec/estimates.test.ts` (new; Task 21 adds to it).
- **Tests to write first (red):**
  - Unit `expiry.test.ts`, with `today` injected:
    - `bucketFor`: a date of yesterday is `past`; today, +1 and +2 are
      `use-soon`; +3 and +7 are `this-week`; +8 and +31 are `this-month`; +32
      and +400 are `long-lasting`; both null is `unknown`; an exact date wins over
      an estimate (estimate long-lasting, exact yesterday gives `past`); an
      estimate alone is used when the exact date is null.
    - `addDays` crosses a month end, a year end and 2028-02-29 correctly, and
      accepts negative days. `daysUntil` is negative for a past date.
    - `isCalendarDate` rejects `2026-02-30`, `2026-13-01`, `26-1-1`, `""`, a
      number and `null`, and accepts `2028-02-29`.
    - `estimateFor("use-soon" | "this-week" | "this-month" | "long-lasting", today)`
      is `today` plus 2, 5, 20 and 90 days, and `estimateFor("unknown", today)`
      is null. `bucketFor(estimateFor(b, today), null, today) === b` for each.
    - `cleanToday`: a real date within one day of the injected `now`'s UTC date
      is kept; one two days off, a malformed one, `undefined` and a non-string
      give the UTC date. `utcToday(now)` is the `YYYY-MM-DD` of `now` in UTC.
  - Unit `items.test.ts` (`addItem`, `listPantry`, `insertItem`, `toItem`):
    - Adding `"milk"` with `today = "2026-10-07"` gives `measure`, `category`
      and `iconKey` equal to `guessItem("milk")`'s, `fillStop` 4, `count` 1,
      `estimatedExpiry === addDays("2026-10-07", guessItem("milk").shelfDays)`,
      `exactExpiry`, `exactAmount` and `exactUnit` null. (The test reads the
      guess instead of hard-coding it, so a tuned table cannot break it.)
    - `"Eggs"` gives `count`; `"mystery thing"` gives `have`, `other`, null
      icon key and a null `estimatedExpiry`.
    - A guessed item has `valueSetBy`, `valueSetAt`, `expirySetBy`,
      `expirySetAt` all null, and `createdBy` is still the member.
    - `insertItem` with `createdBy: null` gives `item.createdBy === ""` and an
      item the household's `listPantry` returns; the same call runs inside a
      `db.transaction`.
    - `addItem` without a `today` argument uses `utcToday()`.
    - `listPantry` and `snapshotFor` return the new fields.
  - Unit `migrations.test.ts`: apply `drizzle/0000_*` to `0005_*` to a fresh
    in-memory `better-sqlite3` database (the `.sql` files in order, split on
    `--> statement-breakpoint`), insert an item row with the old columns only,
    then apply `0006_*`. The row survives with `category 'other'`, `measure
    'have'`, `fill_stop 4`, `count 1` and null dates and attributions.
  - Unit `pantryState.test.ts`: `add.pending` builds a temporary item with the
    neutral defaults; every existing case still passes.
  - Spec `spec/estimates.test.ts` (own household and `fly-client-ip`):
    - `POST /items` as JSON with `name=milk` and `today=2026-10-07` returns an
      `item` whose `measure` is `fill` and whose `estimatedExpiry` is after
      `2026-10-07`; `GET /api/pantry` returns the same item.
    - A `today` of `1999-01-01` is ignored: the estimate is within one day of the
      server's real date plus the shelf life (compare to the machine's UTC date
      with a one-day tolerance).
    - `"mystery thing"` is `have` with a null `estimatedExpiry`.
- **Implementation (green):** edit `schema.ts`, run `pnpm db:generate`, write
  `expiry.ts`, `guessServer.ts`, `insertItem`, `toItem`, `addItem`; fix the
  literals; read `today` in the endpoint. `insertItem(tx: Db | Tx, input: {
  householdId: string; createdBy: string | null; name: string; today: string;
  at?: number }): Item` is the only `insert(items)` in the app apart from Task
  22's split. **If the claimer-pantry slice
  (`plans/2026-10-07-claimer-pantry.md`) has landed**, switch its receive insert
  in `collectOffer` to `insertItem` (`createdBy: null`, `today: utcToday()`), so
  received items are guessed too; if it has not, its Task 1 uses `insertItem`.
- **Refactor:** none.
- **Acceptance:**
  - All tests above green; `pnpm check` green (with the app running).
  - The migration test passes, and a database file from before this task opens
    with its items intact (`pnpm build && pnpm start` against a copy of
    `.data/app.db` made first, then `GET /api/pantry` for a signed-in household).
  - Nothing in the pantry looks different in a browser (the new fields are
    unused until Task 14): load `/` locally and confirm the list still renders and
    adds.
- **Human review:** none. Nothing visible changes, and the guess quality was
  accepted in Task 12.
- **Depends on:** Task 12 (done at `6704cba`).
- **Found in execution:** drizzle-kit drops `ON DELETE set null` from an `ADD COLUMN`
  reference, which made deleting a member who had set a value fail with a foreign
  key error. `0006` was hand-edited (user-approved 2026-10-07) to add it back;
  `migrations.test.ts` pins it. `0007` has no foreign-key column added by
  `ADD COLUMN` except `portion_of`: check the same thing there.
- **Found in execution:** `spec/api.test.ts` pinned an item's exact keys; updated
  to the new set.

### Task 21: Value, measure and expiry writes with attribution and live updates

- [x] Done

- **Description:** Three endpoints change an item's amount, measure and expiry.
  Each write stamps who and when, the latest wins per group, and every other
  open session in the household hears `item.updated` within a second. No
  controls: the endpoints are exercised by specs until Task 14 builds the UI.
- **Files:**
  - `src/lib/itemValues.ts` (new) + `itemValues.test.ts`: `ValueChange`,
    `ExpiryChange`, `parseValueChange`, `parseExpiryChange`, `parseMeasure`,
    `setValue`, `setMeasure`, `setExpiry` (signatures below).
  - `src/lib/itemEvents.ts` (new) + `itemEvents.test.ts`: `updatedEvents`.
  - `src/lib/live.ts`: `LiveEvent` gains `{ type: "item.updated"; item: Item;
    by: Actor }`.
  - `src/lib/requestLog.ts`: `ACTIONS` gains `"POST /items/[id]/value"` →
    `"item.value"`, `"POST /items/[id]/measure"` → `"item.measure"`,
    `"POST /items/[id]/expiry"` → `"item.expiry"`.
  - `src/pages/items/[id]/value.ts`, `measure.ts`, `expiry.ts` (new, thin, each
    `withSession` from `src/lib/http.ts`).
  - `src/components/pantryState.ts`: action `{ type: "event.updated"; item: Item }`.
  - `src/components/useLiveStream.ts`: `"item.updated"` added to `EVENT_TYPES`
    (a type missing there is never listened for).
  - `src/components/PantryList.tsx`: `onEvent` dispatches `event.updated` (one
    branch).
  - `spec/estimates.test.ts` (extend), `CLAUDE.md` (one bullet under "Live
    changes": an item's value and expiry are estimates with a setter and a time;
    both null means guessed; item events are built by `itemEvents.ts`).
- **Interfaces:**

  ```ts
  // src/lib/itemValues.ts
  export type ValueChange =
    | { kind: "fill"; stop: number }
    | { kind: "count"; count: number }
    | { kind: "exact"; amount: number; unit: Unit }
    | { kind: "clearExact" };
  export type ExpiryChange =
    | { kind: "bucket"; bucket: SettableBucket }
    | { kind: "date"; date: string }
    | { kind: "clearDate" };
  export function parseValueChange(form: FormData): ValueChange;   // throws ValidationError
  export function parseExpiryChange(form: FormData): ExpiryChange; // throws ValidationError
  export function parseMeasure(form: FormData): Measure;           // throws ValidationError
  export function setValue(db: Db, session: Session, itemId: string, change: ValueChange): Item;
  export function setMeasure(db: Db, session: Session, itemId: string, measure: Measure): Item;
  export function setExpiry(db: Db, session: Session, itemId: string, change: ExpiryChange, today: string): Item;

  // src/lib/itemEvents.ts
  export function updatedEvents(item: Item, by: Actor): Routed[];
  ```

- **Tests to write first (red):**
  - Unit `itemValues.test.ts` (in-memory db; one household, two members, `Sam`
    and `Alex`, via `createInviteLink` and `joinByLink`):
    - `setValue` `fill` sets `fillStop`, clears `exactAmount` and `exactUnit`,
      stamps `valueSetBy` the caller and `valueSetAt` now, and leaves the
      expiry group untouched. `count`, `exact` (amount and unit together) and
      `clearExact` likewise.
    - Wrong measure: `fill` on a `count` item, `count` on a `fill` item, `exact`
      on a `count` item, and any value write on a `have` item each throw
      `ValidationError` and change nothing.
    - **Latest wins:** Sam sets the stop to 2, then Alex to 1: the item has
      stop 1 and `valueSetBy` Alex. A `count` write by Alex does not change the
      expiry group's stamp.
    - `setMeasure` stamps the value group, changes only `measure`, and switching
      `fill` → `count` → `fill` leaves `fillStop` and `exactAmount` as they were.
    - `setExpiry` `bucket "this-week"` with `today = "2026-10-07"` stores
      `estimatedExpiry` 2026-10-12 and clears `exactExpiry`; `bucket "unknown"`
      stores null; `date` stores `exactExpiry` and leaves the estimate;
      `clearDate` clears only `exactExpiry`. Each stamps the expiry group only.
      `bucketFor` of the stored item moves to `use-soon` when `today` is later
      (the bucket "moves on its own").
    - A removed item, another household's item and an unknown id throw
      `NotFoundError`.
    - **Parsing:** `fillStop` of `5`, `-1`, `1.5`, `x` and `` are refused; `count`
      of `0`, `1000`, `2.5` refused and `1`, `999` accepted; `exactAmount` of `0`,
      negative, `NaN`, `1e9` refused and a bad `exactUnit` refused; an empty
      `exactAmount` is `clearExact`; two groups at once (`fillStop` and `count`)
      refused; `bucket=past` and `bucket=soon` refused; `date=2026-02-30`
      refused and a date outside 2000-01-01..2100-12-31 refused; `parseMeasure`
      accepts only `fill`, `count`, `have`.
  - Unit `itemEvents.test.ts`: `updatedEvents` is one event on
    `householdChannel(item.householdId)` with type `item.updated`, the item and
    `by`.
  - Unit `pantryState.test.ts` (`event.updated`):
    - replaces the matching row's item; ignores an unknown id.
    - **a stale echo loses:** a row whose `valueSetAt` is 200 ignores an
      incoming item whose `valueSetAt` is 100 for the value group, while still
      taking its newer expiry group (and the reverse).
    - applying the same event twice leaves the same rows.
  - Unit `requestLog.test.ts`: the existing "names every POST endpoint" test
    fails until the three `ACTIONS` entries exist (red, then green).
  - Spec `spec/estimates.test.ts`:
    - Add milk; `POST /items/:id/value` with `fillStop=2` returns 200 and an
      item with `fillStop` 2 and `valueSetBy` the caller's member id (read from
      `/api/pantry`'s `me.id`); `/api/pantry` agrees.
    - Wrong measure is 400; `fillStop=9` is 400; an unknown item id is 404;
      another household's item is 404; no session is 401 (JSON).
    - `POST /items/:id/expiry` with `bucket=use-soon` and `today=2026-10-07`
      stores 2026-10-09; `date=2026-12-25` sets the exact date; `clearDate=1`
      clears it; `bucket=past` is 400.
    - `POST /items/:id/measure` with `measure=count` returns that measure and the
      stamp.
    - **Live:** two members of one household; Sam has a stream open; Alex's
      value write reaches Sam as `item.updated` within 1000 ms, with `by.name`
      Alex and the changed item; a stranger's stream hears nothing.
    - **Latest wins over HTTP:** Alex then Sam write different stops; the item
      ends with Sam's stop and Sam's `valueSetBy`.
    - Used items refuse writes (404).
- **Implementation (green):** `parse*` are pure and build the change objects;
  each `set*` runs one transaction that reads the item for the caller's
  household, applies the change, stamps with `Date.now()` and the member id, and
  returns `toItem` of the updated row. Each endpoint reads the form, parses,
  calls the service, publishes `updatedEvents(item, { id: session.member.id,
  name: session.member.name })` after the commit, returns `{ item }`, and calls
  `logDetail({ kind })` with `fill`, `count`, `exact`, `bucket`, `date` or
  `clear` (`kind` is already allowlisted). `today` for `setExpiry` is
  `cleanToday(form.get("today"))`.
- **Refactor:** none.
- **Acceptance:**
  - All tests above green; `pnpm check` green.
  - With the app running locally, `curl` (or the spec) shows a write reaching an
    open stream as `item.updated`.
  - `/stats` shows `item.value`, `item.measure`, `item.expiry` counts, and the
    log lines for them carry no item name and no member name.
- **Human review:** none. No UI. The estimate wording ("Sam's estimate, 2 h
  ago") is built and reviewed in Task 14.
- **Depends on:** Task 13.

### Task 22: Offer some, and values on live offers

- [ ] Done

- **Description:** An offer can cover part of a count or fill item: the portion
  becomes its own item that carries the offer, and withdrawing the offer folds it
  back. Neighbours' and claimers' offers carry the item's amount and expiry dates
  and update live when the item is edited. No controls: Task 14 adds "Offer
  some…" to the sheet.
- **Files:**
  - `drizzle/0007_*.sql` and `drizzle/meta/*` (generated), `src/lib/schema.ts`
    (`portion_of`).
  - `src/lib/items.ts`: `Item` unchanged (`portion_of` is server-side only);
    `ItemUpdate`, and `setValue`, `setMeasure`, `setExpiry` (in
    `src/lib/itemValues.ts`) now return it:
    ```ts
    export interface ItemUpdate { item: Item; offerChanges: OfferChange[] }
    ```
  - `src/lib/offers.ts`: `OfferValue`, `ItemSplit`, `ItemMerge`, `value` on
    `PublicOffer`, `ClaimedOffer` and `OfferChange`, `split` and `merge` on
    `OfferChange`, kind `"valued"`, `createOffer` input `portion?: number`,
    `valueChangesFor(tx: Tx, itemId: string): OfferChange[]`, the merge in
    `withdrawOffer` and `retargetOnLeave`:
    ```ts
    export interface ItemSplit { remainder: Item; portion: Item; by: { id: string; name: string } }
    export interface ItemMerge { portionId: string; remainder: Item }
    // OfferChange gains: value: OfferValue; split: ItemSplit | null; merge: ItemMerge | null
    // OfferChange["kind"] becomes "posted" | "taken" | "closed" | "note" | "valued"
    ```
  - `src/lib/offerEvents.ts`: builds the new events (order below).
  - `src/lib/live.ts`: `LiveEvent` gains `{ type: "item.merged"; itemId: string;
    item: Item }` and `{ type: "offer.updated"; communityId: string; offer:
    PublicOffer }`.
  - `src/pages/offers/create.ts`: reads `portion`, returns `{ offer, split }`
    (`split` is `{ remainder, portion }` or null), `logDetail({ kind: "some" })`
    when a portion was used.
  - `src/pages/items/[id]/value.ts`, `measure.ts`, `expiry.ts`: publish
    `...updatedEvents(...)` then `...update.offerChanges.flatMap(offerEvents)`.
  - `src/components/pantryState.ts`: `{ type: "event.merged"; itemId: string;
    item: Item }`. `src/components/offersState.ts`: `{ type: "offer.updated";
    offer: PublicOffer }`. `src/components/useLiveStream.ts`: `"item.merged"` and
    `"offer.updated"` in `EVENT_TYPES`. `PantryList.tsx` and `OffersFeed.tsx`:
    one dispatch branch each.
  - Tests: `offers.test.ts`,
    `offerEvents.test.ts`, `itemValues.test.ts`, `pantryState.test.ts`,
    `offersState.test.ts`, `snapshot.test.ts`.
  - `spec/offer-some.test.ts` (new), `spec/privacy.test.ts` (extend),
    `specs/2026-10-06-shared-pantry.md` (FR26 gains the portion rules of §4.3;
    FR12 gains the attribution reading rule).
- **Event order for one change** (`offerEvents`): the household's `item.updated`
  (remainder) and `item.added` (portion, no `rid`) first when `split` is set, so
  the portion row exists before `offer.mine` names it; then `offer.mine`,
  `offer.claim`, and the community events as before (`offer.updated` for a
  `valued` change on an `offered` offer); then `item.merged` on the household
  channel when `merge` is set. A `valued` change sends no `offer.mine` (the item
  events already carry it) and, on a `claimed` offer, only `offer.claim` with
  the new value.
- **Tests to write first (red):**
  - Unit `offers.test.ts`:
    - **Offer some, count:** an item with `count` 6 offered with `portion` 3
      leaves the original at 3; `listPantry` has both rows, the portion first
      (same `createdAt`, later row) with `count` 3, the same name, and the offer
      on the portion; both rows' `valueSetBy` is the offering member;
      `change.split` has `remainder` and `portion` and `by` the member.
    - **Offer some, fill:** stop 4 with `portion` 1 gives the portion stop 1 and
      the original stop 3.
    - Bounds refused with `ValidationError` and nothing changed: count 6 with
      `portion` 0, 6, 7, -1 and 2.5; fill stop 4 with 0 and 4; fill stop 1 with
      any portion; a `have` item; a fill item with an exact amount.
    - Atomic: an item that is already offered (`ConflictError`) and a household
      in no community (`ValidationError`) leave the item's count unchanged and
      create no portion row.
    - **Merge back:** count 3 + portion 3 withdrawn by `withdrawOffer` gives
      one row of 6 with its old attribution, the portion row deleted
      (`change.merge` set, `remainder.count` 6, `portionId`), and the offer row
      gone. Fill 3 + 1 gives 4.
    - **No merge** (the portion returns as its own pantry row; `change.merge`
      is null) when: the original was used; the measure of either was changed;
      either has an exact amount; the fill sum would pass 4 (original 3, portion
      2 after the original was raised); the original has its own open offer.
    - A community leave that withdraws the portion's offer (`retargetOnLeave`
      path, via `leaveCommunity`) merges back and returns the merge on the
      `closed` change.
    - A collected portion is Given in history, the original is untouched, and
      nothing merges. A used or binned portion does not merge.
    - `valueChangesFor` and the services' `offerChanges`: `setValue` on an item
      with an open `offered` offer returns one `valued` change whose `value`
      reflects the write and whose `offer.status` is `offered`; on a `claimed`
      offer it carries `claim` with `householdId` the claimer's and the new
      `value`; on an item with no open offer it is `[]`.
    - `value` on `offersSnapshotFor`'s `incoming` and `claimed` rows reflects the
      item (`measure`, `count`, both dates, `category`, `iconKey`).
  - Unit `offerEvents.test.ts`:
    - A posted change with `split` yields `item.updated`, `item.added`, then
      `offer.mine` on the household channel, in that order; a change with
      `merge` ends with `item.merged`.
    - A `valued` change on an `offered` offer yields `offer.updated` on each
      target community channel with `value` and with no household id, member id,
      note or `valueSetBy`; on a `claimed` offer it yields only `offer.claim`
      (to the claimer) and no community event.
    - `offer.posted` carries `value`.
    - **Privacy sweep:** serialise every event a `posted`, `valued`, `closed`
      and `taken` change builds for a community or the claimer and assert none
      contains `valueSetBy`, `expirySetBy`, `createdBy` or the offerer's member
      id (the household's own `item.*` events may).
  - Unit `pantryState.test.ts`: `event.merged` removes the portion's row and
    replaces the original's item; an unknown id is a no-op; a portion arriving as
    `event.added` without a `rid` is inserted next to its original.
  - Unit `offersState.test.ts`: `offer.updated` replaces an incoming row's
    `offer.value` and keeps `taken` and `busy`; an unknown id is a no-op;
    `offer.claim` with a new value replaces the claimed row's value.
  - Spec `spec/offer-some.test.ts` (neighbourhood from `spec/neighbours.ts`):
    - Sam adds eggs, sets the measure to count, sets the count to 6, offers with
      `portion=3`: the response has `split`; `/api/pantry` has two rows (3 and
      3), one with an open offer; Priya's `/api/offers` `incoming` has the portion
      with `value.count` 3 and `value.measure` `count`.
    - Withdrawing it: `/api/pantry` has one row, count 6.
    - A bad `portion` is 400 and `/api/pantry` is unchanged.
    - **Live values:** Sam edits the offered portion's count; Priya's open stream
      gets `offer.updated` within 1000 ms with the new `value.count`; Sam's
      other session gets `item.updated`. After Quinn claims, an edit reaches
      Quinn as `offer.claim` with the new value and reaches Priya as nothing.
    - **Live split:** Sam's stream sees `item.updated`, `item.added`, `offer.mine`
      in that order for an Offer some.
  - Spec `spec/privacy.test.ts`: after Sam sets a value and an expiry, then
    offers, Priya's and Quinn's pages, `/api/offers`, `/api/pantry` and frames
    never contain Sam's member id or name, and no payload they receive has a
    `valueSetBy` or `expirySetBy` key. (Priya's pages already must not carry
    Sam's name; this adds the new fields to what is swept.)
- **Implementation (green):** the split runs inside `createOffer`'s
  transaction after the existing checks and before the offer insert, so a
  refusal never splits. `mergePortionBack(tx, itemId): ItemMerge | null` applies
  the §4.3 conditions; `withdrawOffer` and the empty-targets branch of
  `retargetOnLeave` call it after the status update and attach the result to the
  `closed` change (computed before the portion row is deleted, because the
  offer rows cascade). `valueChangesFor` reads the item's open offer inside the
  writer's transaction and builds `changeOf(tx, offerId, "valued", ...)`. The
  value columns join `offerColumns` and `OfferRow`, and `valueOf(row)` builds
  `OfferValue`. Update the file comment in `offerEvents.ts` (the order, and that
  household `item.*` events are built there for a split or merge).
- **Refactor:** none.
- **Acceptance:**
  - All tests above green; `pnpm check` green; `pnpm test` with the app running
    green.
  - With two local browsers (offerer and neighbour) and the endpoints driven by
    `curl` or the spec: Offer some 3 of 6 shows two rows and one offer on the
    neighbour's page; withdrawing leaves one row of 6. (No UI exists for these
    taps, so the pantry list shows them as plain rows.)
  - The migration `0007` applies over a database from before it (extend
    `migrations.test.ts` to apply `0000` to `0007`).
- **Human review:** none. Everything is data and events with automated checks.
- **Depends on:** Task 21 (the writers it extends), Task 9 and Task 20 (done at
  `9cca7c9` and `42655e7`).

## 6. Phase Definition of Done

- [x] Tasks 11–12 complete, each committed with `pnpm check` green
- [x] Task 11 human review accepted
- [x] Task 12 human review accepted
- [ ] Tasks 13, 21 and 22 complete, each committed with `pnpm check` green
- [ ] `pnpm test` passes with the app running (`pnpm build && pnpm start`)
- [ ] After the deploy, the machine boots with migrations `0006` and `0007`
      applied over the existing volume: `mise exec -- flyctl logs -a
      comp4020-final-attwelvedev` shows no migration error, and an existing
      household's `/api/pantry` lists its items with `measure: "have"` and null
      dates
- [ ] After the deploy, `APP_URL=https://comp4020-final-attwelvedev.fly.dev pnpm
      vitest run --project spec spec/estimates.test.ts spec/offer-some.test.ts`
      is green (it creates test households on the live app)
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
| FR11 (measure applied on add), FR13 (defaults and the moving bucket stored as a date) | Task 13 |
| FR12 (estimate, setter and time, latest wins), FR11 (change the measure), FR13 (set a bucket or exact date) | Task 21 |
| FR26 (Offer some, remainder reduced), FR32 (editing values updates the live offer) | Task 22 |
| NFR-Privacy (no setter on neighbour payloads) | Task 22 (`offerEvents.test.ts` sweep, `spec/privacy.test.ts`) |
| Human review (log readability, guess quality) | Task 11, Task 12 (Tasks 13, 21, 22 have none: no visible change) |

## 8. Risks / open questions

None. Notes the executor must not lose:

- **Migrations run on the live volume at boot.** `0006` and `0007` add columns
  with defaults or nulls only, which SQLite applies to existing rows; the
  migration test proves it against a pre-existing row. Take a copy of
  `.data/app.db` before the first local run of the new build.
- **A missing `EVENT_TYPES` entry fails silently.** A new `LiveEvent` type that
  is not in `useLiveStream.ts` is never delivered to the page. Tasks 21 and 22
  each add theirs and a reducer test.
- **Offer some deletes a row on merge.** `offers.item_id` cascades, so deleting a
  merged portion deletes its offer rows. The `closed` change is built before the
  delete and is self-contained (`OfferChange`), so the events still publish.
- **Event order matters for a split.** `item.added` (the portion) must reach the
  household before `offer.mine` names it, or the reducer drops the offer. Task
  22's `offerEvents` test pins the order.
- **The estimate can be a day out** for a plain form post with no `today`
  (§4.3). Accepted.
- **Claimer-pantry slice:** whichever lands second adapts. Task 13 converts its
  receive insert to `insertItem` if it has landed; otherwise its Task 1 calls
  `insertItem`. Its Task 3 also adds a line to this file's Task 13; that line is
  already satisfied by Task 13 above.
- **Task 14 owns the UI** for everything in §4.3, including sending `today`
  and the "Offer some…" sheet control (the list at the end of §4.3).

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
