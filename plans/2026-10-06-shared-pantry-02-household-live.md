# Shared pantry — Phase 02: Household sharing and live sync

- **Date:** 2026-10-06
- **Status:** Approved (re-planned against the phase 01 code on 2026-10-06)
- **Requirements confirmed by user:** yes — 2026-10-06
- **Part of:** `plans/2026-10-06-shared-pantry-00-overview.md`. Read it first. It
  leans on §3 (layering, tests, commits, ADR rules), §4.2–4.4 and §5.1.
- **Depends on phases:** 01.

## 1. Summary

A second person can join the household by link or code, and a member can add
another device by link or QR. Any member can leave or remove another; a removed
member is signed out at once. Every change appears in every other open session of
the household within about a second, over SSE. The pantry becomes a Preact island
with optimistic updates, rollback, an Undo toast and a "Reconnecting…" status.
The phase-01 forms stay as the no-JS fallback.

The repo ends this phase with a household page (`/household`), join and device
pages, `GET /events`, `GET /api/pantry`, JSON variants of the item endpoints, three
Preact islands, and ADRs 0002 and 0004 accepted.

## 2. Requirements (this phase)

### 2.1 Functional

| FR | Part implemented here |
| --- | --- |
| FR3 | In full: invite link (`/join/<token>`) and code (`/join`) |
| FR5 | In full: device link and QR, 10 minutes, single use |
| FR7 | A join or device link opened on a signed-in device says "You're already in <household>" and doesn't join |
| FR8 | In full: leave, remove, tokens revoked, open streams closed |
| FR9 | Household deletion with items and history; the offers part is Task 9 |
| FR10 | The optimistic add (the server side is phase 01) |
| FR14 | The Undo toast (the server side is phase 01) |
| FR35, FR36, FR37 | For household channels only |

### 2.2 Non-functional

| NFR | Part implemented here |
| --- | --- |
| NFR-Effortless | No confirm dialogs anywhere in this phase, including Leave and Remove |
| NFR-Abuse | Invite link token of 128 bits, stored hashed. **Failed** joins are throttled per client (10 per minute), see §4 D4 |
| NFR-A11y | Toast is a live region; "Reconnecting…" is text; new pages pass axe |
| NFR-Viewports | New pages and the island at 375px and 1280px |
| NFR-Privacy | Streams carry member names only on household channels; invite and device tokens are never logged or cached (see §4 D6) |

### 2.3 Out of scope for this phase

| Deferred | Phase |
| --- | --- |
| Community channels and offers | 03 |
| Estimate attribution and remote-change underline on values | 04/05 |
| Deferring remote adds and removals while the user is interacting; sorting; the throttled screen-reader announcer for remote changes | 05 (Task 14, Task 16) |
| Passkeys | 06 |
| Renaming the household; the default pickup note; communities on the household page | 03 and later |
| Server logging of `/events` | 04 (Task 11) |

Until Task 14, a remote add prepends a row, which shifts the list. That is known
and accepted for this phase.

### 2.4 Assumptions

See overview §2.4, plus these, all verified 2026-10-06:

- **One machine, one Node process** (`fly.toml`, ADR 0004). The hub is in memory;
  a restart drops every stream, and clients reconnect and refetch.
- **`request.signal` aborts when the client disconnects.** Verified in
  `node_modules/astro/dist/core/app/node.js` (`wireAbortController`).
- **`context.clientAddress` is the socket address unless the request's host
  matches `security.allowedDomains`**, when it comes from `x-forwarded-for`
  (same file). On Fly that is the real client. Locally and in CI it is
  `127.0.0.1` for every client.
- **Fly sets `Fly-Client-IP`** and overwrites a client-supplied one. Off Fly the
  header is spoofable, which is accepted: only Fly exposes this app.
- **New dependency: `qrcode-generator@^2.0.4`** (MIT, no dependencies, server-side
  SVG, checked to run under Node 24). It replaces the outline's `qrcode`, which
  pulls in `yargs` and `pngjs`. The commit message gives that one-line reason.
  No ADR: it doesn't shape the app.
- **Spec tests share one app and one IP.** So any spec that makes *failed* joins
  sends its own `fly-client-ip` header, and the suite never makes ten failures
  from the default key.

## 3. Existing code context (verified 2026-10-06)

Everything below was read from the repo at commit `64c9765`.

**Files this phase edits.** `src/pages/index.astro`, `src/pages/history.astro`,
`src/pages/households.ts`, `src/pages/items/index.ts`,
`src/pages/items/[id]/outcome.ts`, `src/pages/history/[id]/undo.ts`,
`src/layouts/Base.astro`, `src/env.d.ts`, `src/lib/households.ts`,
`src/lib/session.ts`, `src/lib/schema.ts`, `spec/http.ts`, `CLAUDE.md`,
`doc/adr/0002-…md`, `doc/adr/0004-…md`.

**Facts and gotchas:**

- Services take `db` first, return their result, never see a request.
  `src/lib/db.ts` opens SQLite with `journal_mode = WAL` and `foreign_keys = ON`,
  and migrates from `./drizzle` at import. So **`ON DELETE CASCADE` works**, and a
  new migration is picked up by `openDb(":memory:")` in unit tests.
