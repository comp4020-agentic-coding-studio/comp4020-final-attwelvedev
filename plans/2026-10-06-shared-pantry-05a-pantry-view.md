# Shared pantry — Phase 05a: The Enamelware pantry view

- **Date:** 2026-10-06 (re-planned against the code at `68f0191` on 2026-10-07)
- **Status:** Approved
- **Requirements confirmed by user:** yes — 2026-10-06; layout (phase 05 split
  into 05a and 05b, Task 14 split into Tasks 14, 23, 24, 25) confirmed
  2026-10-07
- **Part of:** `plans/2026-10-06-shared-pantry-00-overview.md`. It leans on §3
  (conventions, commands), §4.2 and §4.4. The design source is spec §4.1
  (`specs/2026-10-06-shared-pantry.md`): wireframes, tokens, states.
- **Depends on phases:** 04 (done: measure, estimate, bucket data and the
  `/items/:id/{value,measure,expiry}` endpoints), 03 (offers, the sheet).

## 1. Summary

The pantry becomes the Enamelware design. When this phase ends:
- every page has the new shell (phone tab bar, desktop top bar, footer help
  line) and the one self-hosted font; axe checks contrast in light and dark
- the pantry is grouped under sticky bucket headings with a shelf-life tape,
  value glyph and a trailing Used button on every row
- a row opens in place into a panel: fill slider, count stepper, exact amount,
  measure switch, expiry picker, attribution, and (on phone) Binned and Offer
- the add field's keyboard model is complete (`/`, roving ↑/↓, U/B/O, Esc) and
  remote changes are announced to screen readers, throttled
- the sheet gains "Offer some…"; adds and expiry writes send `today`
- rows have an empty image dish; phase 05b fills it

## 2. Requirements (this phase)

### 2.1 Functional

