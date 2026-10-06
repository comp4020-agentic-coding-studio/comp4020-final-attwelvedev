# Shared pantry with neighbourhood offers — Plan overview

- **Date:** 2026-10-06
- **Status:** Approved (phases 01–02 detailed; phases 03–06 outlined — see §0)
- **Requirements confirmed by user:** yes — 2026-10-06
- **Tier:** Architecture

## 0. How to use these plans

Files in this set:

| File | Detail |
| --- | --- |
| `plans/2026-10-06-shared-pantry-00-overview.md` | this file |
| `plans/2026-10-06-shared-pantry-01-proof-of-life.md` | **full** — ready to execute |
| `plans/2026-10-06-shared-pantry-02-household-live.md` | **full** — ready to execute |
| `plans/2026-10-06-shared-pantry-03-communities-offers.md` | outline |
| `plans/2026-10-06-shared-pantry-04-logging-item-model.md` | outline |
| `plans/2026-10-06-shared-pantry-05-visual-pantry.md` | outline |
| `plans/2026-10-06-shared-pantry-06-discovery-passkeys-polish.md` | outline |

- A session reads **this overview + exactly one phase file + the spec's §2**
  (`specs/2026-10-06-shared-pantry.md`). It needs nothing else.
- Task numbers are global (Task 1–19) across all files.
- A phase is ticked in §5 once its phase Definition of Done is met.
- **Outlined phases** (03–06) already fix their tasks, files, interfaces and
  acceptance criteria. Before executing one, re-run `plan-feature` Phases 2–4
  on that file against the code that exists by then: verify the signatures,
  write the red tests per task, and set its Status to `Approved`. The user
  chose this on 2026-10-06 so later detail doesn't drift from code that
  doesn't exist yet.

## 1. Summary

A multi-user web app for households to keep a shared pantry with almost no
effort: add by name only, rough labelled estimates, expiry buckets, and a
used/binned/given record that builds itself. Households also join
neighbourhood communities, where food about to go to waste can be offered
with one tap and claimed live by neighbours. It is the COMP4020 final project
and replaces the course's busybox placeholder with an Astro/Node app backed by
SQLite on Fly's `/data` volume.

## 2. Requirements

The requirements are exactly **§2 of `specs/2026-10-06-shared-pantry.md`**,
approved 2026-10-06. This plan cites them as **FR1–FR38** (§2.1, numbered in
that file) and the NFR labels below, rather than restating them.

### 2.1 Functional requirements

FR1–FR38 as numbered in the spec §2.1. Index:

| FRs | Area |
| --- | --- |
| 1–9 | People and households |
| 10–15 | Items |
| 16–19 | Images |
| 20 | Search |
| 21 | Main pantry view |
| 22–25 | Communities |
| 26–33 | Offers |
| 34 | History |
| 35–38 | Live updates and persistence |

### 2.2 Non-functional requirements

These are labels for the bullets in the spec's §2.2:

| Label | Covers |
| --- | --- |
| **NFR-Effortless** | One field + Enter to add; one tap for each outcome and offer action; no confirm dialogs |
| **NFR-A11y** | Keyboard operability, colour independence, WCAG AA, reduced motion, live announcements |
| **NFR-Viewports** | 375px and 1280px, including a resize mid-use |
| **NFR-Privacy** | No location on the server; no EXIF; member names stay in the household; pickup note goes only to the claimer; logs redacted |
| **NFR-Resources** | 256 MB; small islands; lazy icons and map; one font |
| **NFR-Abuse** | Unguessable tokens, basic throttling, accepted risks |
| **NFR-Course** | `/` and `/readme/`; server-side logging |

### 2.3 Out of scope

As in the spec §2.3. Also out of scope for this plan: README prose,
`PROCESS.md`, `reflections/crit-*.md` and `PROCESS_LOG.md` entries. The course
requires the user to write those (see §3, "User-authored").

### 2.4 Assumptions