- Schema style (`src/lib/schema.ts`): `sqliteTable`, `text("id").primaryKey()`,
  times are epoch-millisecond `integer`s, tokens are stored as hashes
  (`deviceTokens.tokenHash`). Existing cascades: `members.householdId`,
  `deviceTokens.memberId`, `items.householdId`, `history.householdId` all
  cascade; `items.createdBy` is `set null`; `history.memberId` is a plain text
  column with **no** foreign key.
- `listHistory` left-joins `members`, so after a member is removed their history
  rows keep `memberId` but get `memberName: null`. `history.astro` currently prints
  `by <name>` only when `memberName` is truthy, so a removed member's rows lose
  their "by". Task 5 fixes that.
- `src/middleware.ts` only resolves the cookie into `Astro.locals.session`
  (`Session | null`). A cookie with no matching token hash is simply `null`. So
  deleting a member's `device_tokens` signs them out on their next request, with
  no extra code.
- Endpoint pattern: read the form with `await context.request.clone().formData()`
  when the endpoint may `context.rewrite("/")`, set an `Astro.locals.*Error`, and
  let the page render with status 400. No session → `context.redirect("/", 303)`.
  `NotFoundError` → plain `new Response("…", { status: 404 })`. New locals are
  typed in `src/env.d.ts`.
- A page can't also be a POST endpoint on the same path, so POST handlers get
  their own path (§4 HTTP table).
- `astro.config.ts`: `output: "server"`, `@astrojs/node` standalone,
  `@astrojs/preact` integration, `checkOrigin` on. A same-origin `fetch` POST
  sends `Origin` itself; spec helpers set it by hand.
- Astro's scoped `<style>` in a `.astro` page does **not** reach markup rendered
  by an island. Styles for island markup go in a plain CSS file imported by the
  component.
- **Phase-01 tests that must keep passing unchanged** (they pin markup the island
  must still produce):
  - `spec/items.test.ts` reads item ids from `/items/<id>/outcome` form actions
    inside `<li>` chunks, matched by `>name` text.
  - It counts two outcome actions (Used and Binned) per item.
  - It looks for the text "marked used" / "marked binned" and an
    `action="/history/<id>/undo"` form on `/?undo=<id>`.
  - `spec/layout/pantry.test.ts` finds rows by `getByRole("listitem")` and
    buttons by `/^Used/`, relies on the empty pantry autofocusing the add field,
    and expects the text "marked used" plus an "Undo" button after Used.
  - `spec/layout/shell.test.ts` checks `/` and `/readme/` for overflow and axe.
- `vitest.config.ts`: project `unit` includes `src/**/*.test.ts` (no server);
  project `spec` includes `spec/**/*.test.ts` (needs the running app).
- `tsconfig.json`: `"jsx": "react-jsx"`, `"jsxImportSource": "preact"`,
  `verbatimModuleSyntax`. So island files import **types** from server modules
  with `import type` only, and never pull `better-sqlite3` into the client bundle.
- `src/components/` doesn't exist yet. `src/styles/tokens.css` defines `--bg`,
  `--surface`, `--rim`, `--ink`, `--ink-muted`, `--line`, `--past`, `--basil`
  (and others). Reuse them.

### Interfaces from earlier phases (exact)

Copied from the code (overview §4.2 matches):

```ts
// src/lib/db.ts
export type Db = BetterSQLite3Database;
export function openDb(path: string): Db;
export const db: Db;

// src/lib/errors.ts
export class NotFoundError extends Error {}
export class ValidationError extends Error {}

// src/lib/session.ts
export const DEVICE_COOKIE = "pantry_device";
export function newDeviceToken(): string;          // 32 random bytes, base64url
export function hashToken(token: string): string;  // sha256 hex

// src/lib/households.ts (also re-exports ValidationError)
export interface Household { id: string; name: string; inviteCode: string; createdAt: number }
export interface Member { id: string; householdId: string; name: string; createdAt: number }
export interface Session { member: Member; household: Household }
export function createHousehold(
  db: Db,
  input: { householdName: string; memberName: string },
): Session & { deviceToken: string };
export function sessionForToken(db: Db, token: string): Session | null;

// src/lib/items.ts (also re-exports NotFoundError, ValidationError)
export type Outcome = "used" | "binned" | "given";
export interface Item { id: string; householdId: string; name: string; createdBy: string; createdAt: number }
export interface HistoryEntry {
  id: string; householdId: string; itemId: string; itemName: string;
  outcome: Outcome; memberId: string | null; memberName: string | null; at: number;
}
export function addItem(db: Db, session: Session, name: string): Item;
export function listPantry(db: Db, householdId: string): Item[];   // newest first
export function recordOutcome(db: Db, session: Session, itemId: string, outcome: "used" | "binned"): HistoryEntry;
export function undoOutcome(db: Db, session: Session, historyId: string): Item;
export function listHistory(db: Db, householdId: string, filter?: Outcome): HistoryEntry[];

// src/env.d.ts
declare namespace App {
  interface Locals {
    session: import("./lib/households").Session | null;
    firstRunError?: { message: string; householdName: string; memberName: string };
    addError?: string;
  }
}
```

Tables from `src/lib/schema.ts`: `households`, `members`, `deviceTokens`,
`items`, `history` (columns as in overview §4.3, with `households.inviteCode`
unique and shaped `WORD-NN`).