| FR | Part implemented here |
| --- | --- |
| FR11 | The controls: slider, stepper, "have", measure switch, exact amount |
| FR12 | Attribution text ("Sam's estimate, 2 h ago", Guessed, a former member), one-tap correction, remote-change signalling |
| FR13 | Bucket headings, moving buckets (viewer's local date), expiry picker, exact date |
| FR14 | Trailing Used (one tap, scroll-tap guard), Binned in row or panel, Undo unchanged |
| FR21 | The whole main view except the image (05b) and search tray (05b) |
| FR26 | The "Offer some…" sheet control, posting `portion` |
| FR32 | "past estimate" shown on the pantry row; remote value changes visible |

### 2.2 Non-functional

| NFR | Part implemented here |
| --- | --- |
| NFR-A11y | Roving focus, `/`, U/B/O, Esc, skip link kept, visible Keyboard help, colour independence (tape patterns + text), WCAG AA contrast in light and dark, reduced motion, announcements throttled to one per 5 s |
| NFR-Viewports | 375 and 1280, and a mid-use resize |
| NFR-Resources | One ~40 KB self-hosted font; no new runtime dependency |
| NFR-Effortless | Every outcome still one tap, no dialog (the sheet is the one allowed exception, as before) |

### 2.3 Out of scope for this phase

- Item images, photos, the search tray (phase 05b). The row has a reserved
  image slot (`.dish`) that 05b fills.
- Skeleton rows: the page is server-rendered, so a row list is never blank.
- Map and community creation (phase 06). `/offers`, `/household`,
  `/communities` pages only get the new shell and token colours, not redesigns.
- Moving the connection status into the top band (it stays the first element
  of the pantry island, styled as a band).

### 2.4 Assumptions

See overview §2.4, plus:
- Atkinson Hyperlegible Next is SIL OFL 1.1, from
  `googlefonts/atkinson-hyperlegible-next` (`fonts/variable/AtkinsonHyperlegibleNext[wght].ttf`,
  115 KB). Checked 2026-10-07.
- Without JavaScript the phone row offers Used only (as spec §4.1 puts Binned
  in the open panel). Adding, Used and Undo keep working as plain form posts.
- The breakpoint between "phone" and "desktop" rows is **900 px**. The offers
  rail breakpoint stays 1100 px (`src/styles/pages.css`).

## 3. Existing code context (verified 2026-10-07 at `68f0191`)

- **`src/components/PantryList.tsx`** (488 lines): the island. Props
  `{ initial: Snapshot; addError?: string }`. Holds `useReducer(pantryReducer…)`,
  `communities`, `defaultNote`, `sheet`, `toasts`. Row markup is a flat `<ul
  class="pantry">` of `<li data-item-id aria-busy class>` with `.name`, an
  `.offer-state` span, `Note` / `Withdraw` / `Offer` / `Used` / `Binned` buttons
  (each with an `.sr-only` ` {name}` suffix, so accessible names are
  `Used soup`, `Offer soup`, `Note soup`, `Withdraw soup`). The add form is
  `<form class="add" method="post" action="/items">` with `<label for="name">Add an
  item</label>` and `<input id="name" name="name">`; on submit it clears,
  refocuses and calls `add(name)`, which `postJson("/items", { name, rid })`.
  `onEvent` handles `item.added|removed|restored|updated|merged`, `offer.mine`,
  `membership.joined|left`, `member.removed`. `onOpen` refetches `/api/pantry`.
- **`src/components/pantryState.ts`**: `Row`, `RowOffer`, `RetryAction`,
  `Failure`, `PantryState`, `Action`, `initialState`, `visibleRows`,
  `shownOffer`, `pantryReducer`. `add.pending` builds a neutral item (category
  `other`, measure `have`, no dates). `mergeUpdated(current, incoming)` takes
  each group (value, expiry) only if its `*SetAt` is not older than the row's.
- **`src/components/ToastRegion.tsx`**: `Toast { id; text; actionLabel?;
  onAction?; actions? }`, `ToastRegion({ toasts, onDismiss, durationMs? })`
  (`role="status" aria-live="polite"`, pauses on hover/focus).
- **`src/components/OfferSheet.tsx`**: props `{ mode: "offer"|"note"; itemName;
  communities; initialNote; onSubmit(SheetResult); onClose() }`, `SheetResult
  { note: string; communityIds: string[] }`. A native `<dialog>`.
- **`src/components/api.ts`**: `postJson<T>(path, fields: Record<string,
  string|string[]>)`, `getJson`, `HttpError(status, message)`.
- **`src/components/ago.ts`**: `ago(then: number, now: number): string`.
- **`src/layouts/Base.astro`**: props `{ title: string; wide?: boolean }`;
  `<header><nav aria-label="Main">` with links Pantry, Offers, History,
  Household (signed in) and About; `<main id="main">`; `<footer>` with an About
  link; global styles inline (`is:global`). Imports `../styles/pages.css` and
  `../styles/tokens.css`. `--font` is `system-ui, …` in `tokens.css`.
- **`src/styles/`**: `tokens.css` (all spec colour tokens, light + dark via
  `prefers-color-scheme` and `[data-theme]`), `pantry.css`, `offers.css`,
  `pages.css`. No gradients, no shadows yet.
- **`src/pages/index.astro`**: signed in → `<Base title=household wide>` with
  `.home` (grid, 720px + 360px rail at ≥1100px), the Undo form (no-JS), and
  `<PantryList client:load initial={snapshot} addError>`; signed out → first-run form.
- **`src/data/guess-client.json`** (45 KB) + `src/lib/guess.ts`:
  `makeGuesser(table: GuessTable): (name: string) => Guess`; `Guess { category;
  measure; shelfDays: number | null; iconKey: string | null }`.
- **`spec/browser.ts`**: `PHONE` 375×812, `DESKTOP` 1280×800, `launch()`,
  `openPage(browser, url, viewport)`, `horizontalOverflow(page)`,
  `axeViolations(page)` (colour contrast **disabled**, comment "until Task 14").
  `spec/people.ts`: `startHousehold`, `joinHousehold`, `streamOpen`.
- **Existing browser specs that touch pantry markup** (must stay green):
  `spec/layout/{pantry,live-sync,live-optimistic,offering,offering-layout,offers}.test.ts`.
  They rely on: `getByLabel("Add an item")`; `getByRole("listitem").filter({hasText})`;
  `li[aria-busy="true"]`; button names `Used <name>`, `Offer <name>`, `Note
  <name>`, `Withdraw <name>`, `Undo`, `Edit note`, `Post offer`, `Save note`;
  text `Offered`, `Used by Alex`; `[data-stream="open"]`; a no-JS flow
  (`javaScriptEnabled: false`) of add, Used, Undo at DESKTOP.
- **Test setup:** vitest 5, two projects (`unit`: `src/**/*.test.ts`; `spec`:
  `spec/**/*.test.ts`, needs the app). `spec/suite-size.test.ts` caps browser
  files at 1000 lines; the biggest today is `offering.test.ts` (280). Browser
  files run in parallel, so this phase puts its slow checks in **one file per
  task** (`spec/layout/shell.test.ts` extended, `pantry-rows.test.ts`,
  `pantry-panel.test.ts`, `pantry-keys.test.ts`), none over ~250 lines.

### Interfaces from earlier phases (exact)

Overview §4.2 types, plus these from phases 02–04, copied from the source:

```ts
// src/lib/expiry.ts (pure; the client imports it)
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
export type Outcome = "used" | "binned" | "given";
export type Unit = "g" | "kg" | "ml" | "L" | "count";
export const UNITS: readonly Unit[];
export interface Item {
  id: string; householdId: string; name: string; createdBy: string; createdAt: number;
  category: Category; iconKey: string | null;
  measure: Measure; fillStop: number; count: number; // fillStop 4 Full … 0 Nearly out
  exactAmount: number | null; exactUnit: Unit | null;
  estimatedExpiry: string | null; exactExpiry: string | null; // YYYY-MM-DD
  valueSetBy: string | null; valueSetAt: number | null;
  expirySetBy: string | null; expirySetAt: number | null;
}

// src/lib/guess.ts (pure)
export type Measure = "fill" | "count" | "have";
export type Category = "dairy" | "produce" | "grains" | "tins" | "meat" | "frozen" | "condiments" | "drinks" | "snacks" | "other";
export interface Guess { category: Category; measure: Measure; shelfDays: number | null; iconKey: string | null }
export function makeGuesser(table: GuessTable): (name: string) => Guess;

// src/lib/snapshot.ts
export interface Snapshot {
  household: { id: string; name: string }; me: { id: string; name: string };
  members: { id: string; name: string }[]; items: Item[]; offering: Offering;
}
// src/lib/offers.ts
export interface Offering { communities: { id: string; name: string }[]; defaultPickupNote: string | null; open: MyOffer[] }
// POST /offers/create takes itemId, note?, communityIds? (repeated), portion? → { offer: MyOffer }

// src/lib/live.ts: LiveEvent includes
// { type: "item.added"; item: Item; by: Actor; rid?: string }
// { type: "item.removed"; itemId; itemName; outcome: Outcome; historyId; by: Actor }
// { type: "item.restored"; item: Item; by: Actor } | { type: "item.updated"; item: Item; by: Actor }
// { type: "item.merged"; itemId: string; item: Item } | { type: "member.joined"; member: {id; name} }
// { type: "member.removed"; member: {id; name}; by: Actor }   (Actor = { id: string; name: string })
```

Item write endpoints (form-encoded in, `Accept: application/json`, `{ item: Item }`
out, 400/404 `{ error }`; wrong measure for a value write is a 400):

| endpoint | fields (exactly one group) |
| --- | --- |
| `POST /items` | `name`, `rid?`, `today?` → 201 `{ item, rid }` |
| `POST /items/:id/value` | `fillStop` (0–4) **or** `count` (1–999) **or** `exactAmount` + `exactUnit` **or** `exactAmount=` (empty clears) |
| `POST /items/:id/measure` | `measure` = `fill`/`count`/`have` |
| `POST /items/:id/expiry` | `bucket` (not `past`) + `today`, **or** `date`, **or** `clearDate=1` |

## 4. Approach

**Pure first.** Everything with a rule goes in plain `.ts` files under
`src/components/` with unit tests beside them (the existing pattern:
`pantryState.ts`, `offersState.ts`), so only layout and keyboard checks need a
browser:

| File | Holds |
| --- | --- |
| `pantryView.ts` | grouping, ordering, tape fraction, value text, row label, attribution text, date text |
| `writeQueue.ts` | per-item, per-group write serialisation |
| `exactAmount.ts` | parse "400 g", "1.5L", "2" → `{ amount, unit }` |
| `rowKeys.ts` | key → row action, no DOM |
| `announcer.ts` | the 1-per-5-s throttle |
| `stableOrder.ts` | holding remote changes back while the user interacts |

**Today is the viewer's.** The server renders with `snapshot.today` (UTC, a new
field added in Task 23's page change: `<PantryList today={utcToday()}>`), the
island starts from that prop (so hydration matches) and then sets the local
date (`localToday()`: `new Date()` formatted `YYYY-MM-DD` from local parts) in
an effect and again every 60 s, so buckets are the viewer's and move at local
midnight.

**Optimistic panel writes without clock trust.** An optimistic write changes the
row's fields at once but leaves its `*SetBy` / `*SetAt` stamps alone and marks
the row group `saving`. Attribution reads "Saving…" while saving. The server
response (or its echo) then replaces the group with the server's stamp through
the existing `mergeUpdated`. A failed write restores the saved `previous`
fields and shows the beetroot "Couldn't save ¼. Back to ½. Retry". This
avoids the client clock deciding who wins.

**Writes are serialised per row and group** (`writeQueue.ts`): at most one
request in flight per `(itemId, group)`; a newer value replaces the one waiting.
Rapid +/+/+ presses send 1–2 requests, in order.

**Row layout is one DOM, two layouts.** Each `<li>` is a CSS grid. The
Binned/Offer/Note/Withdraw cluster is one element (`.row-actions`): inline right
of Used at ≥ 900 px; at < 900 px it is hidden until the row is open, then sits
at the foot of the panel. No duplicate buttons, so accessible names stay unique.

**Hold-back while interacting** (`stableOrder.ts`; closes the phase 02 gap
"remote adds and removals mustn't re-sort while I'm interacting"): while focus
is inside the list or a pointer went down in it less than 2 s ago, a remote
`item.added`, `item.restored`, `item.merged` or a remote `item.updated` that
moves a row to another bucket is **held**; row contents still refresh in place.
Held changes apply when focus leaves the list or 2 s pass with no key or
pointer event in it. After a re-sort the island restores focus to the row that
had it (moving a DOM node can drop focus).

**Motion** is the spec's four rules (panel 160 ms, row collapse 200 ms,
remote-change underline fade 1.6 s, nothing for ageing). Under
`prefers-reduced-motion: reduce` there are no slides: the panel appears at once
and the remote-change mark is a static dot for 3 s.