As in the spec §2.4, plus these, all verified 2026-10-06:

- **The CI workflow is fixed and course-owned.** It runs `pnpm install`,
  builds the Dockerfile, runs it with `--tmpfs /data`, then runs `pnpm check`
  against `http://localhost:8080`. It has **no Playwright browser install
  step**. So browser checks launch the system Chrome with
  `chromium.launch({ channel: "chrome" })`. Chrome is preinstalled on GitHub's
  `ubuntu-latest` and required on course machines.
  - CI only runs once the repo is public, so this is first proven at `/ship`.
  - **Accepted risk:** if it fails then, fix the browser helper. Never edit
    the workflow.
- **`fly.toml` is fixed:** internal port 8080 and no env vars beyond
  `PORT=8080`. The Dockerfile therefore sets `HOST=0.0.0.0`, `PORT=8080` and
  `DATABASE_PATH=/data/app.db`.
- **The spec suite runs against a single shared running app.** Tests isolate
  themselves by creating their own household per test, with their own cookie
  jar. They never assume an empty database.

## 3. Shared context & conventions

**Stack** (ADR 0001):

| Package | Version |
| --- | --- |
| Node | 24.21 |
| pnpm | 11.9 |
| Astro | ^7.3 |
| `@astrojs/node` | ^11.1 (standalone) |
| `@astrojs/preact` | ^6.0 |
| Preact | ^10.29 |
| better-sqlite3 | ^13 |
| drizzle-orm | ^0.45 |
| drizzle-kit (dev) | ^0.31 |
| TypeScript | 6 |
| vitest | 5 |
| Biome | 2.5 |
| jsdom | 30 |
| playwright (dev) | ^1.63, used only with `channel: "chrome"` |
| axe-core (dev) | ^4.13 |

These are the versions proven in `comp4020-crit7-attwelvedev`.

**Commands** (introduced in Task 1):

| Command | What it does |
| --- | --- |
| `pnpm dev` | Astro dev server on :8080 |
| `pnpm build` | `astro build` → `dist/` |
| `pnpm start` | `node ./dist/server/entry.mjs` (:8080, `DATABASE_PATH` defaults to `./.data/app.db`) |
| `pnpm typecheck` | `astro check` (covers `src/`, `spec/`, `scripts/`) |
| `pnpm lint` / `pnpm format` | Biome |
| `pnpm test` | `vitest run`: two projects, `unit` (`src/**/*.test.ts`, no server needed) and `spec` (`spec/**/*.test.ts`, needs the running app) |
| `pnpm test:unit` | `vitest run --project unit` |
| `pnpm check` | `pnpm typecheck && pnpm lint && pnpm test`. **Start the app first:** `pnpm build && pnpm start &` |
| `pnpm db:generate` | `drizzle-kit generate` after editing `src/lib/schema.ts`; commit the result in `drizzle/` |

**Layout and layering:**
- `src/lib/` holds the domain services. They take `db: Db` as the first
  argument and never touch `Astro`, `Request` or cookies, so they're
  unit-testable against an in-memory SQLite.
- `src/pages/` holds pages and form or JSON endpoints, which are thin:
  parse, call `src/lib`, redirect or respond.
- `src/middleware.ts` resolves the session into `Astro.locals`.
- `src/components/` holds Preact islands and Astro components.
- `src/styles/` holds tokens and global CSS.

**Tests:**
- Logic gets unit tests next to the code (`src/lib/*.test.ts`).
- Behaviour promised to users gets black-box HTTP tests in
  `spec/<area>.test.ts`, using `spec/http.ts`.
- Rendering, layout and keyboard checks go in `spec/layout/<area>.test.ts`,
  using `spec/browser.ts`, with **one file per area**. vitest runs files in
  parallel, so the slowest browser file sets `pnpm check`'s time.
- Task 1 adds `spec/suite-size.test.ts`, which caps browser files at 1000
  lines, as crit 7 did.