Endpoints from phase 01: `POST /households`, `POST /items`,
`POST /items/:id/outcome` (303 → `/?undo=<historyId>`), `POST /history/:id/undo`
(303 → `/`), `GET /history[?outcome=]`, `GET /` and `GET /readme/`. All redirect to
`/` (303) without a session.

Spec helpers (`spec/http.ts`, `spec/browser.ts`), verbatim:

```ts
// spec/http.ts
export interface Client {
  get(path: string): Promise<Response>; // follows no redirects
  post(path: string, fields?: Record<string, string>): Promise<Response>; // form-encoded, Origin = baseUrl
  cookie(name: string): string | undefined;
}
export function client(baseUrl: string): Client;
export function text(html: string): string;

// spec/browser.ts
export interface Viewport { width: number; height: number }
export const PHONE: Viewport;    // 375 × 812
export const DESKTOP: Viewport;  // 1280 × 800
export function launch(): Promise<Browser>;   // system Chrome
export function openPage(browser: Browser, url: string, viewport: Viewport): Promise<Page>; // new context per call
export function horizontalOverflow(page: Page): Promise<number>;
export function axeViolations(page: Page): Promise<string[]>;
```

The spec files read `const baseUrl = inject("baseUrl");` (from
`spec/global-setup.ts`, which is fixed).

## 4. Approach

### Design decisions

- **D1 — Services return their change; endpoints publish after the commit.**
  `src/lib/live.ts` is a tiny in-process pub/sub. Task 5 builds the household
  flows with no publishing. **Task 6 owns every `publish` call**, including edits
  to the Task 5 endpoints. That keeps the dependency one-way (5 → 6 → 7) and
  puts all fan-out in one task.
- **D2 — Invite links are minted on demand.** A link is stored as a hash, so the
  page can't show an old one again. `POST /household/invite-link` mints a new
  link, valid 7 days and reusable by several people, and the response page shows
  it. The household's `inviteCode` (`KETTLE-42`) is permanent and always shown.
- **D3 — Device links open a confirm page; they never sign in on GET.** Chat apps
  and browsers prefetch links, which would burn a single-use token.
  `GET /device/<token>` shows "Sign in as Sam on this device" with one button;
  `POST /device/<token>/accept` redeems it. Join links work the same way
  (`GET` shows a form, `POST …/accept` joins).
- **D4 — Only failed joins are throttled.** The code space is small (about 6,400
  codes), so guessing is the threat; the link token is 128-bit. After 10 failed
  joins in 60 s from one key, every join POST from that key answers 429 with
  `Retry-After: 60`. The key is the `Fly-Client-IP` header, else
  `context.clientAddress`. Throttling failures only means a busy household or the
  shared-IP spec suite is never blocked by honest joins.
- **D5 — Leave and Remove are one tap with no confirm.** That is NFR-Effortless.
  The page says what each does in plain text, including "You're the last member:
  leaving deletes this household and its pantry".
- **D6 — Secret-bearing pages.** `/join/<token>`, `/device/<token>` and the
  responses that show a fresh link send `Cache-Control: no-store`. Task 11
  (logging) logs the route pattern, not the path, so those tokens stay out of
  logs.
- **D7 — Echo handling.** The island sends a client request id `rid` (≤ 64 chars,
  `[A-Za-z0-9_-]`) with an add; the server passes it through to the `item.added`
  event and the JSON response. The island swaps its temporary row for the real
  item when either arrives first, and ignores the other. Removals and restores
  carry item ids, so applying them twice is a no-op. The reducer is idempotent.
- **D8 — Snapshot on every open.** The island refetches `/api/pantry` on every
  `EventSource` open (first open and every reconnect), so nothing that happens
  between server render and stream start is lost. The snapshot reducer keeps rows
  that are still pending or being removed.

### Interfaces this phase produces (exact)

Later phases copy these verbatim.