**Contrast.** Task 14 turns `color-contrast` on in `axeViolations` and runs it
in light and dark (Playwright `colorScheme`). If a spec §4.1 token fails
(4.5:1 text, 3:1 bars), adjust the token in `tokens.css` minimally and record
it in the Corrections log of the task.

## 5. Task breakdown

### Task 14: App shell, self-hosted font, real contrast

- [x] Done

- **Description:** Every page gets the Enamelware shell: a top band with the
  household name and, from 720 px, the tabs inline; below 720 px the tabs are a
  fixed bottom bar that hides while the add field is focused. Atkinson
  Hyperlegible Next is self-hosted (~40 KB) with a size-matched fallback. The
  footer carries the About link and a visible "Keyboard" help line. Axe
  checks contrast, light and dark.
- **Files:**
  - `src/assets/fonts/atkinson-hyperlegible-next-latin.woff2` (new, generated by
    `scripts/build-font.ts`, committed with `src/assets/fonts/OFL.txt` and a
    two-line `FONT.md` giving source, date, subset ranges)
  - `scripts/build-font.ts` (new): runs `pyftsubset` (fonttools; **a build-time
    tool, not a dependency**) on the downloaded TTF to U+0020–007E, U+00A0–00FF,
    U+2013–2014, U+2018–201D, U+2026, U+2713, keeping the `wght` axis, output woff2
  - `src/styles/tokens.css`: `@font-face` (`font-display: swap`) + a fallback face
    `"Atkinson fallback"` (`src: local("Arial")` with `size-adjust` and
    `ascent-override` measured from the two fonts' metrics), `--font:
    "Atkinson Hyperlegible Next", "Atkinson fallback", system-ui, sans-serif`;
    type scale vars `--t-13 --t-16 --t-19 --t-23 --t-28`; spacing `--s-1…`
    (4 px base); radii `--r-btn: 10px --r-panel: 14px --r-sheet: 20px`
  - `src/layouts/Base.astro`: top band, bottom tab bar, `<link rel="preload"
    as="font" type="font/woff2" crossorigin>` using the imported `?url` of the
    font, footer help line; remove the `About` item from the tabs (it moves to
    the footer; signed-out visitors keep Pantry, History, About in the footer)
  - `src/styles/shell.css` (new): shell, tab bar, `:has(.add input:focus)` hides
    the tab bar below 720 px, 44 px targets, focus ring `3px solid var(--rim)`
  - `spec/browser.ts`: `openPage(browser, url, viewport, options?: { colorScheme?:
    "light" | "dark" })`; `axeViolations` drops the `color-contrast` exemption
  - `spec/layout/shell.test.ts` (extend)
- **Tests to write first (red):**
  - `spec/layout/shell.test.ts` (browser, each of `/`, `/readme/`, `/history`,
    `/household`, `/offers`, `/communities` for a signed-in household; at PHONE and
    DESKTOP; light **and** dark): no horizontal overflow; `axeViolations` is `[]`
    **with contrast on**.
  - Same file, PHONE: the tab bar is `position: fixed` at the bottom and shows
    four links; focusing the add field on `/` hides it; DESKTOP: the tabs are in
    the top band.
  - Same file: `getComputedStyle(body).fontFamily` starts with `"Atkinson
    Hyperlegible Next"` and `document.fonts.check('16px "Atkinson Hyperlegible
    Next"')` is true; the footer contains "Keyboard".
  - A spec (`spec/font.test.ts`, HTTP only) fetching the font URL found in the page's
    preload link: 200, `content-type` `font/woff2`, `content-length` ≤ 45 000, and
    `cache-control` contains `immutable` (hashed `/_astro/` asset). If the adapter
    does not send `immutable`, the test asserts `max-age` ≥ 31536000 and the
    task notes the finding.
- **Implementation (green):** build the font file (download the TTF to a temp
  dir, never into the repo), wire `@font-face`, restyle the shell, enable
  contrast, then fix whatever axe reports (token tweaks go in the Corrections log).
- **Refactor:** none expected.
- **Acceptance:**
  - [x] The three red groups above pass at both viewports and both colour schemes
  - [x] Font file ≤ 45 000 bytes; `OFL.txt` committed
  - [x] Every existing browser spec still passes (nav `About` is not used by
        any: checked by `grep -rn About spec` returning nothing)
  - [x] `pnpm check` green
- **Human review:** none here; Task 23 carries the look review.
- **Depends on:** none.
- **Corrections log:**
  - No token needed adjusting: every spec §4.1 colour passed axe contrast in
    light and dark as written.
  - Finding: a `GET` of the hashed font returns `max-age=31536000, immutable`
    (a `HEAD` shows `max-age=0`; the adapter treats them differently), so the
    test's `immutable` branch is the one that holds.
  - `pnpm check` was red on `offers.test.ts` before this task, on the clean
    previous commit too. Cause was a stale claim response overriding the live
    stream; fixed first in 4748811 (see `PROCESS_LOG.md`), not by loosening it.
  - The footer help line is the short Task 14 wording; Task 25 replaces it with
    the full key list.

### Task 23: Grouped rows: buckets, shelf-life tape, value glyph, trailing Used

- [x] Done (look accepted by the user 2026-10-07)

- **Description:** The pantry list is grouped under sticky bucket headings
  (Past estimate first, Unknown last), soonest first within a bucket. Each
  row shows a reserved image slot, the name (2 lines max), the value glyph, a
  shelf-life tape, a trailing **Used** button and, from 900 px, Binned and Offer
  (and Note / Withdraw on an offered row). Adds send `today` and the pending row
  already shows the client guess. Remote changes don't re-sort while you
  interact. "Jump to" appears above 25 items. The empty state teaches the add.
- **Files:**
  - `src/components/pantryView.ts` + `pantryView.test.ts` (new, signatures below)
  - `src/components/stableOrder.ts` + `stableOrder.test.ts` (new)
  - `src/components/pantryState.ts` (+ test): the one change is `add.pending:
    { rid; name; at; guess: Guess; today: string }`, which builds the item from
    the guess (today lives in the island, not the reducer)
  - `src/components/PantryList.tsx`: render groups; `today` state; sends `today`
    and `rid`; passes `makeGuesser(guessTable)(name)` into `add.pending`; empty
    state; scroll-tap guard; hold-back wiring; focus restore
  - `src/components/BucketHeading.tsx`, `ItemRow.tsx`, `ShelfLifeTape.tsx`,
    `MeasureGlyph.tsx`, `JumpToBucket.tsx` (new)
  - `src/styles/pantry.css` (rewrite), `src/styles/tape.css` (new)
  - `src/pages/index.astro`: `<PantryList today={utcToday()} …>`
  - `spec/layout/pantry-rows.test.ts` (new)
- **Interfaces (consumed by Tasks 24, 25 and phase 05b):**

  ```ts
  // src/components/pantryView.ts (pure, no DOM, no node imports)
  export const BUCKET_ORDER: readonly Bucket[]; // past, use-soon, this-week, this-month, long-lasting, unknown
  export const BUCKET_LABEL: Record<Bucket, string>; // "Past estimate", "Use soon", "This week", "This month", "Long-lasting", "Unknown"
  export interface BucketGroup { bucket: Bucket; rows: Row[] }
  export function effectiveDate(item: Item): string | null;            // exactExpiry ?? estimatedExpiry
  export function groupRows(rows: Row[], today: string): BucketGroup[]; // empty buckets omitted
  export function tapeFraction(item: Item, today: string): number;     // 0.08…1
  export function glyphLevel(item: Item): 0 | 1 | 2 | 3 | 4 | null;    // fill only, and only when no exact amount
  export function valueText(item: Item): string;                       // "½", "Full", "Nearly out", "~400 g", "6", "have"
  export function rowLabel(item: Item, today: string): string;         // "Spinach, quarter left, use soon"
  export function dateText(date: string): string;                      // "by Fri 9 Oct"
  export function localToday(now?: Date): string;                      // YYYY-MM-DD from local parts
  export function attribution(
    group: "value" | "expiry",
    item: Item,
    members: { id: string; name: string }[],
    now: number,
  ): string; // "Sam's estimate, 2 h ago" | "Guessed" | "A former member's estimate, 2 h ago"
  ```

  ```ts
  // src/components/stableOrder.ts (pure)
  export interface Held { count: number }
  // While `busy`, rows keep the group and position they had; rows and bucket
  // moves that arrived since are held. Not busy: a full regroup.
  export function stableGroups(
    previous: BucketGroup[], rows: Row[], today: string, busy: boolean, ownRids: ReadonlySet<string>,
  ): { groups: BucketGroup[]; held: Held };
  ```

  Tape rules: `unknown` → 1; `past` → 0.08; otherwise `max(0.08, min(d, 30) / 30)`
  where `d = daysUntil(effectiveDate, today)`. Ordering inside a bucket: sooner
  `effectiveDate` first, then newest `createdAt`; pending rows first in their
  bucket; `unknown` rows newest first. `valueText`: `fillStop` 4 `Full`, 3 `¾`,
  2 `½`, 1 `¼`, 0 `Nearly out`; an exact amount shows `~<amount> <unit>` (amount
  trimmed of trailing zeros); count shows the number; have shows `have`.
  `rowLabel` words: stop 4 "full", 3 "three quarters left", 2 "half left", 1
  "quarter left", 0 "nearly out"; count "6 left"; have adds nothing; then the
  bucket label lowercased ("use soon", "past estimate").
- **Tests to write first (red):**
  - `pantryView.test.ts`: `groupRows` orders buckets, omits empty ones, sorts
    inside a bucket as above, puts a pending row first; `tapeFraction` for d =
    0, 3, 15, 30, 90, past, unknown, and an exact date winning over the
    estimate; `valueText`/`glyphLevel` for every stop, exact amounts (`400` →
    `~400 g`, `1.5` kg), count, have; `rowLabel` examples; `dateText("2026-10-09")`
    is `by Fri 9 Oct` in any host time zone (format at noon UTC with
    `timeZone: "UTC"`); `localToday(new Date(2026, 9, 7, 23, 59))` is `2026-10-07`;
    `attribution`: null `*SetAt` → `Guessed`; set with a known member → `Sam's
    estimate, 2 h ago`; set with `*SetBy` null → `A former member's estimate, 2 h ago`.
  - `stableOrder.test.ts`: not busy → full regroup, `held.count` 0; busy → an
    unseen remote row is absent and counted; a row whose bucket changed stays in
    its old group with its new contents; my own add (rid in `ownRids`) is never
    held; a removed row disappears at once.
  - `pantryState.test.ts` (extend): `add.pending` with a guess `{ measure: "fill",
    category: "dairy", shelfDays: 7 }` and `today` `2026-10-07` gives
    `measure: "fill"`, `category: "dairy"`, `estimatedExpiry: "2026-10-14"` and
    still has `valueSetAt: null`.
  - `spec/layout/pantry-rows.test.ts` (browser): (a) items created over HTTP with
    `milk`, `spinach`, `rice`, `mystery` plus `exactExpiry` set past/near/far appear
    under headings in order, each heading `(n)` correct; (b) the tape's width ratio
    tracks `tapeFraction` within 2 % and its `data-bucket` differs per bucket (the
    pattern proxy); (c) Used is a single click at PHONE and DESKTOP, with no dialog,
    and is ≥ 44 px square; a pointer that moved 12 px between down and up (scroll)
    does not fire it; (d) at DESKTOP the row shows `Binned <name>` and `Offer <name>`
    inline, at PHONE it does not until the row is opened (Task 24 opens it; here
    assert they are `display: none`); (e) 80 items: no horizontal overflow, axe
    clean, "Jump to" present (absent at 20); (f) `prefers-reduced-motion: reduce`
    emulation → computed `transition-duration` of `.row` is `0s`; (g) with a
    focused row, a housemate's add (second context) does not move any row for 2 s,
    focus is still on the same row afterwards, and the new row then appears;
    (h) no-JS context: add, Used and Undo still work; (i) empty state shows
    "Try: milk, eggs, spinach" and tapping `milk` adds it; (j) the request body of
    an add contains `today` equal to the browser's local date.
- **Implementation (green):** pure files first, then components, then CSS. `Used`
  keeps its `<form method="post" action="/items/:id/outcome">` so it works without
  scripts. The row's accessible names stay `Used <name>`, `Binned <name>`, `Offer
  <name>`, `Note <name>`, `Withdraw <name>`; the row's main button carries
  `aria-label` = `rowLabel`. Each `<li>` keeps `data-item-id` and `aria-busy`.
  Headings are `<h2>` with `position: sticky`. The tape is `aria-hidden` and
  `data-bucket="<bucket>"`; patterns are CSS (`solid`, `dashed`, diagonal hatch,
  zigzag end, dotted) in `tape.css`. Past rows show the words "past estimate".
  Scroll-tap guard: record `pointerdown` x/y; ignore the click if the pointer moved
  ≥ 10 px; keep a 12 px gap before Used.
- **Refactor:** delete the old flat-list CSS; keep `.offer-state` text "Offered" /
  "Claimed by …" (specs read it).
- **Acceptance:**
  - [x] Unit and browser tests above pass; every existing browser spec passes
  - [x] Axe clean with contrast, both schemes, both viewports, at 80 items
  - [x] `pnpm check` green
- **Human review:** the user runs `pnpm build && pnpm start`, adds a dozen items
  (some with `exactExpiry` via the API) and looks at the pantry on a phone-width
  window and a desktop window, light and dark, against the spec §4.1 wireframes.
  **Pass:** it reads as Enamelware (white enamel, navy rim, the tape slope is
  visible, no generic card UI) and the user says so explicitly. This task is not
  accepted until they do.
- **Depends on:** Task 14.
- **Corrections log:**
  - Judgement call, not a correction: below 900 px the Binned/Offer/Note cluster
    is hidden until the row is open, but `offering-layout.test.ts` clicked `Offer
    soup` at phone width and Task 24 (which owns opening) comes later. To keep the
    check green I pulled the bare tap-to-open toggle (`openId`, `aria-expanded`,
    `data-open`) forward into this task, with no panel in it, and made that spec's
    phone path open the row first (`openRowOnPhone`). No assertion was loosened.
    Task 24 builds the panel inside the same `<li>`.
  - Also pulled forward: `spec/items.ts` (`makeItem`, `makeMany`) for browser specs
    that need a known pantry; Tasks 24 and 25 reuse it.
  - The hold-back and the scroll guard were each switched off in turn to confirm
    their specs go red (3 failures), then restored.
  - Added to the add field (not in the plan): Enamelware styling for `.add input`,
    since the dark scheme showed the browser's default grey box.

### Task 24: The item panel: slider, stepper, measure, expiry, attribution

- [ ] Not started

- **Description:** Tapping a row opens quick adjustments in place: a 5-stop fill
  slider with an exact-amount field, or a −/+ stepper, a Measured-by switch,
  the Use-by chips with an optional exact date, who set each value and how long
  ago, and (below 900 px) Binned, Offer and "Offer some…". Every change is one
  tap, shows at once, and rolls back with a Retry line if it fails. A remote
  change to the open item says so. The offer sheet gains "Offer some…".
- **Files:**
  - `src/components/ItemPanel.tsx`, `FillSlider.tsx`, `CountStepper.tsx`,
    `MeasureTypeSwitch.tsx`, `ExpiryPicker.tsx`, `EstimateAttribution.tsx` (new)
  - `src/components/exactAmount.ts` + test, `writeQueue.ts` + test (new)
  - `src/components/pantryState.ts` (+ test): actions `value.pending |
    value.confirmed | value.rolledBack`, `expiry.pending | expiry.confirmed |
    expiry.rolledBack`, each carrying `itemId` and a `Patch`; `Row` gains
    `saving?: { value?: Patch; expiry?: Patch }` where the stored patch is the
    **previous** fields for rollback; `RetryAction` gains `{ kind: "value"; itemId;
    name; change: ValueWrite; label: string }` and `{ kind: "expiry"; … }`
  - `src/components/PantryList.tsx`: `openId` state, panel rendering, the write
    functions, "just changed" banner, remote-change mark
  - `src/components/OfferSheet.tsx`: "Whole item (¼)" / "Offer some…" control
    (count: a 1…count−1 stepper; fill: a 1…stop−1 quarters stepper; none for `have`
    and for fill items with an exact amount); `SheetResult` gains `portion?: number`
  - `src/styles/panel.css` (new)
  - `spec/layout/pantry-panel.test.ts` (new)
- **Interfaces:**

  ```ts
  // src/components/exactAmount.ts (pure)
  export function parseExact(text: string): { amount: number; unit: Unit } | null;
  // "400 g", "400g", "1.5 L", "1,5 l"→null (no comma decimals), "2" → { 2, "count" }; 0, negative, > 1e6, "abc" → null; unit case-insensitive, "l" → "L"

  // src/components/writeQueue.ts (pure; the clock-free serialiser)
  export function createWriteQueue(): {
    // runs `send` now unless a send for `key` is in flight, else keeps only the newest `send`
    run(key: string, send: () => Promise<void>): Promise<void>;
  };

  // src/components/pantryState.ts additions
  export type Patch = Partial<Item>; // the fields of one group, as they were before an optimistic write
  export type ValueWrite =
    | { kind: "fill"; stop: number } | { kind: "count"; count: number }
    | { kind: "exact"; amount: number; unit: Unit } | { kind: "clearExact" }
    | { kind: "measure"; measure: Measure };
  export type ExpiryWrite =
    | { kind: "bucket"; bucket: SettableBucket; today: string }
    | { kind: "date"; date: string } | { kind: "clearDate" };
  export function applyValue(item: Item, write: ValueWrite): Item;   // optimistic fields only
  export function applyExpiry(item: Item, write: ExpiryWrite): Item; // `bucket` uses estimateFor
  ```

  Slots and handles that phase 05b fills (exact, so 05b never reopens this file):

  ```ts
  // src/components/ItemRow.tsx (Task 23): `image` renders inside the 44 px (48 px
  // from 900 px) circular `.dish`; null renders the empty dish.
  export function ItemRow(props: { /* … */ image: ComponentChildren | null }): JSX.Element;
  // src/components/ItemPanel.tsx (Task 24): `photoSlot` renders at the panel's top,
  // beside the image dish (wireframe: dish + "Add a photo (optional)").
  export function ItemPanel(props: { /* … */ photoSlot?: ComponentChildren }): JSX.Element;
  // inside PantryList (Task 24), passed to children as a prop named `onOpenItem`:
  // opens the row's panel, scrolls the row to the middle (instant under reduced
  // motion), and moves focus to the panel's first control.
  type OpenItem = (itemId: string) => void;
  ```

  `OfferSheet` posts `portion` to `/offers/create` via `PantryList.offer(itemId,
  name, { note, communityIds, portion })`.
- **Tests to write first (red):**
  - `exactAmount.test.ts`: the list in the comment above.
  - `writeQueue.test.ts`: three `run` calls for one key while the first is pending
    send the first and the **third** only; two keys run concurrently; a rejected
    send does not block the next.
  - `pantryState.test.ts`: `applyValue` for each kind (fill clears the exact
    amount, measure changes only `measure`); `applyExpiry` bucket `this-week` with
    `today` 2026-10-07 gives `estimatedExpiry` 2026-10-12 and clears `exactExpiry`,
    `unknown` gives null; `value.pending` changes fields and leaves `valueSetAt`;
    `value.confirmed` with a newer stamp replaces the group; `value.rolledBack`
    restores the previous fields; an `event.updated` with an older stamp does not
    undo a confirmed write; a failed write adds a `Failure` whose message reads
    "Couldn't save ¼. Back to ½." (`label` and `previous` text).
  - `spec/layout/pantry-panel.test.ts` (browser; items made over HTTP so the
    measure is known — `milk` fill, `eggs` count, `cumin` have):
    (a) clicking a row opens its panel in place (`aria-expanded="true"`, panel
    inside the `<li>`), a second row opens and closes the first;
    (b) fill: ArrowLeft on the slider moves Full→¾ and the request carries
    `fillStop=3`; five stops exist; the displayed value and the row glyph update
    before the response (route delayed 500 ms); typing `400 g` in Exact amount and
    Enter posts `exactAmount=400&exactUnit=g` and the row reads `~400 g`; moving
    the slider afterwards clears it; (c) count: `+` ×3 quickly sends ≤ 2 requests,
    ends at 4 on the server; − is disabled at 1; (d) a have item shows no control
    and the measure switch to Count posts `measure=count` and then shows the
    stepper; (e) Use-by chip `This week` posts `bucket=this-week&today=<local>`, the
    row moves under the This week heading, and the chip has `aria-pressed="true"`;
    the date input posts `date=…` and the row says `by <date>`; clearing posts
    `clearDate=1`; (f) attribution reads `Sam's estimate, just now` after a write,
    `Guessed` before, and after the household's other member sets it, the first
    context's open panel says "Alex just changed this to ¼" while a closed row
    updates in place with no focus change; (g) a failing write (route aborted)
    snaps the value back and shows "Couldn't save … Back to …" with Retry that
    works; (h) at PHONE the open panel has `Binned <name>` and `Offer <name>` and the
    closed row does not; Esc closes and focus returns to the row; (i) "Offer some…"
    on a count 6 item at the sheet: stepper 1–5, posting 2 leaves the pantry row at
    4 and a new row `eggs` (2) offered; absent for `cumin`; (j) axe clean with the
    panel open, both viewports and schemes; no overflow.
- **Implementation (green):** unit files first. Slider is a native `<input
  type="range" min="0" max="4" step="1">` with tick labels (so arrows, drag and
  assistive tech work); posts on `change`, previews on `input`; while the pointer
  is down on it, incoming value updates for that row are not applied (my release
  wins). Writes go through `createWriteQueue().run(`${itemId}:value`, …)`.
  `today` for bucket writes is the island's local date. Retry replays the same
  write. Remote `event.updated` for the open row sets a `just changed by <name>`
  line (live region) and a 1.6 s underline mark (`.changed`; static dot 3 s under
  reduced motion).
- **Refactor:** move the offer/withdraw/note buttons into `OutcomeActions` shared
  by the row cluster and the panel foot.
- **Acceptance:**
  - [ ] All tests above pass; every existing browser spec passes
  - [ ] Each panel control is one tap/keypress (no confirm anywhere)
  - [ ] `pnpm check` green
- **Human review:** the user opens the panel on a fill, a count and a have item
  in the local build at phone and desktop widths and compares with spec §4.1
  (panel sketch, attribution wording, "Offer some…"). **Pass:** wording and layout
  read right, explicit yes from the user. Not accepted until then.
- **Depends on:** Task 23.
- **Corrections log:** *(empty at plan time)*

### Task 25: Keyboard model and the throttled announcer

- [ ] Not started

- **Description:** The pantry is fully keyboard-operable as spec §2.2 states:
  `/` focuses the add field; ↑/↓/Home/End rove between rows (one tab stop for the
  list); Enter or Space opens a row; Esc closes the panel and returns focus; U, B
  and O act on the focused row. Remote changes are announced to screen readers
  at most once per 5 s; a skipped burst becomes one summary.
- **Files:**
  - `src/components/rowKeys.ts` + `rowKeys.test.ts` (new)
  - `src/components/announcer.ts` + `announcer.test.ts` (new)
  - `src/components/LiveAnnouncer.tsx` (new): an `sr-only` `role="status"
    aria-live="polite"` region
  - `src/components/PantryList.tsx`: roving `tabIndex`, key handler on the list,
    `/` handler on `document`, announcer wiring
  - `src/layouts/Base.astro`: footer help text (`Keyboard: / add or search · ↑ ↓
    move · Enter open · U used · B binned · O offer · Esc close`) on every page
  - `spec/layout/pantry-keys.test.ts` (new)
- **Interfaces:**

  ```ts
  // src/components/rowKeys.ts (pure)
  export type RowKeyAction = "next" | "prev" | "first" | "last" | "used" | "binned" | "offer" | "close";
  export function rowKeyAction(e: {
    key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean;
    targetKind: "row" | "panel-field" | "other"; // panel-field = input, select, textarea, range
    panelOpen: boolean;
  }): RowKeyAction | null;
  // ArrowDown/Up/Home/End → next/prev/first/last; u/U, b/B, o/O → used/binned/offer; Escape → close
  // only when panelOpen; any ctrl/meta/alt chord → null; targetKind "panel-field" → null except Escape

  // src/components/announcer.ts (pure; time is passed in)
  export function createAnnouncer(opts: { intervalMs: number; say: (text: string) => void }): {
    push(text: string, now: number): void;  // says now if the interval has passed, else queues
    flush(now: number): void;               // call on a timer: says the queue as one summary
  };
  ```

  Summary wording when more than one is queued: `<n> changes from housemates`.
  Messages: `Alex added Milk`, `Alex marked Milk used`, `Alex changed Milk`, `Milk
  received from a neighbour` (an `item.added` whose `by.id` is `""`, which is how
  `collectedEvents` marks a neighbour; this covers the claimer-pantry slice
  whichever lands first), `Milk is back` (restored).
- **Tests to write first (red):**
  - `rowKeys.test.ts`: every mapping above; `u` inside a `panel-field` is null,
    `Escape` inside a panel field with the panel open is `close`; `Ctrl+U` is null;
    `Escape` with the panel closed is null.
  - `announcer.test.ts`: first push says at once; a second within 5 s is queued,
    `flush` before 5 s says nothing and after says the text; three queued say
    `3 changes from housemates`; two pushes 6 s apart each say at once; `say` never
    runs twice inside one interval.
  - `spec/layout/pantry-keys.test.ts` (browser): (a) `/` from the body focuses the
    add field, and does not when an input in the panel or the sheet has focus (the
    `/` types); (b) Tab from the add field lands on the list **once** (one stop),
    a second Tab leaves it for the footer; ↓ ↓ ↑ moves between rows, Home/End jump,
    focus is visible (computed outline width ≥ 2 px); (c) Enter opens, Esc closes
    and focus is back on the row; (d) `u` on a focused row marks it used, shows the
    Undo toast and focus lands on the next row (or previous if last); `b` binned;
    `o` opens the offer sheet when the household has a community, nothing
    otherwise; (e) a housemate's change (second context) updates a polite live
    region whose text names the change, and ten changes within 5 s produce at most
    two region updates (one at once, one summary); (f) the footer help line is
    visible at PHONE and DESKTOP; (g) the whole add → open → set a value → Used flow
    completes using only the keyboard.
- **Implementation (green):** `tabIndex` 0 on the active row's main button (the
  last focused, else the first), −1 on the others; the active row's trailing
  buttons are tabbable, the others' are −1. The handler lives on the `<ul>` and
  maps `event.target` to `targetKind`. `document` keydown for `/` ignores events
  from editable targets. The announcer's `flush` runs on a 1 s interval while the
  island is mounted.