**Form POSTs:**
- Astro's `checkOrigin` is on. Spec helpers send an `Origin` header equal to
  the base URL.
- `security.allowedDomains` lists `**.fly.dev` over https, so the deployed app
  accepts same-origin POSTs behind Fly's proxy.

**Commits, pushing and deploying:**
- One commit per task once `pnpm check` is green, with messages that say what
  and why.
- `git push` and `mise exec -- flyctl deploy --remote-only --ha=false -a comp4020-final-attwelvedev`
  need the user's go-ahead (the harness asks).
- The deploy hook refuses a dirty tree.
- Never edit `fly.toml`, `spec/invariants.test.ts`, `spec/global-setup.ts`,
  `.github/workflows/` or `.githooks/` (the hooks block it).

**ADRs:** `doc/adr/0001`–`0004` are `proposed`. Flip one to `accepted` only
with the user's explicit yes, in the commit of the work it governs (Task 4 for
0001 and 0003; Task 6 for 0004; Task 5 for 0002).

**User-authored, never drafted by the agent:**
- The README prose (400–600 words, marked; the brief warns that agent prose
  signals little added value).
- `PROCESS.md`, `PROCESS_LOG.md` entries and `reflections/crit-*.md`.

The agent may build the checks around these files (the headings and the full
text served at `/readme/`), and may point out when a claim in the README has
no matching rule in `CLAUDE.md` or check in `spec/`.

## 4. Shared design

### 4.1 Architecture sketch

```
browser ──form POST / fetch JSON──▶ src/pages/** (thin) ──▶ src/lib/* services ──▶ SQLite (/data/app.db)
   ▲                                     │
   └──── SSE /events (Task 6) ◀── src/lib/live.ts (in-process pub/sub, after commit)
```

### 4.2 Shared types (introduced by Task 2 and Task 3, verbatim)

```ts
// src/lib/db.ts (Task 2)
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
export type Db = BetterSQLite3Database;
export const db: Db;                       // opened on DATABASE_PATH, WAL, migrated at import
export function openDb(path: string): Db;  // used by unit tests with ":memory:"

// src/lib/households.ts (Task 2)
export interface Household { id: string; name: string; inviteCode: string; createdAt: number }
export interface Member { id: string; householdId: string; name: string; createdAt: number }
export interface Session { member: Member; household: Household }
export function createHousehold(
  db: Db,
  input: { householdName: string; memberName: string },
): Session & { deviceToken: string };
export function sessionForToken(db: Db, token: string): Session | null;

// src/lib/session.ts (Task 2)
export const DEVICE_COOKIE = "pantry_device";
export function newDeviceToken(): string;            // 32 random bytes, base64url
export function hashToken(token: string): string;    // sha256 hex

// src/lib/items.ts (Task 3)
export type Outcome = "used" | "binned" | "given";
export interface Item { id: string; householdId: string; name: string; createdBy: string; createdAt: number }
export interface HistoryEntry {
  id: string; householdId: string; itemId: string; itemName: string;
  outcome: Outcome; memberId: string | null; memberName: string | null; at: number;
}
export function addItem(db: Db, session: Session, name: string): Item;
export function listPantry(db: Db, householdId: string): Item[];
export function recordOutcome(db: Db, session: Session, itemId: string, outcome: "used" | "binned"): HistoryEntry;
export function undoOutcome(db: Db, session: Session, historyId: string): Item;
export function listHistory(db: Db, householdId: string, filter?: Outcome): HistoryEntry[];

// src/lib/errors.ts (Task 2; re-exported from households.ts and items.ts)
export class NotFoundError extends Error {}
export class ValidationError extends Error {}

// src/env.d.ts (Task 2)
declare namespace App { interface Locals { session: import("./lib/households").Session | null } }
```

Phases 02–06 extend these (new columns and functions). Each outline names its
additions.

### 4.3 Schema (Task 2 and Task 3; later phases add tables via new migrations)