```ts
// src/lib/households.ts (Task 5) — additions
export const INVITE_LINK_TTL_MS: number;   // 7 days
export const DEVICE_LINK_TTL_MS: number;   // 10 minutes
export function joinByCode(db: Db, input: { code: string; memberName: string }): Session & { deviceToken: string };
export function createInviteLink(db: Db, session: Session, now?: number): { token: string; expiresAt: number };
export function previewInviteLink(db: Db, token: string, now?: number): Household | null;
export function joinByLink(db: Db, input: { token: string; memberName: string }, now?: number): Session & { deviceToken: string };
export function createDeviceLink(db: Db, session: Session, now?: number): { token: string; expiresAt: number };
export function previewDeviceLink(db: Db, token: string, now?: number): Member | null;   // who the link would sign in as; doesn't use it up (added while executing Task 5: D3's confirm page names the member)
export function redeemDeviceLink(db: Db, token: string, now?: number): Session & { deviceToken: string };
export function listMembers(db: Db, householdId: string): Member[];   // oldest first
export function removeMember(db: Db, session: Session, memberId: string): { member: Member; householdDeleted: boolean };
export function leaveHousehold(db: Db, session: Session): { member: Member; householdDeleted: boolean };
// join/redeem throw NotFoundError (unknown, expired or used) or ValidationError (name);
// removeMember throws NotFoundError for an id outside the session's household

// src/lib/session.ts (Task 5) — addition
export function newLinkToken(): string;   // 16 random bytes, base64url (22 chars)

// src/lib/throttle.ts (Task 5)
export interface FailureThrottle {
  blocked(key: string, now?: number): boolean;   // true once `limit` failures fall inside the window
  fail(key: string, now?: number): void;
}
export function failureThrottle(opts: { limit: number; windowMs: number }): FailureThrottle;
export const joinThrottle: FailureThrottle;      // limit 10, windowMs 60_000
export function throttleKey(headers: Headers, clientAddress: string): string;   // Fly-Client-IP, else the socket address (added while executing Task 5)

// src/lib/cookie.ts (Task 5)
export function deviceCookieOptions(url: URL, forwardedProto: string | null): {
  httpOnly: true; sameSite: "lax"; secure: boolean; path: "/"; maxAge: number;   // 400 days
};

// src/lib/qr.ts (Task 5)
export function qrSvg(text: string): string;   // an <svg> string, scalable

// src/lib/live.ts (Task 6)
export interface Actor { id: string; name: string }
export type LiveEvent =
  | { type: "item.added"; item: Item; by: Actor; rid?: string }
  | { type: "item.removed"; itemId: string; itemName: string; outcome: Outcome; historyId: string; by: Actor }
  | { type: "item.restored"; item: Item; by: Actor }
  | { type: "member.joined"; member: { id: string; name: string } }
  | { type: "member.removed"; member: { id: string; name: string }; by: Actor };
export const householdChannel: (householdId: string) => string;   // "household:<id>"
export function subscribe(channel: string, send: (e: LiveEvent) => void): () => void;
export function publish(channel: string, e: LiveEvent): void;     // never throws
export function subscriberCount(channel: string): number;

// src/lib/sse.ts (Task 6)
export const HEARTBEAT_MS: number;   // 25_000
export function eventFrame(e: LiveEvent): string;   // "event: <type>\ndata: <json>\n\n"
export function eventStream(opts: {
  channels: string[];
  signal: AbortSignal;
  heartbeatMs?: number;
  closeWhen?: (e: LiveEvent) => boolean;
}): ReadableStream<Uint8Array>;

// src/lib/snapshot.ts (Task 6)
export interface Snapshot {
  household: { id: string; name: string };
  me: { id: string; name: string };
  members: { id: string; name: string }[];   // oldest first
  items: Item[];                             // newest first
}
export function snapshotFor(db: Db, session: Session): Snapshot;

// src/lib/http.ts (Task 6)
export function wantsJson(headers: Headers): boolean;   // Accept includes application/json
export function json(body: unknown, status?: number): Response;
```

### Schema (Task 5, migration `drizzle/0002_*.sql`)

| Table | Columns |
| --- | --- |
| `invite_links` | `token_hash` text pk · `household_id` → households (cascade) · `created_by` text → members (set null) · `created_at` int · `expires_at` int |
| `device_links` | `token_hash` text pk · `member_id` → members (cascade) · `created_at` int · `expires_at` int · `used_at` int null |

### HTTP contract (this phase)

| Method and path | Body | Success | Failure | Task |
| --- | --- | --- | --- | --- |
| `GET /join` | — | 200: code and name form | — | 5 |
| `POST /join/code` | form `code`, `memberName` | 303 → `/`, device cookie | 400 form re-rendered (bad code or blank name) · 409 already signed in · 429 throttled | 5 |
| `GET /join/:token` | — | 200 "Join <household>" with a name field; or 200 "You're already in <household>" with no form when signed in | 404 unknown or expired | 5 |
| `POST /join/:token/accept` | form `memberName` | 303 → `/`, device cookie | 400 blank name · 404 · 409 signed in · 429 | 5 |
| `GET /household` | — | 200: invite code, members, devices link, leave | 303 → `/` without a session | 5 |
| `POST /household/invite-link` | — | 200: the household page showing the new link | 303 → `/` | 5 |
| `POST /household/members/:id/remove` | — | 303 → `/household`; own id behaves as leave | 404 id not in the household · 303 → `/` | 5 |
| `POST /household/leave` | — | 303 → `/`, cookie cleared | 303 → `/` | 5 |
| `GET /household/devices` | — | 200 | 303 → `/` | 5 |
| `POST /household/device-link` | — | 200: the devices page showing the link and QR | 303 → `/` | 5 |
| `GET /device/:token` | — | 200 confirm form (signs nobody in); or 200 "already signed in" when signed in | 404 unknown, expired or used | 5 |
| `POST /device/:token/accept` | — | 303 → `/`, device cookie | 404 · 409 signed in | 5 |
| `GET /events` | — | 200 `text/event-stream` | 401 without a session | 6 |
| `GET /api/pantry` | — | 200 `Snapshot` JSON | 401 JSON | 6 |
| `POST /items` with `Accept: application/json` | form `name`, optional `rid` | 201 `{ item, rid? }` | 400 `{ error }` · 401 `{ error }` | 6 |
| `POST /items/:id/outcome` with JSON | form `outcome` | 200 `{ historyId, itemId, itemName, outcome }` | 400 · 404 · 401, each `{ error }` | 6 |
| `POST /history/:id/undo` with JSON | — | 200 `{ item }` | 404 · 401, each `{ error }` | 6 |