- **Refactor:** none.
- **Acceptance:**
  - [ ] Unit and browser tests above pass; every existing browser spec passes
  - [ ] No tab trap: Tab and Shift+Tab always leave the list
  - [ ] `pnpm check` green
- **Human review:** the user drives the pantry with the keyboard alone (and, if
  they can, VoiceOver on the announcements) in the local build. **Pass:** the
  model is predictable and the announcements are neither silent nor chatty;
  explicit yes from the user.
- **Depends on:** Task 24.
- **Corrections log:** *(empty at plan time)*

## 6. Phase Definition of Done

- [ ] Tasks 14, 23, 24, 25 complete, each committed with `pnpm check` green
- [ ] `pnpm build && pnpm start &` then `pnpm test` passes (app running)
- [ ] Human review accepted by the user for Tasks 23, 24 and 25
- [ ] README's "What it does today" and "What I chose to make effortless" lists
      updated **by the user** (agent only points out the claims now enforced:
      contrast checked in light and dark; keyboard model; one font)
- [ ] After the deploy: `APP_URL=https://comp4020-final-attwelvedev.fly.dev pnpm
      vitest run --project spec spec/layout/shell.test.ts spec/font.test.ts` is
      green, and the font is served from the fly.dev origin with a long cache
- [ ] Tick phase 05a in overview §5 and commit

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR11 (controls) | Task 24 |
| FR12 (attribution, one-tap correction, remote mark) | Task 24 (display and writes), Task 25 (announcement) |
| FR13 (headings, moving buckets, picker, exact date) | Task 23 (headings, local today), Task 24 (picker) |
| FR14 (Used one tap, Binned, Undo) | Task 23 (row), Task 24 (panel Binned), Task 25 (U/B) |
| FR21 (main view; no image or search) | Task 23, Task 14 (shell) |
| FR26 (Offer some control) | Task 24 |
| FR32 (past-estimate display, live values) | Task 23 (words and tape), Task 24 (remote mark) |
| NFR-A11y | Task 14 (contrast, focus ring), Task 23 (colour independence, reduced motion), Task 25 (keys, announcer, help line) |
| NFR-Viewports | Tasks 14, 23, 24 (both widths in every browser spec) |
| NFR-Resources (font) | Task 14 |
| NFR-Effortless | Tasks 23, 24, 25 (no confirm dialogs; keyboard flow) |
| Phase 02 gap: no re-sort while interacting; announcer | Task 23, Task 25 |

## 8. Risks / open questions

None. Notes the executor must not lose:

- **Do not break the existing selectors** listed in §3; run
  `spec/layout/{pantry,live-sync,live-optimistic,offering,offering-layout,offers}.test.ts`
  after every task.
- **Hydration:** the island must render the same markup on the server and on
  first client render: `today` starts as the `today` prop; local date arrives in
  an effect; the 900 px layout is CSS, never a JS media query at render.
- **A moved DOM node can lose focus** (Preact reorders with `insertBefore`):
  restore it explicitly (Task 23 test (g)).
- **Fonttools is a tool, not a dependency:** `pyftsubset` + `brotli` run once in
  `scripts/build-font.ts`; the output is committed. If they are missing on the
  machine, stop and tell the user rather than adding an npm package.
- **Contrast fixes touch `tokens.css`** and may shift other pages; run the whole
  `shell.test.ts` matrix after each token change.