| Table | Columns |
| --- | --- |
| `households` | `id` text pk (uuid) · `name` text · `invite_code` text unique · `created_at` int (ms) |
| `members` | `id` text pk · `household_id` → households (cascade) · `name` text · `created_at` int |
| `device_tokens` | `token_hash` text pk · `member_id` → members (cascade) · `created_at` int · `last_seen_at` int |
| `items` | `id` text pk · `household_id` → households (cascade) · `name` text · `created_by` → members (set null) · `created_at` int · `removed_at` int null |
| `history` | `id` text pk · `household_id` → households (cascade) · `item_id` text · `item_name` text · `outcome` text (`used`, `binned`, `given`) · `member_id` text null · `at` int |

An item with `removed_at` set is out of the pantry. Undo clears it and
deletes the history row.

### 4.4 HTTP contract (cross-phase)

| Method and path | Body | Success | Failure | Task |
| --- | --- | --- | --- | --- |
| `GET /` | — | 200: first-run form (no session) or pantry | — | 2, 3 |
| `POST /households` | form `householdName`, `memberName` | 303 → `/`, sets the `pantry_device` cookie (HttpOnly, SameSite=Lax, Secure when https, Path=/, Max-Age 400 days) | 400 and the form re-rendered with the error, if either name is blank after trim or over 60 chars | 2 |
| `POST /items` | form `name` | 303 → `/` | 400 if blank or over 120 chars · 303 → `/` without a session | 3 |
| `POST /items/:id/outcome` | form `outcome` = `used` or `binned` | 303 → `/?undo=<historyId>` | 404 for an item that's unknown, in another household, or already removed · 400 for a bad outcome | 3 |
| `POST /history/:id/undo` | — | 303 → `/` | 404 if unknown or in another household | 3 |
| `GET /history[?outcome=used\|binned\|given]` | — | 200 | 303 → `/` without a session | 4 |
| `GET /readme/` | — | 200: README.md rendered in full | — | 1 |
| `GET /join`, `POST /join/code`, `GET /join/:token`, `POST /join/:token/accept` | form `code`/`memberName`, or `memberName` | 303 → `/` with the device cookie | 400 · 404 · 409 signed in · 429 throttled (failed joins) | 5 |
| `GET /household`, `POST /household/invite-link`, `POST /household/members/:id/remove`, `POST /household/leave` | — | 200 / 303 (see phase 02 §4) | 303 → `/` without a session · 404 | 5 |
| `GET /household/devices`, `POST /household/device-link`, `GET /device/:token`, `POST /device/:token/accept` | — | 200 / 303 with the device cookie | 404 · 409 signed in | 5 |
| `GET /events` | — | 200 `text/event-stream`, household channel | 401 without a session | 6 |
| `GET /api/pantry` | — | 200 `Snapshot` | 401 | 6 |
| `POST /items`, `POST /items/:id/outcome`, `POST /history/:id/undo` with `Accept: application/json` | as above | 201/200 JSON | 400/404/401 `{ error }` | 6 |
| *(Task 8 onward)* communities, offers | — | — | — | 8–19 |

## 5. Phases

Phases are ordered by **dependency, not date**. A phase can start as soon as
everything in its Needs column is done, however early that is. The "Done by"
column is a deadline: the latest a phase should land so its crit has
something to show. It is never a start gate.