Without `Accept: application/json` the three item endpoints behave exactly as in
phase 01 (303 redirects), and they publish too.

### Event stream format

`GET /events` sends `retry: 2000` first, then `event: <type>` frames with one-line
JSON `data`, plus a `: ping` comment every 25 s. It sets `Content-Type:
text/event-stream; charset=utf-8`, `Cache-Control: no-cache, no-transform` and
`X-Accel-Buffering: no`. It subscribes to `household:<id>` only. It closes when
the client aborts, or when it delivers `member.removed` for the session's own
member.

## 5. Task breakdown

### Task 5: Invites, joining, device links, leaving and removing members

- [x] Done

- **Description:** Build the household flows from the HTTP table: join by code
  and by link, the household settings page, device link and QR, leave, remove.
  Removing a member deletes their device tokens (cascade). When the last member
  leaves, the household is deleted (cascade). No live publishing here (D1).
  History shows "by a former member" for a removed member's rows. Add
  `Household` to the nav. Accept ADR 0002 in this commit, **with the user's
  explicit yes**.
- **Files:**
  - `src/lib/households.ts`: the §4 additions, plus a private helper that
    inserts a member and a device token, shared with `createHousehold`.
  - `src/lib/session.ts` (`newLinkToken`), `src/lib/throttle.ts`,
    `src/lib/cookie.ts`, `src/lib/qr.ts`.
  - `src/lib/schema.ts`, then `pnpm db:generate` and commit `drizzle/0002_*`.
  - `src/env.d.ts`: add optional locals `joinError`, `newInviteLink`,
    `newDeviceLink`.
  - Pages: `src/pages/join/index.astro`, `src/pages/join/[token].astro`,
    `src/pages/household/index.astro`, `src/pages/household/devices.astro`,
    `src/pages/device/[token].astro`.
  - Endpoints: `src/pages/join/code.ts`, `src/pages/join/[token]/accept.ts`,
    `src/pages/household/invite-link.ts`,
    `src/pages/household/device-link.ts`,
    `src/pages/household/members/[id]/remove.ts`,
    `src/pages/household/leave.ts`, `src/pages/device/[token]/accept.ts`.
  - Edit `src/pages/households.ts` to use `deviceCookieOptions`; edit
    `src/pages/index.astro` (first-run page gets "Joining someone's household? Open
    their invite link, or Enter an invite code" linking to `/join`),
    `src/pages/history.astro`, `src/layouts/Base.astro`.
  - Add `qrcode-generator` to `package.json`.
  - Specs: `spec/invites.test.ts`, `spec/layout/household.test.ts`; extend
    `spec/http.ts` (below).
  - `doc/adr/0002-…md`: status → `accepted`.
- **Tests first (red):**
  - **Unit, `src/lib/households.test.ts`:**
    - `createInviteLink`: a 22-character base64url token; `expiresAt` is
      `now + INVITE_LINK_TTL_MS`; no stored value equals the token; two calls give
      different tokens.
    - `previewInviteLink`: the household for a valid token; `null` for unknown,
      and for `now` past expiry.
    - `joinByLink`: adds a member with a trimmed name to the link's household;
      the returned `deviceToken` resolves through `sessionForToken` to that
      member; the link works twice; expired or unknown → `NotFoundError`; blank or
      61-character name → `ValidationError` and no member row.
    - `joinByCode`: `kettle-42`, ` KETTLE 42 ` and `KETTLE-42` all match; unknown →
      `NotFoundError`; blank name → `ValidationError`.
    - `createDeviceLink`/`redeemDeviceLink`: redeeming returns the same member with
      a new token that `sessionForToken` accepts; `expiresAt` is `now +
      DEVICE_LINK_TTL_MS`; a second redeem → `NotFoundError`; redeem at
      `expiresAt - 1` works and at `expiresAt` fails; unknown → `NotFoundError`.
    - `listMembers`: oldest first.
    - `removeMember`: the target's member row and device tokens are gone
      (`sessionForToken` → `null`); the others remain; the household's items and
      history remain, with the removed member's history `memberName` now `null`;
      an unknown id or another household's member → `NotFoundError` and nothing
      changes; removing yourself works.
    - `removeMember` and `leaveHousehold` on the **last** member:
      `householdDeleted` is `true` and the household, items, history, invite links
      and device links are gone, another household is untouched, and the old
      invite code → `NotFoundError`. A removed member's unredeemed device link is
      gone.
  - **Unit, `src/lib/throttle.test.ts`:** not blocked before `limit` failures,
    blocked at `limit`; unblocks once the window has passed; keys are
    independent; no failures → never blocked.
  - **Unit, `src/lib/cookie.test.ts`:** `secure` is false for `http:` with no
    forwarded proto, true for `https:` and for a forwarded `https`; the other
    options are as in the contract.
  - **Unit, `src/lib/qr.test.ts`:** starts with `<svg`; identical input gives
    identical output; different input differs.
  - **Spec, `spec/invites.test.ts`**, extending `spec/http.ts` first (see
    Implementation):
    - Two clients share a household through a link: A mints a link
      (`POST /household/invite-link`, the response contains `/join/<22 chars>` and
      `Cache-Control: no-store`); B opens it (200, names the household), accepts as
      "Alex" (303, cookie); B's `/` shows A's item; A's `/household` lists Alex.
    - The same through the code (`#invite-code`), including a lower-case code.
    - A wrong code → 400, role alert, no cookie. An unknown or malformed link →
      404 on GET and on accept. A blank name → 400 and the form again.
    - A signed-in device opening a join link gets 200 "You're already in …" and no
      form; its accept POST → 409; the target household's member list is unchanged.
    - Remove: A removes B (`/household/members/<id>/remove`); B's next `GET /` is
      the first-run form and B's `POST /items` adds nothing. A's page has one
      remove action per *other* member and a Leave action. Removing an unknown or
      another household's member id → 404. History shows "by a former member" for
      B's earlier Used.
    - Leave: B leaves (303 → `/`, cookie cleared); A no longer lists B and keeps
      the items. The last member leaving deletes the household: its code no longer
      joins, its links 404, and the old cookie lands on first run.
    - Device link: A mints (page has `/device/<22+ chars>` and an `<svg`); a fresh
      client's `GET` of it returns 200 and **does not** sign in (`GET /` is still
      first run); `POST …/accept` → 303 and cookie, the client then sees A's
      household; A still lists one member; a second accept → 404; a signed-in
      device → 409.
    - Throttling: a client with its own `fly-client-ip` makes 10 wrong-code posts
      (each 400); the 11th, even with the right code, → 429 with `Retry-After`; a
      client with a different `fly-client-ip` still joins.
    - `/household`, `/household/devices` without a session → 303 → `/`.
  - **Browser, `spec/layout/household.test.ts`:** at PHONE and DESKTOP, `/household`,
    `/household/devices` (with a minted link and QR), `/join`, and `/join/<token>`
    have no horizontal overflow and no axe violations; the Copy button puts the
    minted link on the clipboard (grant the `clipboard-read` and `clipboard-write`
    permissions).
- **Implementation (green):**
  - Extend `spec/http.ts` without breaking callers: `client(baseUrl, options?: {
    headers?: Record<string, string> })` sends those headers on every request;
    `get(path, headers?)` and `post(path, fields?, headers?)` add per-call
    headers.
  - Throttle check first in every join POST: `blocked(key)` → 429. Each
    `NotFoundError` from a join adds `fail(key)`. Key is
    `request.headers.get("fly-client-ip") ?? context.clientAddress`.
  - The pages that show a fresh token set `Cache-Control: no-store`. The QR is
    inlined with `set:html` inside a wrapper with `role="img"` and an
    `aria-label`.
  - The household page renders the invite code in an element with
    `id="invite-code"` and each remove action as a form whose action is
    `/household/members/<id>/remove`, which the specs read.
  - The Copy button is a small Astro `<script>`; the link is also in a read-only
    field, so no-JS users can still copy it.
  - Remove or leave of your own member clears the cookie
    (`context.cookies.delete(DEVICE_COOKIE, { path: "/" })`) and redirects to `/`.
  - `history.astro`: when `memberId` is set but `memberName` is `null`, print "by
    a former member".
- **Refactor:** move the cookie options out of `src/pages/households.ts`;
  confirm `spec/household.test.ts` still passes.
- **Acceptance:** the tests above are green; `pnpm check` is green with the app
  running; ADR 0002 is `accepted` and committed with this task; the
  `qrcode-generator` commit message states why it was chosen.
- **Depends on:** Task 4.

### Task 6: In-process live hub, the `/events` SSE stream, the snapshot and JSON variants

- [x] Done

- **Description:** Add the hub, the SSE stream, `GET /api/pantry` and the JSON
  variants of the three item endpoints. Wire `publish` into every write after it
  commits: the three item endpoints, and the Task 5 join, remove and leave
  endpoints (`member.joined`, `member.removed`). Accept ADR 0004 in this commit,
  **with the user's explicit yes**. Add a rule to `CLAUDE.md`: "Services return
  their change; endpoints publish after the commit, never inside a transaction."
- **Files:**
  - `src/lib/live.ts`, `src/lib/sse.ts`, `src/lib/snapshot.ts`,
    `src/lib/http.ts` and a unit test beside each.
  - `src/pages/events.ts`, `src/pages/api/pantry.ts`.
  - Edit `src/pages/items/index.ts`, `src/pages/items/[id]/outcome.ts`,
    `src/pages/history/[id]/undo.ts`, `src/pages/join/code.ts`,
    `src/pages/join/[token]/accept.ts`,
    `src/pages/household/members/[id]/remove.ts`,
    `src/pages/household/leave.ts`.
  - `spec/sse.ts` (helper), `spec/live.test.ts`, `spec/api.test.ts`.
  - `CLAUDE.md`, `doc/adr/0004-…md` (status → `accepted`).