| Phase | File | Tasks | Needs | Done by | Ends with | Done |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | `…-01-proof-of-life.md` | 1–4 | — | Week 9 crit | Deployed at `https://comp4020-final-attwelvedev.fly.dev`; first run, add by name, Used/Binned with undo, history; README served; `pnpm check` green. Human review of the first screens and the README | [x] |
| 02 | `…-02-household-live.md` | 5–7 | 01 | Week 10 crit | Invites, device links and member removal; SSE live sync under 1 s across two browsers; pantry island with optimistic updates and rollback | [x] |
| 03 | `…-03-communities-offers.md` | 8–10 | 02 | Week 10 crit | Communities joined by link or code; offer, claim, collect, release; scoped payloads; live offers feed | [ ] |
| 04 | `…-04-logging-item-model.md` | 11–13 | Tasks 11–12: 01 only. Task 13: 03 (offer-some needs Task 9) | Week 11 crit (logging) | Structured, redacted server logs; FoodKeeper guesses; measure types, estimates and moving buckets | [ ] |
| 05 | `…-05-visual-pantry.md` | 14–16 | 04 | Before 9 Nov (aim for week 12) | The Enamelware pantry view (tape, panel, trailing Used, keyboard model); images and photos; search combobox. Human review of the visual design | [ ] |
| 06 | `…-06-discovery-passkeys-polish.md` | 17–19 | 03, 05 (Task 18: only Task 5) | 9 Nov, noon (submission) | Map discovery and community areas; passkeys; accessibility and viewport pass | [ ] |

### 5.1 Starting early and running work in parallel

- **Start whenever the dependencies are done.** Before starting an outlined
  phase, re-plan it against the code as it stands (§0). Run
  `/comp4020:balance` first, so a phase isn't left half-finished when the
  week's budget runs out.
- **Work that can run alongside another phase,** in its own session:
  - Task 11 (logging core) and Task 12 (FoodKeeper guessing) only need
    Task 4.
  - Task 18 (passkeys) only needs Task 5.
  - Running these in parallel must not edit files another session is
    changing. Keep each session to its task's file list, and commit before
    switching.
- **Each crit is still marked on its own terms.** Being ahead doesn't hurt,
  but before each crit check that its own deliverable is shipped and tagged
  with `/ship`:

  | Crit | Deliverable |
  | --- | --- |
  | Week 9 | Proof of life |
  | Week 10 | Real-time, plus one recorded decision about behaviour with several people present |
  | Week 11 | Server-side logging |

- **If phase 04 starts before the week 11 crit spec is published,** re-check
  it against that spec when it appears.

### 5.2 Between phases: bugs and new ideas

- **Bugs:**
  - A bug fix is normally a Tweak. Start with a failing test that reproduces
    it, fix it, and commit once `pnpm check` is green. No plan needed.
  - If the agent caused it and could repeat it, also land the correction in
    `CLAUDE.md` or `spec/`, and the user logs it in `PROCESS_LOG.md`.
  - If the bug shows the spec was wrong or missing something, treat it as a
    new idea.
- **New ideas:**
  - Don't switch mid-phase. Add a line to `specs/backlog.md`, and finish the
    current phase green and committed.
  - At each phase boundary, sort the backlog: run `/brainstorm-feature` on
    any idea worth doing. It sizes the idea:
    - **Tweak:** do it directly.
    - **Slice:** a standalone slice plan in `plans/`, outside this set.
    - **Architecture:** a full spec, plus a new ADR that supersedes the old
      one. Accepted ADRs are never edited.
- **Check every idea against the definition of good.** Either it
  strengthens the README's argument, or README, `CLAUDE.md` and `spec/` are
  all updated together to include it. Features outside it earn nothing.
- **Never edit the approved spec silently.** Add a dated entry under a new
  "Amendments" heading at the end of `specs/2026-10-06-shared-pantry.md`, or
  write a new spec that links back to it.
- **When a change touches this plan,** edit the affected phase files in
  place:
  - Add or move tasks with new global numbers (20, 21, …).
  - Update §7.
  - If a shared type or endpoint changes, re-check every later phase's
    "Interfaces from earlier phases" list.

## 6. Feature-level Definition of Done

- [ ] Every phase in §5 is ticked, and every task is complete with tests passing
- [ ] `pnpm test` passes with the app running (`pnpm build && pnpm start`)
- [ ] `pnpm check` passes, and the CI `check` job is green once the repo is public
- [ ] Manually verified on the deployed URL, phone and desktop, two browsers:
  the spec §4 demo flow, from first run to offer, claim, collect and history