- **Tests first (red):**
  - **Unit, `src/lib/live.test.ts`:** `publish` reaches only subscribers of that
    channel; `subscribe`'s returned function stops delivery and
    `subscriberCount` drops; a subscriber that throws doesn't stop the others or
    make `publish` throw.
  - **Unit, `src/lib/sse.test.ts`** (vitest fake timers): the first chunk is
    `retry: 2000\n\n`; a published event arrives as `eventFrame(e)`; a
    `: ping\n\n` arrives after `heartbeatMs`; aborting the signal closes the
    stream and unsubscribes; `closeWhen` returning true closes it;
    `eventFrame` puts `data:` on one line even when the item name contains a
    newline.
  - **Unit, `src/lib/snapshot.test.ts`:** `snapshotFor` returns the household,
    the caller as `me`, members oldest first, and only items still in the
    pantry, newest first; nothing from another household.
  - **Unit, `src/lib/http.test.ts`:** `wantsJson` is true for
    `application/json` and `text/html, application/json;q=0.9`, false for
    `text/html` and for no header; `json` sets the content type and status.
  - **Spec, `spec/live.test.ts`** (using `spec/sse.ts`, a raw `fetch` stream
    reader; add the helper as part of this task):
    - `/events` → 401 without a session and with a garbage cookie.
    - The response is `text/event-stream`, with `no-cache` and
      `X-Accel-Buffering: no`.
    - A's stream receives `item.added` within 1000 ms of B's `POST /items` in the
      same household, with `by.name` equal to B's name.
    - A third household's stream receives nothing; first wait for A's event, so
      the check isn't just silence.
    - A form-POST Used gives `item.removed` (outcome, `by`, `historyId`); the form
      undo gives `item.restored`.
    - `POST /items` with a valid `rid` puts it in the event and the JSON
      response; an invalid `rid` (over 64 chars, or a space) is dropped.
    - A join publishes `member.joined` to the household and nothing to
      strangers. A removal publishes `member.removed`, and the removed member's
      own stream ends within 1000 ms.
    - After a client aborts its stream, a further POST still works.
  - **Spec, `spec/api.test.ts`:** `GET /api/pantry` has the `Snapshot` shape and
    401s without a session; the JSON statuses and bodies in the contract table;
    the form requests still answer 303.
- **Implementation (green):** the minimum to pass. Endpoints call the service,
  then `publish(householdChannel(id), …)`, then respond. `events.ts` builds
  `eventStream({ channels: [householdChannel(session.household.id)], signal:
  request.signal, closeWhen: (e) => e.type === "member.removed" && e.member.id ===
  session.member.id })` and sets the headers from §4. `rid` is validated in the
  endpoint with `/^[A-Za-z0-9_-]{1,64}$/` and dropped otherwise.
- **Refactor:** share the form-or-JSON response branching between the three item
  endpoints rather than copying it.
- **Acceptance:** the tests above are green; `pnpm check` is green; ADR 0004 is
  `accepted` and committed with this task. (Fly's proxy not buffering the stream
  is proved by the deployed run in §6, not here.)
- **Depends on:** Task 5.

### Task 7: Pantry island with optimistic updates, rollback, Undo toast and connection status

- [ ] Done

- **Description:** Turn the pantry into a Preact island hydrated over the server
  render. Add a live household member list. The no-JS forms still work because the
  island's own markup is the same forms, and the island intercepts their submit.
  - `PantryList` owns the add form, the list, the toasts and the status.
  - Add: the typed name appears at once as a pending row and the field clears
    and keeps focus. The row is confirmed by the response or by the echoed
    `item.added` (D7).
  - Used and Binned remove the row at once. When the response arrives, a toast
    "<name> marked <outcome>." with **Undo** shows for 8 s (focus inside pauses
    it). Undo restores the item through `POST /history/:id/undo`.
  - A failed write rolls the change back and shows an inline
    `role="alert"` "Couldn't save “<name>”." with **Retry** and **Dismiss**.
  - A remote `item.removed` shows the row struck through as "Used by <name>" for
    2 s, then drops it. A remote add prepends, a remote restore inserts by
    `createdAt`.
  - On every `EventSource` open it refetches `/api/pantry` (D8). If
    `member.removed` names this member, or the stream gets a 401, it navigates to
    `/`.
  - `ConnectionStatus` shows "Reconnecting…" and "Others' changes may be a few
    seconds behind. Your taps still save." only after 3 s disconnected, as text in
    a `role="status"`.
  - `MemberList` on `/household` updates live from `member.joined` and
    `member.removed`, keeping the remove forms working with scripts off.
- **Files:**
  - `src/components/pantryState.ts` (pure reducer) and
    `src/components/pantryState.test.ts`.
  - `src/components/useLiveStream.ts` (opens `/events`, parses each event type,
    reports `connected`, calls `onOpen`).
  - `src/components/PantryList.tsx`, `ToastRegion.tsx`, `ConnectionStatus.tsx`,
    `MemberList.tsx`.
  - `src/styles/pantry.css`: the `.add`, `.undo`, `.pantry` and `.sr-only` rules
    move here from `index.astro`, because island markup isn't reached by scoped
    styles.
  - Edit `src/pages/index.astro` (island with `client:load`, props from
    `snapshotFor`; keep the `?undo=` form and first-run form) and
    `src/pages/household/index.astro` (member list island).
  - Specs: `spec/people.ts` (helpers: start a household in a new browser
    context; join it from a second context), `spec/layout/live-sync.test.ts`,
    `spec/layout/live-optimistic.test.ts`.
- **Tests first (red):**
  - **Unit, `src/components/pantryState.test.ts`:**
    - A snapshot sets the rows.
    - An optimistic add puts a pending row first. Confirming swaps it for the real
      item in the same place. An `item.added` event with that `rid` does the same.
      Confirm after the echo, or echo after confirm, leaves one row. A rollback
      removes it.
    - An `item.added` for an id already present is ignored.
    - An optimistic remove hides the row; a rollback brings it back in its place.
      Your own `item.removed` echo drops the row with no "Used by" note.
    - A remote `item.removed` keeps the row as a "Used by <name>" note until
      `forget`, then removes it. `item.removed` for an unknown id is ignored.
    - `item.restored` inserts by `createdAt` descending.
    - A snapshot keeps pending rows and rows hidden by an optimistic remove.
    - A failure record is added, and dismissed.
  - **Browser, `spec/layout/live-sync.test.ts`** (two contexts in one household,
    through `spec/people.ts`):
    - Add in A → the row appears in B within 1000 ms.
    - Used in B → A shows "Used by <B's name>" within 1000 ms, and the row is gone
      by 4 s; B shows the toast. A never shows a toast for B's action.
    - Undo in the toast restores the item, and A sees it come back.
    - **Reconnect:** block `/events` with `page.route(… route.abort())` before
      load. "Reconnecting…" is not visible at 2 s and is visible by 4 s. B adds an
      item meanwhile. Remove the route; the status disappears and B's item shows,
      without a reload.
    - A removes B on `/household`; B's pantry page is the first-run form within
      2 s.
    - A's open `/household` shows the new member within 1000 ms of B joining.
  - **Browser, `spec/layout/live-optimistic.test.ts`:**
    - With `POST /items` delayed 1 s, the row shows within 300 ms, is marked
      `aria-busy="true"`, and loses it once confirmed; the field is empty and
      focused.
    - With `POST /items` answered 500, the row disappears and an alert "Couldn't
      save “eggs”." has **Retry**; after removing the route, Retry adds it and
      clears the alert.
    - With `POST /items/:id/outcome` answered 500, the row comes back and the alert
      shows.
    - With JavaScript disabled in the context, the phase-01 flow works: add, Used,
      the `?undo=` banner, Undo.
    - No dialog opens in any of the above.
    - At PHONE and DESKTOP the island page with 12 items and a visible toast has
      no horizontal overflow and no axe violations.
  - Existing `spec/layout/pantry.test.ts` and `spec/items.test.ts` stay green
    unchanged.
- **Implementation (green):** the reducer first, then the components. Markup keeps
  `.name`, the two outcome forms per row and the "marked <outcome>." text, so the
  phase-01 specs keep working. The add field keeps `autofocus` when the pantry is
  empty. Island fetches send `Accept: application/json` and a form-encoded body.
  Types come from `src/lib/live.ts` and `snapshot.ts` with `import type` only.
- **Refactor:** `ToastRegion` and `ConnectionStatus` take plain props and know
  nothing of the pantry, so phase 03's offers feed can reuse them.
- **Acceptance:** the tests above are green at PHONE and DESKTOP; axe is clean;
  `pnpm check` is green; every browser file is under 1000 lines
  (`spec/suite-size.test.ts`).
- **Human review:** the user watches two real browsers side by side on the deployed
  `fly.dev` URL, and joins the second from a phone by scanning the device QR.
  **Pass:** live changes feel immediate and calm: no flicker, no whole-list flash,
  focus stays put. A row shifting when a remote add arrives is expected until
  Task 14. This task is **not accepted** until the user says so.
- **Depends on:** Task 6.

## 6. Phase Definition of Done

- [ ] Tasks 5–7 complete, each committed with `pnpm check` green
- [ ] `pnpm build && pnpm start &` then `pnpm test` passes
- [ ] Deployed; the user's two real browsers verified live on the fly.dev URL
- [ ] After the deploy, `APP_URL=https://comp4020-final-attwelvedev.fly.dev pnpm vitest run --project spec spec/live.test.ts` is green. It proves Fly's proxy doesn't buffer the stream (the 1000 ms test is the evidence), and it creates test households on the live app
- [ ] ADRs 0002 and 0004 accepted, with the user's yes
- [ ] Task 7 human review accepted by the user
- [ ] Tick phase 02 in overview §5

The week 10 crit also needs "one recorded decision about behaviour with several
people present". That text is the user's to write (overview §3, "User-authored").

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR3 invite by link or code | Task 5 |
| FR5 device link and QR | Task 5 |
| FR7 join or device link refused when signed in | Task 5 |
| FR8 leave, remove, revoke, streams closed | Task 5 (revoke), Task 6 (stream closes), Task 7 (page signs out) |
| FR9 household deleted with the last member (offers: Task 9) | Task 5 |
| FR10 optimistic add | Task 7 |
| FR14 Undo toast | Task 7 |
| FR35 live within ~1 s | Task 6, Task 7 |
| FR36 optimistic and rollback | Task 7 |
| FR37 snapshot on reconnect, status after 3 s | Task 6, Task 7 |
| NFR-Effortless (no confirm dialogs) | Task 5, Task 7 |
| NFR-Abuse (128-bit link, throttle) | Task 5 |
| NFR-A11y (toast live region, status text, axe) | Task 5, Task 7 |
| NFR-Viewports (new pages, island) | Task 5, Task 7 |
| NFR-Privacy (names only on household channels; secrets not cached or logged) | Task 5, Task 6 |
| Human review (live feel) | Task 7 |

## 8. Risks / open questions

None.