- [ ] Every requirement in §2 is covered (see §7)
- [ ] Every `Human review:` task explicitly accepted by the user
- [ ] ADRs 0001–0004 are `accepted` (or superseded), each committed with its work
- [ ] No item remains in §8

## 7. Requirements coverage check

| Requirement | Covered by |
| --- | --- |
| FR1 member = name, no accounts | Task 2 |
| FR2 first run | Task 2 |
| FR3 invite by link or code | Task 5 |
| FR4 device cookie | Task 2 |
| FR5 add-device link/QR | Task 5 |
| FR6 passkey | Task 18 |
| FR7 one household per device | Task 2 (first run hidden with a session), Task 5 (join while signed in refused) |
| FR8 leave or remove member, revoke | Task 5 |
| FR9 last member leaves → delete | Task 5 (offers part: Task 9) |
| FR10 add by name + Enter, optimistic | Task 3 (server), Task 7 (optimistic) |
| FR11 measure types and guessing | Task 12 (guess), Task 13 (model), Task 14 (controls) |
| FR12 estimates, attribution, latest-wins | Task 13, Task 14 |
| FR13 expiry buckets, moving, FoodKeeper | Task 12, Task 13, Task 14 |
| FR14 outcomes, one tap, undo, history | Task 3 (server + no-JS undo), Task 7 (toast) |
| FR15 duplicates allowed | Task 3 |
| FR16 image resolution chain | Task 15 |
| FR17 optional photo, client re-encode | Task 15 |
| FR18 photo lifetime | Task 15 (offer carry-over: Task 9 schema hook) |
| FR19 failed upload | Task 15 |
| FR20 search combobox | Task 16 |
| FR21 main pantry view | Task 3 (basic list), Task 14 (full design) |
| FR22 community creation, roles | Task 8 (name, roles), Task 17 (area circle) |
| FR23 discovery by location | Task 17 |
| FR24 join instantly, link/code, several | Task 8 (link/code), Task 17 (listed) |
| FR25 household names only, suffix | Task 8, Task 9 |
| FR26 one-tap offer, some, targets | Task 9, Task 10 (offer some value reduction: Task 13) |
| FR27 pickup note default | Task 9, Task 10 |
| FR28 lifecycle | Task 9 |
| FR29 first-come, no self-claim | Task 9 |
| FR30 note only to claimer | Task 9 |
| FR31 either side Collected, manual Release | Task 9, Task 10 |
| FR32 auto-withdraw, live update, past-estimate | Task 9 (past-estimate display: Task 14) |
| FR33 leaving withdraws and releases | Task 8, Task 9 |
| FR34 history list and filter | Task 3 (records), Task 4 (page) |
| FR35 live within ~1 s | Task 6, Task 7, Task 10 |
| FR36 optimistic + rollback | Task 7 |
| FR37 reconnect snapshot, status | Task 6, Task 7 |
| FR38 survives restarts and redeploys | Task 2 (DB on `DATABASE_PATH`), Task 4 (deploy and restart check) |
| NFR-Effortless | Task 3, Task 4 (one-field add), Task 7, Task 10, Task 14 |
| NFR-A11y | Task 4 (baseline axe/keyboard), Task 14, Task 16, Task 19 |
| NFR-Viewports | Task 4, Task 14, Task 19 |
| NFR-Privacy | Task 2 (hashed tokens), Task 9 (scoped payloads), Task 11 (log redaction), Task 15 (EXIF), Task 17 (no location in requests) |
| NFR-Resources | Task 1 (image), Task 14 (font), Task 15 (lazy icons), Task 17 (lazy map) |
| NFR-Abuse | Task 5 (unguessable invite token, throttling) |
| NFR-Course | Task 1 (`/`, `/readme/`), Task 11 (logging) |

## 8. Risks / open questions

None. The accepted risks are recorded in spec §6 and in this file's §2.4.
