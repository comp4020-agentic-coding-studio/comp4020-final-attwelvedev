# Shared pantry — Phase 03: Communities and offers

- **Date:** 2026-10-06 (re-planned against the phase 02 code on 2026-10-07)
- **Status:** Approved
- **Requirements confirmed by user:** yes — 2026-10-06
- **Part of:** `plans/2026-10-06-shared-pantry-00-overview.md`. It leans on
  §2.4 (assumptions), §3 (conventions) and §4.2 (shared types).
- **Depends on phases:** 02 (live hub, JSON endpoints, island patterns).

## 1. Summary

Households join communities by link or code, offer pantry items to them with
one tap, and neighbours claim, collect or release offers live. This phase is
the week 10 crit's real-time story: the pod uses it together. When it ends, a
household can create or join communities, offer food from its pantry, and see
neighbours' offers arrive, get taken, and be collected, all within about a
second and without a reload.

**Changes from the outline** (found by reading the phase 02 code on
2026-10-07; each is carried into §4 and §5):

| Change | Why |
| --- | --- |
| `offers` gains `pickup_note` and `claimed_community_id` | The outline stored the note nowhere. The community a claim went through fixes both sides' display names, which can differ per community |
| `community_links` table replaces `communities.link_token_hash` | A single hashed column can never be shown again. Links are minted on demand, shown once, valid 7 days, as `invite_links` are |
| `quantity_note` dropped | Nothing here writes it. Task 13 adds what offer-some needs |
| New **Task 20** takes the "Offer from the pantry" half of Task 10 | The outline's Task 10 had no task touching `PantryList.tsx`, so no Offer button. A new global number is the sanctioned way to add a task (overview §5.2) |
| Either side can Release | The spec §4.1 wireframes show Release on the claimer's card as well as the offerer's |
| ~~"Offer to…" beside Offer~~ → the "Send to" checklist is in the sheet whenever the household is in 2+ communities | The outline's separate button existed only because the sheet opened once. Amended 2026-10-07: every Offer opens the sheet (see the Corrections log) |
| History page gains a Given filter and "to a neighbour" | FR34. No `given` rows existed before this phase |
| `undoOutcome` refuses a `given` entry | Otherwise Undo would restore an item that has already left |
| Create endpoints are `POST /communities/create` and `POST /offers/create` | An `.astro` page and a `.ts` endpoint at one path make the endpoint shadow the page (GET 404, checked 2026-10-07), so `POST /communities` and `POST /offers` could not sit beside their GET pages |
| Community household list is live | FR35 |

## 2. Requirements (this phase)

### 2.1 Functional

| FR | Part implemented here |
| --- | --- |
| FR22 | Name, creator role, succession. The map circle is Task 17 |
| FR24 | Link and code, several communities per household. Listed discovery is Task 17 |
| FR25 | Household names only, with a suffix on clashes |
| FR26–FR31, FR33 | In full. FR26's "offer some" value reduction lands with measure types in Task 13; until then "offer some" is hidden |
| FR9 | Open offers are withdrawn when a household is deleted |
| FR32 | Excluding the past-estimate display (Task 14) and live value edits (Task 13) |
| FR34 | The Given filter and its wording |
| FR35 | Offers and community household lists, live |
| FR36 | Offer, Withdraw, Collected and Release are optimistic where the server doesn't decide a winner. Claim waits for the server by design |
| FR18 | Hook only: an offer refers to its item, so a later photo shows automatically |

### 2.2 Non-functional

| NFR | Part implemented here |
| --- | --- |
| NFR-Privacy | The pickup note reaches only the claiming household. No member name appears in any community payload or page. A neighbour never learns who claimed. **Enforced in `spec/`** |
| NFR-Effortless | Claim, Collected, Release and Join are one tap; offering takes the sheet and Post (a note per item, prefilled); no confirm dialog of any kind |
| NFR-A11y | Sheet is a `<dialog>` (Esc closes, focus returns); claim results and errors use the existing `role=status` regions; no colour-only status. The throttled announcer for remote arrivals belongs to phase 05 (Tasks 14 and 16) |
| NFR-Viewports | Feed and pages at 375 and 1280, no horizontal overflow |
| NFR-Resources | One `EventSource` per page however many islands it has; the desktop rail hydrates only at desktop width |

### 2.3 Out of scope for this phase

| Deferred | Phase |
| --- | --- |
| Map, area and listed discovery, Join with Undo | 06 |
| Offer photos | 05 |
| "Offer some", past-estimate display, live value edits on an offer | 04 (Task 13), 05 (Task 14) |
| Community filter chips, tab bar, visual polish beyond the tokens | 05 |

### 2.4 Assumptions

See overview §2.4, plus:
- **Any member of a household acts for it:** joining, leaving, offering,
  claiming, collecting. A household is the member of a community.
- **"Creator" is a household,** so any member of that household can remove
  households.
- **A display name is fixed when a household joins** (no household rename
  exists), so it is stable for as long as the household stays.

## 3. Existing code context (verified 2026-10-07)

Read at commit `ec00af3`. The pantry, history, household and join code is as
phase 02 left it.

**Files this phase edits:** `src/lib/schema.ts`, `src/lib/errors.ts`,
`src/lib/households.ts`, `src/lib/items.ts`, `src/lib/live.ts`,
`src/lib/sse.ts`, `src/lib/snapshot.ts`, `src/env.d.ts`, `src/pages/events.ts`,
`src/pages/household/leave.ts`, `src/pages/household/members/[id]/remove.ts`,
`src/pages/household/index.astro`, `src/pages/items/[id]/outcome.ts`,
`src/pages/history.astro`, `src/pages/history/[id]/undo.ts`,
`src/pages/index.astro`, `src/layouts/Base.astro`,
`src/components/useLiveStream.ts`, `src/components/PantryList.tsx`,
`src/components/pantryState.ts`, `src/styles/pantry.css`, `CLAUDE.md`.

**Facts and gotchas:**

- **Migrations** are `drizzle/0000`–`0002`; add `0003` (Task 8) and `0004`
  (Task 9) with `pnpm db:generate`. `openDb(":memory:")` applies them, so unit
  tests see new tables. `foreign_keys = ON`, so cascades work.
- **Time and ids:** epoch-millisecond integers, `randomUUID()` text ids,
  tokens stored only as `hashToken(...)` (`src/lib/session.ts`).
- **`history.member_id` has no foreign key,** and `listHistory` left-joins
  `members` by it. So a `given` row written with a *claimer's* member id would
  print that neighbour's name in the offerer's history. Collected by the
  claimer must write `member_id = null`.
- **`removeMember` deletes the household in the same transaction** when the
  last member goes, so its `offers` rows cascade away. Events for those offers
  must be built *before* the delete and returned, never re-read afterwards.
- **`/events` fixes its channels at connect time.** A community joined later
  needs the open stream to follow it (§4.3).
- **`useLiveStream` opens one `EventSource` per call** and lists event names in
  `EVENT_TYPES`. Two islands on one page would open two streams.
  `history.astro`'s `FILTERS` has no Given entry, and its rows print
  `<outcome> by <name>`.
- **One existing assertion changes:** `src/lib/households.test.ts:269`
  asserts `toEqual({ member, householdDeleted: false })` on `removeMember`.
  Task 8 adds `communityLeaves` to that result and updates the assertion.
- **Test layout:** vitest runs files in parallel and a file's tests serially.
  Browser files so far are 80–140 lines against a 1000-line cap. This phase
  adds three browser files (communities, offers, offering) rather than growing
  one. Each case that boots several contexts sets a 30 s timeout, as
  `spec/layout/live-sync.test.ts` does.
- **Spec helpers:** `client(baseUrl, { headers })` keeps its own cookie jar;
  give each test its own `fly-client-ip` (see `ownAddress()` in
  `spec/live.test.ts`) so the failed-join throttle never couples tests.
  `openStream(baseUrl, cookie)` (`spec/sse.ts`) reads `/events` raw.
  `startHousehold`, `joinHousehold`, `streamOpen`, `row`, `addItem` are in
  `spec/people.ts`.
- **Conventions to match:** services take `db` first, throw `NotFoundError` /
  `ValidationError`, return their change; endpoints are thin, answer JSON when
  `wantsJson`, otherwise 303; pages read `Astro.locals` for re-rendered errors
  (`joinError` pattern). Biome formatting; `import type` for type-only imports.

### Interfaces from earlier phases (exact)

Copied from the source at `ec00af3`.

```ts
// src/lib/db.ts (Task 2)
export type Db = BetterSQLite3Database;
export function openDb(path: string): Db;

// src/lib/households.ts (Tasks 2, 5)
export interface Household { id: string; name: string; inviteCode: string; createdAt: number }
export interface Member { id: string; householdId: string; name: string; createdAt: number }
export interface Session { member: Member; household: Household }
export function removeMember(db: Db, session: Session, memberId: string): { member: Member; householdDeleted: boolean };
export function leaveHousehold(db: Db, session: Session): { member: Member; householdDeleted: boolean };
// private today, shared by Task 8: type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

// src/lib/items.ts (Task 3)
export type Outcome = "used" | "binned" | "given";
export interface Item { id: string; householdId: string; name: string; createdBy: string; createdAt: number }
export interface HistoryEntry {
  id: string; householdId: string; itemId: string; itemName: string;
  outcome: Outcome; memberId: string | null; memberName: string | null; at: number;
}
export function recordOutcome(db: Db, session: Session, itemId: string, outcome: "used" | "binned"): HistoryEntry;
export function undoOutcome(db: Db, session: Session, historyId: string): Item;
export function listHistory(db: Db, householdId: string, filter?: Outcome): HistoryEntry[];

// src/lib/errors.ts (Task 2)
export class NotFoundError extends Error {}
export class ValidationError extends Error {}

// src/lib/live.ts (Task 6)
export interface Actor { id: string; name: string }
export type LiveEvent =
  | { type: "item.added"; item: Item; by: Actor; rid?: string }
  | { type: "item.removed"; itemId: string; itemName: string; outcome: Outcome; historyId: string; by: Actor }
  | { type: "item.restored"; item: Item; by: Actor }
  | { type: "member.joined"; member: { id: string; name: string } }
  | { type: "member.removed"; member: { id: string; name: string }; by: Actor };
export const householdChannel = (householdId: string): string => `household:${householdId}`;
export function subscribe(channel: string, send: (e: LiveEvent) => void): () => void;
export function publish(channel: string, e: LiveEvent): void;

// src/lib/sse.ts (Task 6)
export function eventFrame(e: LiveEvent): string;   // `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`
export function eventStream(opts: {
  channels: string[]; signal: AbortSignal; heartbeatMs?: number; closeWhen?: (e: LiveEvent) => boolean;
}): ReadableStream<Uint8Array>;

// src/lib/snapshot.ts (Task 6)
export interface Snapshot {
  household: { id: string; name: string }; me: { id: string; name: string };
  members: { id: string; name: string }[]; items: Item[];
}
export function snapshotFor(db: Db, session: Session): Snapshot;

// src/lib/http.ts (Task 6)
export function wantsJson(headers: Headers): boolean;
export function json(body: unknown, status?: number): Response;
export function failure(asJson: boolean, status: number, message: string): Response;

// src/lib/throttle.ts (Task 5)
export const joinThrottle: FailureThrottle;   // { blocked(key, now?): boolean; fail(key, now?): void }, 10 failures / 60 s
export function throttleKey(headers: Headers, clientAddress: string): string;

// src/components/useLiveStream.ts (Task 7)
export interface LiveHandlers { onEvent(e: LiveEvent): void; onOpen(): void; onUnauthorised(): void }
export function useLiveStream(handlers: LiveHandlers): { connected: boolean; reconnecting: boolean };

// src/components/ToastRegion.tsx, ConnectionStatus.tsx (Task 7)
export interface Toast { id: string; text: string; actionLabel?: string; onAction?: () => void }
export function ToastRegion(p: { toasts: Toast[]; onDismiss: (id: string) => void; durationMs?: number }): JSX.Element;
export function ConnectionStatus(p: { reconnecting: boolean }): JSX.Element;
```

## 4. Approach

### 4.1 Schema

Migration `0003` (Task 8) and `0004` (Task 9). Times are epoch ms.

| Table | Columns |
| --- | --- |
| `communities` | `id` pk · `name` · `join_code` unique · `creator_household_id` → households (no cascade) · `created_at` · nullable `centre_lat`, `centre_lng`, `radius_m` (unused until Task 17) |
| `community_households` | `community_id` → communities (cascade) · `household_id` → households (cascade) · `joined_at` · `display_name` · pk (`community_id`, `household_id`) |
| `community_links` | `token_hash` pk · `community_id` → communities (cascade) · `created_by` → members (set null) · `created_at` · `expires_at` |
| `offers` | `id` pk · `item_id` → items (cascade) · `household_id` → households (cascade) · `pickup_note` · `status` (`offered`, `claimed`, `collected`, `withdrawn`) · `claimed_by_household_id` → households (set null) · `claimed_community_id` → communities (set null) · `claimed_at` null · `created_at` |
| `offer_targets` | `offer_id` → offers (cascade) · `community_id` → communities (cascade) · pk both |

- `offers` also carries a **unique partial index** on `item_id` where `status`
  is `offered` or `claimed`: an item has at most one open offer, enforced by
  the database. Check the generated SQL contains the `WHERE`.
- `households` gains nullable `default_pickup_note` (migration `0004`). Since
  2026-10-07 it means the **last note used**: every offer saves its note there
  so the next sheet starts from it. The column keeps its name; renaming it
  needs a migration for nothing.

### 4.2 Rules

- **Codes:** community join codes use the same `WORD-NN` format as household
  invite codes. The generator moves out of `households.ts` into
  `src/lib/codes.ts` so both share it.
- **Display name:** the household's name; if another household in that
  community already shows it (case-insensitive), `"<name> · N"` with the
  smallest free N ≥ 2. Fixed at join.
- **Join** is idempotent: joining a community you are in is a success with
  `joined: false`. Wrong code or link: `NotFoundError`, which counts toward
  `joinThrottle`.
- **Creator succession:** when the creator household leaves or is removed,
  the earliest `joined_at` (ties by household id) among the rest becomes
  creator. When the last household leaves, the community is deleted.
- **Offer:**
  - The item must be in the caller's household and not removed
    (`NotFoundError`), with no open offer (`ConflictError`, "Already
    offered").
  - The note is the posted `note`, trimmed, 1–280 characters
    (`ValidationError` otherwise); a blank note is refused even when an earlier
    one was saved, because notes change from item to item. The posted note
    becomes the household's last-used note.
  - Targets are the posted community ids, each of which must be one of the
    household's communities; default is all of them; none at all is
    `ValidationError` ("Join a community first.").
- **Claim** runs in a transaction:
  1. The offer must be `offered` with a target community the caller's
     household is in, else `NotFoundError`.
  2. Same household as the offerer is `ForbiddenError`.
  3. `UPDATE offers SET status='claimed', claimed_by_household_id=?, claimed_community_id=?, claimed_at=? WHERE id=? AND status='offered' AND household_id<>?`
     touching zero rows is `ConflictError` ("Someone claimed this first.").
  - `claimed_community_id` is the first shared community ordered by
    `communities.created_at`, then id. It fixes the display names both sides
    see for the life of the claim.
- **Release** (either side): `claimed` → `offered`, clearing the `claimed_*`
  columns. **Withdraw** (offerer only): `offered` or `claimed` → `withdrawn`.
  Wrong state is `ConflictError`; a household that is neither side is
  `NotFoundError`.
- **Collected** (either side, only from `claimed`): status `collected`, the
  item's `removed_at` set, a `history` row with outcome `given`. `member_id`
  is the offerer's member when the offerer taps, **null** when the claimer
  does.
- **Auto-withdraw:** `recordOutcome` withdraws the item's open offer inside
  its own transaction.
- **Leaving or being removed from community X** (one function for both): the
  household's open offers lose target X (and are withdrawn if no target is
  left; one claimed via X is first released); its claims made via X are
  released; membership and succession as above. A household deleted with its
  last member does this for every community it is in, before the delete.
- **Pickup note edit:** `updateOfferNote` (offerer only, status `offered` or
  `claimed`). The household default is edited separately.

### 4.3 Domain outputs and live events

Services return what changed and endpoints publish after the commit (CLAUDE.md).
Every change to an offer is returned as one self-contained value, so the events
can be built with no database read. That matters for a deleted household, whose
offers no longer exist after the commit.

```ts
// src/lib/offers.ts (Task 9)
export type OfferStatus = "offered" | "claimed" | "collected" | "withdrawn";
export interface PublicOffer { id: string; itemName: string; fromName: string; communityIds: string[]; createdAt: number }
export interface MyOffer {
  id: string; itemId: string; itemName: string; status: OfferStatus;
  note: string;                                        // this offer's own note: its offerer may read and edit it
  claimedBy: string | null; claimedAt: number | null;   // the claimer's display name
  communityIds: string[]; createdAt: number;
}
export interface ClaimedOffer {
  id: string; itemName: string; fromName: string; note: string;
  status: "claimed" | "released" | "collected" | "withdrawn"; claimedAt: number;
}
export interface OfferChange {
  kind: "posted" | "taken" | "closed" | "note";
  offer: MyOffer;                                    // the offerer's view after the change
  offererHouseholdId: string;
  communities: { id: string; fromName: string }[];   // where neighbours hear of it, in announce order
  claim: { householdId: string; offer: ClaimedOffer } | null;  // the household whose claim this touched
}
```

**Events** (added to `LiveEvent`; `offer.*` payloads are built only by
`offerEvents` in `src/lib/offerEvents.ts`):

| Event | Channel | Payload | Never contains |
| --- | --- | --- | --- |
| `offer.posted` | `community:<id>` | `{ communityId, offer: PublicOffer }`. An upsert by `offer.id`: also used when an offer is re-offered after a Release | note, claimer, any household or member id of the offerer |
| `offer.taken` | `community:<id>` | `{ communityId, offerId }` | claimer, note |
| `offer.closed` | `community:<id>` | `{ communityId, offerId }` | |
| `offer.mine` | `household:<offerer>` | `{ offer: MyOffer }`, with the offer's note. A terminal `status` means drop it | |
| `offer.claim` | `household:<claimer>` | `{ offer: ClaimedOffer }`, with the note. With `offer.mine` on the offerer's own household channel, the only places a note travels | |
| `membership.joined` / `membership.left` | `household:<id>` | `{ community: { id, name } }` / `{ communityId }` | |
| `community.householdJoined` | `community:<id>` | `{ communityId, household: { id, displayName } }` | member names |
| `community.householdLeft` | `community:<id>` | `{ communityId, householdId, creatorHouseholdId }` | |

- **Order of publication** for one change: `offer.mine`, then `offer.claim`,
  then the community events in announce order (by community `created_at`, then
  id). The feed relies on `offer.mine` arriving first so a household's own
  offer is never shown as someone else's.
- **Collected** also publishes `item.removed` (outcome `given`) on the
  offerer's household channel. When the claimer collected, `by` is
  `{ id: "", name: "a neighbour" }`, so no neighbour's member name reaches the
  offerer's household.
- **`/events` follows memberships.** `eventStream` gains an optional
  `follow(e): { add?: string[]; remove?: string[] } | void`, called for each
  event delivered, which subscribes or unsubscribes channels on the same
  stream (an add of a channel already held is a no-op). `/events` starts with
  `household:<id>` plus `community:<id>` for each community, and follows
  `membership.joined` / `membership.left`.
- **`Routed`** (`{ channel: string; event: LiveEvent }`) and
  `publishAll(list: Routed[]): void` are added to `live.ts`.
  `communityEvents.ts` (Task 8) and `offerEvents.ts` (Task 9) return `Routed[]`.
  Endpoints call `publishAll` after the commit.

### 4.4 HTTP contract (this phase's additions to overview §4.4)

All need a session. Without one: form → 303 `/`; JSON → 401 `{ error }`.
An endpoint answers JSON when `Accept: application/json`, otherwise 303 (to
`/offers` for claim, collected and release; to `/` for offer and withdraw).

| Method and path | Body | Success | Failure | Task |
| --- | --- | --- | --- | --- |
| `GET /communities` | — | 200: my communities, create form, join-by-code form | | 8 |
| `POST /communities/create` | form `name` | 303 → `/communities/:id` | 400 re-renders `/communities` | 8 |
| `GET /communities/:id` | — | 200: households, code, creator controls | 404 not a member | 8 |
| `POST /communities/join/code` | form `code` | 303 → `/communities/:id` | 400 unknown code · 429 throttled | 8 |
| `POST /communities/:id/join-link` | — | 200: the community page showing the link once, `Cache-Control: no-store` | 404 | 8 |
| `GET /communities/join/:token` | — | 200 confirm page | 404 unknown or expired · 200 "start a household first" without a session | 8 |
| `POST /communities/join/:token/accept` | — | 303 → `/communities/:id` | 404 · 429 | 8 |
| `POST /communities/:id/leave` | — | 303 → `/communities` | 404 not a member | 8 |
| `POST /communities/:id/households/:householdId/remove` | — | 303 → `/communities/:id` | 403 caller's household isn't the creator · 400 own household · 404 | 8 |
| `GET /events` | — | as before, plus `community:<id>` channels that follow joins and leaves | 401 | 8 |
| `POST /offers/create` | form `itemId`, `note` (required), `communityIds` (repeatable; default all) | 201 `{ offer: MyOffer }` | 400 · 404 · 409 already offered | 9 |
| `POST /offers/:id/claim` | — | 200 `{ offer: ClaimedOffer }` (with the note) | 404 · 403 own offer · 409 "Someone claimed this first." | 9 |
| `POST /offers/:id/collected` | — | 200 `{ offerId }` | 404 · 409 not claimed | 9 |
| `POST /offers/:id/release` | — | 200 `{ offerId }` | 404 · 409 not claimed | 9 |
| `POST /offers/:id/withdraw` | — | 200 `{ offerId }` | 404 · 403 not the offerer · 409 already closed | 9 |
| `POST /offers/:id/note` | form `note` | 200 `{ offerId }` | 400 · 404 · 403 · 409 | 9 |
| `POST /household/pickup-note` | form `note` | 303 → `/household` (JSON: 200 `{ note }`) | 400 blank or over 280 | 9 |
| `GET /api/offers` | — | 200 `OffersSnapshot` | 401 | 9 |
| `GET /api/pantry` | — | as before, plus `offering` | 401 | 9 |
| `POST /history/:id/undo` on a `given` entry | — | | 404 | 9 |
| `GET /history?outcome=given` | — | 200 | | 9 |

```ts
// src/lib/offers.ts (Task 9)
export interface OffersSnapshot {
  communities: { id: string; name: string }[];
  incoming: PublicOffer[];   // status offered, by other households, in any of mine; newest first; one row per offer
  mine: MyOffer[];           // my household's offered or claimed offers; newest first
  claimed: ClaimedOffer[];   // offers my household claimed and hasn't collected, with the note
}
// src/lib/snapshot.ts: Snapshot gains
export interface Offering { communities: { id: string; name: string }[]; defaultPickupNote: string | null; open: MyOffer[] }
```

For an `incoming` offer shared through several communities, `fromName` is the
display name in the first shared community by `communities.created_at`, then id
(the order events are announced in), and `communityIds` is the intersection
with the viewer's communities.

### 4.5 UI shape

- **Pages:** `/communities` and `/communities/:id` are server-rendered Astro
  pages with real forms. `/communities/:id` hosts one small island for its live
  household list. `/offers` hosts `OffersFeed`. `Base.astro`'s nav gains
  **Offers**; the household page links to Communities.
- **Desktop rail:** `index.astro` renders `OffersFeed` beside `PantryList` under
  a `wide` variant of `Base` (a 720 px list and a 360 px rail), hydrated with
  `client:media="(min-width: 1100px)"`. Below that width the rail is not
  shown and the Offers page is the way in.
- **One stream per page:** `useLiveStream` keeps a single module-level
  `EventSource`, reference-counted across islands. Every handler set hears
  every event and each handler's `onOpen` fires on each open.
- **Claim is not optimistic** (the server decides the winner); it shows the
  button busy for the round trip. The loser sees "Someone claimed this first."
  in place, not an error toast. Other taps are optimistic with rollback and
  Retry, as in phase 02.
- **Names in text,** such as "from Unit 9, 20 min ago", come from a small pure
  `ago(then, now)` helper, which phase 04's "Sam's estimate, 2 h ago" reuses.

## 5. Task breakdown

Tasks run 8 → 9 → 10 → 20. Task 20's number is out of sequence on purpose
(§1); the dependency order is the one that matters.

### Task 8: Communities: create, join by code or link, leave, remove, succession, live membership

- [x] Done

- **Description:** Build communities end to end except offers. A household
  creates a community by name and is its first member; any household joins by
  code or by a minted link; any household leaves; the creator household removes
  another. Display names get a suffix on a clash. Creator succession and
  community deletion follow §4.2. A household deleted with its last member
  leaves every community first, and `removeMember` / `leaveHousehold` return
  those `communityLeaves` so the endpoints can publish them. `/events` follows
  the household's communities as they change. Pages are plain forms; their
  live list is Task 10.
- **Files:**
  - `src/lib/codes.ts` (new; `WORDS`, `newCode(taken)`, `normaliseCode`, moved
    from `households.ts`, which imports them) + `codes.test.ts`.
  - `src/lib/communities.ts` (new) + `communities.test.ts`:
    ```ts
    export interface Community { id: string; name: string; joinCode: string; creatorHouseholdId: string; createdAt: number }
    export interface CommunityHousehold { householdId: string; displayName: string; joinedAt: number }
    export interface MyCommunity extends Community { households: number; displayName: string }
    export interface CommunityJoin { community: Community; joined: boolean; household: { id: string; displayName: string } }
    export interface CommunityLeave {
      community: { id: string; name: string }; householdId: string;
      communityDeleted: boolean; creatorHouseholdId: string | null;
    }
    export const COMMUNITY_LINK_TTL_MS: number;   // 7 days
    export function createCommunity(db: Db, session: Session, name: string): Community;
    export function joinCommunityByCode(db: Db, session: Session, code: string): CommunityJoin;
    export function joinCommunityByLink(db: Db, session: Session, token: string, now?: number): CommunityJoin;
    export function createCommunityLink(db: Db, session: Session, communityId: string, now?: number): { token: string; expiresAt: number };
    export function previewCommunityLink(db: Db, token: string, now?: number): { id: string; name: string } | null;
    export function listMyCommunities(db: Db, householdId: string): MyCommunity[];   // oldest joined first
    export function getCommunity(db: Db, householdId: string, communityId: string): { community: Community; households: CommunityHousehold[]; isCreator: boolean };
    export function communityIdsFor(db: Db, householdId: string): string[];
    export function leaveCommunity(db: Db, session: Session, communityId: string): CommunityLeave;
    export function removeHouseholdFromCommunity(db: Db, session: Session, communityId: string, householdId: string): CommunityLeave;
    export function leaveAllCommunities(tx: Tx, householdId: string): CommunityLeave[];
    ```
    `Tx` is the transaction type `households.ts` already declares privately;
    export it from `db.ts` and use it in both.
  - `src/lib/communityEvents.ts` (new) + test: `joinedEvents(join: CommunityJoin): Routed[]`
    and `leftEvents(leave: CommunityLeave): Routed[]` (Task 9 extends the
    latter with offer events).
  - `src/lib/errors.ts`: add `ForbiddenError`.
  - `src/lib/schema.ts` + `pnpm db:generate` (`drizzle/0003_*`).
  - `src/lib/households.ts`: `removeMember` and `leaveHousehold` return
    `communityLeaves: CommunityLeave[]` (empty unless the household was
    deleted).
  - `src/lib/live.ts`: the four community and membership events, `Routed`,
    `publishAll`. `src/lib/sse.ts`: `follow`.
  - `src/pages/events.ts`: the extra channels and `follow`.
  - `src/pages/household/leave.ts`, `src/pages/household/members/[id]/remove.ts`:
    `publishAll(communityLeaves.flatMap(leftEvents))`.
  - `src/env.d.ts`: optional locals `communityError` and `newCommunityLink`
    (same shape as `joinError` / `newInviteLink`).
  - Pages: `src/pages/communities/index.astro`, `[id].astro`,
    `join/[token].astro`. Endpoints: `src/pages/communities/create.ts`,
    `join/code.ts`, `join/[token]/accept.ts`, `[id]/join-link.ts`,
    `[id]/leave.ts`, `[id]/households/[householdId]/remove.ts`.
  - `src/pages/household/index.astro`: a Communities section linking to
    `/communities`.
  - `spec/neighbours.ts` (new HTTP helpers: `ownAddress()`, `newHousehold`,
    `createCommunity`, `joinCommunityByCode`), `spec/communities.test.ts`.
- **Tests to write first (red):**
  - Unit `codes.test.ts`: codes match `^[A-Z]+-\d{2}$`; `normaliseCode` treats
    `" kettle 42 "` and `"KETTLE-42"` the same. The existing households tests
    stay green.
  - Unit `communities.test.ts`:
    - Create trims the name, rejects blank and over-60; the creator household
      is the first member; the code is unique.
    - Display names: a second "Unit 4" shows as "Unit 4 · 2", a third as
      "Unit 4 · 3", a case variant clashes, and an earlier household leaving
      does not rename anyone.
    - Join by code: normalised input works; an unknown code is `NotFoundError`;
      joining twice gives `joined: false` and one row; one household can be in
      two communities.
    - Links: only a member can mint one (`NotFoundError` otherwise); a link
      previews and joins until `expiresAt` (inject `now`), then not; it is
      reusable; only its hash is stored.
    - Leave: not a member is `NotFoundError`; the creator household leaving
      passes the role to the earliest `joined_at`; the last household leaving
      deletes the community.
    - Remove: only the creator household (`ForbiddenError` otherwise); removing
      your own household is `ValidationError`; an unknown household is
      `NotFoundError`.
    - `removeMember` of a household's last member leaves every community it was
      in: the community survives with a new creator if others remain, and is
      deleted if not; both appear in `communityLeaves`. Update the assertion at
      `households.test.ts:269`.
  - Unit `communityEvents.test.ts`: `joinedEvents` yields `membership.joined` on
    the household channel then `community.householdJoined` on the community
    channel; none when `joined` is false; `leftEvents` yields the mirror pair,
    carrying `creatorHouseholdId`; no payload contains a member name.
  - Unit `sse.test.ts`: `follow` adding a channel delivers later events from
    it; removing one stops them; adding a held channel does not double-deliver;
    the event that triggered `follow` is still delivered first.
  - Spec `spec/communities.test.ts` (HTTP, own `fly-client-ip` per client):
    - Create → 303 to the community page, which shows the code. A second
      household joins by code and both appear by household name; **no member
      name appears in the page** (FR25).
    - Join by link: mint, see it once (a reload shows no link), a third
      household joins with it, the link works twice, a bogus token is 404.
    - The creator removes a household; a non-creator gets 403.
    - The creator household leaves: the other household's community page now
      offers Remove.
    - One household in two communities, leaving one keeps the other.
    - Ten wrong codes → 429 with `Retry-After`.
    - No session: pages redirect to `/`.
    - Stream follows: A and B open `/events`; B joins by code and A hears
      `community.householdJoined` with B's display name within 1 s; B then hears
      A's later `community.householdLeft` on the same stream, without
      reconnecting; after B is removed, B no longer hears that community.
- **Implementation (green):** as §4.1–§4.4. Services in transactions; endpoints
  parse, call, `publishAll` after the commit, redirect.
- **Refactor:** none beyond the `codes.ts` and `Tx` moves.
- **Acceptance:** all of the above green; `pnpm check` green; the generated
  `0003` migration is committed; the pages return 200 with their headings.
- **Depends on:** Task 7.

### Task 9: Offers domain: offer, claim race, collect as given, release, withdraw, scoped payloads

- [x] Done

- **Description:** The offers service, its endpoints, the scoped event builder
  and the places that must react to offers: `recordOutcome` (auto-withdraw),
  leaving a community, deleting a household, history. Adds the household's
  default pickup note and the `offering` slice of the pantry snapshot. No UI.
- **Files:**
  - `src/lib/offers.ts` (new) + `offers.test.ts`. Besides the §4.3 types:
    ```ts
    export const MAX_NOTE = 280;
    export function createOffer(db: Db, session: Session, input: { itemId: string; note?: string; communityIds?: string[] }): OfferChange;
    export function claimOffer(db: Db, session: Session, offerId: string): OfferChange;
    export function releaseOffer(db: Db, session: Session, offerId: string): OfferChange;
    export function withdrawOffer(db: Db, session: Session, offerId: string): OfferChange;
    export function updateOfferNote(db: Db, session: Session, offerId: string, note: string): OfferChange;
    export function collectOffer(db: Db, session: Session, offerId: string): { change: OfferChange; entry: HistoryEntry; byOfferer: boolean };
    export function setDefaultPickupNote(db: Db, session: Session, note: string): string;
    export function offersSnapshotFor(db: Db, session: Session): OffersSnapshot;
    export function offeringFor(db: Db, session: Session): Offering;
    export function withdrawOpenOffersForItem(tx: Tx, itemId: string): OfferChange[];   // used by recordOutcome
    export function retargetOnLeave(tx: Tx, householdId: string, communityId: string): OfferChange[];   // used by leaveCommunity
    ```
  - `src/lib/offerEvents.ts` (new) + `offerEvents.test.ts`:
    `offerEvents(change: OfferChange): Routed[]` (pure, no database) and
    `collectedEvents(...)` for the `item.removed` event.
  - `src/lib/errors.ts`: add `ConflictError`.
  - `src/lib/schema.ts` + `pnpm db:generate` (`drizzle/0004_*`, with the
    partial unique index).
  - `src/lib/items.ts`: `recordOutcome` returns
    `HistoryEntry & { offerChanges: OfferChange[] }` and withdraws open offers
    in its transaction; `undoOutcome` refuses a `given` entry with
    `NotFoundError`.
  - `src/lib/communities.ts`: `CommunityLeave` gains
    `offerChanges: OfferChange[]`; `leaveCommunity`,
    `removeHouseholdFromCommunity` and `leaveAllCommunities` call
    `retargetOnLeave`. `src/lib/communityEvents.ts`: `leftEvents` also emits
    `offerEvents` for them.
  - `src/lib/live.ts`: the five offer events. `src/lib/snapshot.ts`: `offering`.
  - Endpoints: `src/pages/offers/create.ts` (POST),
    `src/pages/offers/[id]/claim.ts`, `collected.ts`, `release.ts`,
    `withdraw.ts`, `note.ts`, `src/pages/api/offers.ts`,
    `src/pages/household/pickup-note.ts`. Edit
    `src/pages/items/[id]/outcome.ts` to `publishAll` the offer changes.
  - `src/pages/history.astro`: a Given filter; `given` rows read
    "<item> given to a neighbour" (plus "by <name>" when a member of this
    household collected). `src/pages/history/[id]/undo.ts` maps the refusal to 404.
  - `CLAUDE.md`: one line under "Live changes": offer payloads are built only by
    `offerEvents`; an endpoint never constructs an `offer.*` event.
  - `spec/offers.test.ts`, `spec/privacy.test.ts`, extend `spec/history.test.ts`;
    `spec/neighbours.ts` gains `offerItem`, `claim`, `openStreamFor`.
- **Tests to write first (red):**
  - Unit `offers.test.ts`:
    - **Offer:** whole item to all communities; subset by id; unknown or
      foreign community id, none joined, blank note with no default, over 280
      are `ValidationError`; another household's or removed item is
      `NotFoundError`; a second open offer is `ConflictError`, and inserting one
      directly violates the partial index; every posted note becomes the
      household's last-used note; a blank note is refused even after one was
      saved (amended 2026-10-07, Task 20).
    - **Claim:** two claims in a row from different households give one success
      and one `ConflictError`; claiming your own offer is `ForbiddenError`; an
      offer in a community you are not in is `NotFoundError`; the claim carries
      the note and records `claimed_community_id`.
    - **Release:** either side returns it to `offered`; a household that is
      neither side is `NotFoundError`; releasing an unclaimed offer is
      `ConflictError`.
    - **Withdraw:** offerer only (`ForbiddenError` for the claimer); works from
      `offered` and `claimed`.
    - **Collected:** the item leaves the pantry; history shows `given`;
      `member_id` is the offerer's when they tap and **null** when the claimer
      does, so `listHistory` never returns a neighbour's name; collecting an
      unclaimed offer is `ConflictError`.
    - **Auto-withdraw:** `recordOutcome` Used on an offered item withdraws it
      (`offerChanges` has a `closed` change over every target); on a claimed
      item the claimer's `claim` is touched with status `withdrawn`.
    - **Leaving X:** with an offer targeting X and Y, the offer stays on Y and
      is closed on X; an offer on X alone is withdrawn; a claim made via X is
      released; the leaver's claims via X are released; a claim via Y survives.
      A deleted household (`removeMember` of the last member) returns
      withdrawals that are complete without any database read.
    - **Notes:** `updateOfferNote` is offerer-only; `setDefaultPickupNote`
      validates 1–280.
    - **`offersSnapshotFor`:** `incoming` excludes my own, claimed, withdrawn
      and other-community offers, shows `communityIds` as the intersection and
      one row for a multi-community offer; `mine` and `claimed` are right;
      `fromName` carries a clash suffix.
    - **`undoOutcome`** on a `given` entry is `NotFoundError`.
  - Unit `offerEvents.test.ts` (**the privacy rules, at their source**):
    - Per `kind`, the exact set of channels and event types, in the §4.3 order.
    - The offer note appears in no event except `offer.claim` on the claimer's
      channel; the claimer's household name appears only in the offerer's
      `offer.mine`; no event on any `community:` channel contains a household id
      of the offerer or a claimer; no payload contains a member name.
  - Unit `snapshot.test.ts`: `offering` lists the household's communities, its
    default note and its open offers.
  - Spec `spec/offers.test.ts`:
    - **Claim race:** `Promise.all` of two claims from different households →
      exactly one 200 and one 409 whose message is "Someone claimed this first."
    - **No self-claim:** 403.
    - **Collected:** the item leaves `/api/pantry`; `/history?outcome=given`
      lists it as "to a neighbour".
    - **Release** returns it to `incoming`; **Withdraw** removes it.
    - **Auto-withdraw:** Used on an offered item removes it from the neighbour's
      `/api/offers`.
    - **Leaving a community** withdraws the household's offers there and
      releases its claims there; deleting the last member of the offering
      household withdraws its offers (a neighbour's open stream hears
      `offer.closed`).
    - **Undo a `given` entry** → 404.
    - JSON shapes and 401s; `POST /household/pickup-note` rejects blank and
      over 280.
  - Spec `spec/privacy.test.ts`, named after the NFR-Privacy bullets in spec
    §2.2 so a README claim can cite them. With three households (offerer,
    neighbour, claimer), each with an open `/events` stream, and an offer note
    that differs from the household's last-used note:
    - **Pickup notes go only to the claiming household** (amended 2026-10-07:
      and to the offering household, which wrote it): the note appears in the
      claimer's `POST …/claim` response, `/api/offers` and `offer.claim` frames
      and in the offerer's own `offer.mine` frames, `/api/offers` and
      `/api/pantry`, and **nowhere else**: not in any other household's
      response, page or stream frame, and not on any community channel.
    - **Member names stay in the household:** across `/communities/:id`,
      `/api/offers`, `/offers` and every community-channel frame, no member name
      appears; a neighbour's collection never puts their name in the offerer's
      `item.removed` or history.
    - **A neighbour never learns who claimed:** the third household sees
      `offer.taken` and nothing naming the claimer.
- **Implementation (green):** §4.2 and §4.3. Each operation builds its
  `OfferChange` inside the transaction from rows it already holds. Endpoints
  call `publishAll(offerEvents(change))` after the commit; collected also
  publishes the `item.removed` event.
- **Refactor:** none.
- **Acceptance:** all of the above green; the privacy tests are named per the
  spec bullets; `pnpm check` green; `0004` is committed with the partial index
  in its SQL.
- **Depends on:** Task 8.

### Task 10: Offers feed: live arrivals, claim, collected and release, rail, community list

- [x] Done

- **Description:** The receiving side of offers. A feed island lists offers in
  my communities, "Your offers" and "Offers you've claimed", with Claim,
  Collected, Release and Withdraw as one tap each, updating live from the
  events in §4.3. It is the Offers page on phone and a rail beside the pantry
  at desktop width. The community page's household list becomes live. All
  islands on a page share one stream. Offers are created in tests over HTTP
  until Task 20 adds the button.
- **Files:**
  - `src/components/offersState.ts` (new reducer, pure) + `offersState.test.ts`.
  - `src/components/ago.ts` + `ago.test.ts`.
  - `src/components/OffersFeed.tsx`, `OfferRow.tsx`, `CommunityHouseholds.tsx`.
  - `src/components/useLiveStream.ts`: one shared `EventSource`; the new event
    names in `EVENT_TYPES`.
  - `src/styles/offers.css`.
  - `src/pages/offers.astro`; `src/pages/index.astro` (rail, `client:media`);
    `src/layouts/Base.astro` (Offers in the nav; a `wide` prop);
    `src/pages/communities/[id].astro` (the island).
  - `spec/layout/offers.test.ts`, `spec/layout/communities.test.ts`;
    `spec/neighbours.ts` gains browser helpers (`startCommunity`,
    `joinCommunityVia`).
- **Tests to write first (red):**
  - Unit `offersState.test.ts`: every action is idempotent and order-safe.
    `snapshot` replaces `incoming`, `mine` and `claimed` but keeps a row that is
    marked taken; `offer.posted` upserts and unions `communityIds`; a posted
    event for an id already in `mine` is ignored; `fromName` of an existing row
    is kept (first wins); `offer.taken` marks a row taken and `forget` removes
    it; `offer.closed` removes it; `offer.mine` upserts, and a terminal status
    drops it; `offer.claim` upserts and a non-`claimed` status drops it;
    `claim.pending`, `claim.lost` (row taken, no error) and `claim.won`.
  - Unit `ago.test.ts`: "just now", minutes, hours, days; a future time reads as
    "just now".
  - Browser `spec/layout/offers.test.ts` (offers made over HTTP, two or three
    contexts, a 30 s timeout each):
    - An offer appears in the neighbour's feed within 1 s.
    - Claim in B → C sees "Taken" within 1 s and the row collapses within 7 s;
      the offerer sees "Claimed by <household>" within 1 s; C never sees B's
      name; B sees the pickup note, C's page never contains it.
    - Collected from either side removes it everywhere; Release returns it to C's
      feed within 1 s.
    - **Lost race:** B and C press Claim together; one wins, the other reads
      "Someone claimed this first." in place, with no error toast.
    - **New-offer pill:** with enough offers to scroll at PHONE height, scrolled
      down, a new offer shows "1 new offer" without moving the list; pressing it
      returns to the top.
    - **No communities:** the page says "Join a community to see and share
      offers" with a link; **no offers:** "No offers in your communities right
      now".
    - **One stream:** at DESKTOP, `/` has the rail and the page makes exactly one
      `/events` request; at PHONE the rail is not shown.
    - **Reconnect:** with the stream blocked then unblocked, the feed catches up
      without a reload (the pattern in `live-sync.test.ts`).
    - **Layout:** at PHONE and DESKTOP, `/offers` has no horizontal overflow and
      `axeViolations` is empty; a wrapped 2-line name does not overflow; no
      dialog opens at any step.
  - `spec/privacy.test.ts` (Task 9) lists the pages it reads in `PAGES`; add
    `/offers` to it once the page exists, so the privacy claims cover the feed.
  - Browser `spec/layout/communities.test.ts`: when a second household joins, an
    open community page lists it within 1 s; when the creator removes it, the
    other page drops it within 1 s, and the removed household's open offers feed
    stops hearing that community; `/communities` and `/communities/:id` have no
    overflow and no axe violations at both widths.
- **Implementation (green):** reducer first, then the components. Reuse
  `ToastRegion` and `ConnectionStatus` unchanged. Rows show the item name, "from
  <name>, <ago>", and the status as text as well as style (struck "Taken",
  a "Claimed" label), never colour alone. Claim is not optimistic (§4.5).
- **Refactor:** `useLiveStream` and its two existing callers
  (`PantryList.tsx`, `MemberList.tsx`) keep their call signature; the existing
  live specs stay green.
- **Acceptance:** all of the above green at PHONE and DESKTOP; axe clean;
  `pnpm check` green. The human review for this flow is on Task 20.
- **Depends on:** Task 9.

### Task 20: Offer from the pantry: Offer sheet with a note per item, Undo, view and edit a note, last note used

- [x] Done

- **Description:** The offering side. Each pantry row gains **Offer**, which
  always opens a sheet (a `<dialog>`): the pickup note, filled with the last
  note the household used and selected so typing replaces it, and, for 2+
  communities, a "Send to" checklist (all ticked). **Post offer** (or Enter)
  posts it; Esc cancels. A toast follows every offer: "<item> offered to N
  communities. Undo · Edit note" (Undo withdraws; Edit note opens the note
  sheet). An offered or claimed row reads "Offered" or "Claimed by <household>"
  and gets **Note** (view and edit that offer's note, with Save) and
  **Withdraw**. A household with no community sees a "Join a community to
  offer food to neighbours" link instead of the buttons. The last note used is
  also editable on the household page. A neighbour's Collected shows on the
  pantry row as "Given to a neighbour".
- **Amends Task 9** (changed 2026-10-07 after the user's review; see the
  Corrections log): `MyOffer` gains `note`; `createOffer` always stores the
  posted note as the household's last-used note and refuses a blank one; the
  privacy invariant becomes "the note reaches only the offering and claiming
  households". Touched: `src/lib/offers.ts`, `offers.test.ts`,
  `offerEvents.test.ts`, `communityEvents.test.ts`, `offersState.test.ts`,
  `spec/privacy.test.ts`. These test edits follow a deliberate rule change by
  the user, not a weakened check.
- **Files:**
  - `src/components/OfferSheet.tsx` (new), `src/components/PantryList.tsx`,
    `src/components/pantryState.ts` + `pantryState.test.ts`.
  - `src/styles/offers.css`, `src/styles/pantry.css`.
  - `src/pages/household/index.astro`: a "Last pickup note" form (works with
    scripts off).
  - `spec/layout/offering.test.ts`, `spec/layout/offering-layout.test.ts`.
- **Tests to write first (red):**
  - Unit `pantryState.test.ts`:
    - `offers.snapshot` and `offer.mine` mark and unmark a row and carry its
      note; a terminal status clears the mark; both are idempotent.
    - `offer.noted` shows an edited note at once; the same action with the old
      note rolls it back; the server's `offer.mine` wins; it ignores a row
      with no offer.
    - `event.removed` with outcome `given` gives the note "Given to a neighbour".
    - Offering is not allowed on a pending row.
  - Browser `spec/layout/offering.test.ts` (two or three contexts, 30 s each):
    - **Every Offer opens the sheet:** the first one with an empty focused
      note; the second prefilled with the previous note, selected; typing
      replaces it; Enter posts; that offer carries the new text (a claimer
      sees it) and the next sheet starts from it; the household page shows it
      as the last pickup note.
    - **Undo** withdraws: the neighbour's feed drops it within 1 s. **Edit
      note** opens that offer's own note; saving changes what a claimer sees.
    - **Note button:** an offered row's Note opens that offer's current note
      (two offers, two different notes); Esc returns focus to the button;
      editing before a claim gives the claimer the new text; editing after a
      claim updates the claimer's page live.
    - **Send to** is in the sheet only with 2+ communities (and there is no
      separate "Offer to…" button); unticking one means only the ticked
      community's member sees the offer (A in X and Y, B in X, C in Y).
    - **Auto-withdraw:** Used on an offered row removes it from the neighbour's
      feed within 1 s.
    - **Collected by the claimer:** the offerer's row drops within 1 s showing
      "Given to a neighbour", and History shows it under Given; the claimer's
      name appears nowhere in the offerer's pages.
    - **No community:** the hint link shows and there is no Offer button.
    - **Keyboard and layout** (`offering-layout.test.ts`): Esc closes the sheet
      and focus returns to the Offer button; Enter in the note field posts; at
      PHONE and DESKTOP no overflow and `axeViolations` is empty with the offer
      sheet and the note sheet open.
- **Implementation (green):** `PantryList` takes `offering` from the snapshot
  and handles `offer.mine`. Offer, Withdraw and Save note are optimistic with
  rollback and Retry like the phase 02 taps. The sheet is one component with
  two modes (offer, note).
- **Refactor:** none.
- **Acceptance:** tests green at PHONE and DESKTOP; `pnpm check` green.
- **Departures (recorded during execution):**
  - The browser spec is two files, `offering.test.ts` (flows) and
    `offering-layout.test.ts` (keyboard and layout), so they run in parallel,
    as Task 10 did.
  - `Toast` gains an optional `actions: { label, onAction }[]` so one toast can
    hold Undo and Edit note; `actionLabel`/`onAction` still work.
  - `PantryList` now uses `components/api.ts`'s `postJson` (arrays repeat a
    field, for the community checklist) instead of its own copy.
  - Rows also get an offer-state label, **Note** and **Withdraw** in place of
    Offer; Used and Binned stay, so Used on an offered row auto-withdraws it.
  - The sheet is shown from an effect, so a browser test waits for the note
    field to be visible before reading it or pressing a key.
- **Human review:** the user and a pod-mate try offer → claim → collect on a
  local build (`pnpm build && pnpm start`, so the tree can stay uncommitted
  until they accept), as two browser profiles or a second device reaching the
  server by its LAN address. This also covers the Task 10 feed. **Pass:** it is
  understandable without explanation; it is always clear who has the food and
  where to collect it; offering takes one sheet and Post, and the note for one
  item can be read and changed from its row; claim, collect and release take
  one tap each, and nothing needed a confirm.
- **Departures (execution, 2026-10-07):**
  - Browser specs are split into `spec/layout/offers.test.ts` (live flows) and
    `spec/layout/offers-layout.test.ts` (small screen, rail, empty states,
    reconnect, layout), with the `trio` setup in `spec/neighbours.ts`, so the
    two run in parallel (CLAUDE.md "Test speed").
  - New `src/components/api.ts` (`postJson`, `getJson`, `HttpError`) so the feed
    can read a 409's message. `PantryList.tsx` keeps its own copy until Task 20
    touches it.
  - `GET /communities/:id` answers JSON (`households`, `creatorHouseholdId`)
    for `Accept: application/json`, so the live household list can refetch on
    reconnect. It was not in the §4.4 table.
  - `OffersFeed` takes `showConnection`; the rail passes false because the
    pantry island beside it already shows the shared stream's state (two
    "Reconnecting…" broke `live-sync.test.ts`).
  - `spec/communities.test.ts` and `spec/privacy.test.ts` now read page markup
    with inline scripts removed (`withoutScripts`): the Astro island bootstrap
    spells "Sam" in `isSameNode`, which tripped the member-name checks once a
    community page carried an island. Text and island props are still checked.
- **Depends on:** Tasks 9 and 10.

## 6. Phase Definition of Done

- [ ] Tasks 8, 9, 10 and 20 complete, each committed with `pnpm check` green
- [ ] `pnpm test` passes with the app running (`pnpm build && pnpm start`)
- [ ] Task 20 human review accepted by the user
- [ ] Deployed before the week 10 crit; the offers and privacy specs pass
      against the deployed app
      (`APP_URL=https://comp4020-final-attwelvedev.fly.dev pnpm exec vitest run --project spec spec/offers.test.ts spec/privacy.test.ts spec/communities.test.ts`),
      proving Fly's proxy streams community channels too
- [ ] The multi-browser flow (create or join, offer, claim, collect) is checked
      on the deployed URL
- [ ] Tick phase 03 in overview §5, with Tasks `8–10, 20`

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR22 (name, roles), FR24 (link, code, several), FR25 | Task 8 |
| FR9 (offers part), FR26 (all but offer-some), FR28, FR29, FR30, FR33 | Task 9 |
| FR31 (rules), FR32 (rules), FR34 (Given) | Task 9 |
| FR26, FR27 UI | Task 20 |
| FR31 UI, FR35 (offers and community lists) | Task 10 |
| FR36 (offer taps) | Task 20; (claim is server-decided, §4.5) |
| FR18 hook | Task 9 (the offer refers to its item) |
| NFR-Privacy (notes, member names, claimer) | Task 9 (`offerEvents.test.ts`, `spec/privacy.test.ts`), Task 8 (names in pages) |
| NFR-Effortless | Task 10 (Claim, Collected, Release), Task 20 (Undo; Offer is a sheet and Post) |
| NFR-A11y, NFR-Viewports | Tasks 10, 20 |
| NFR-Resources (one stream, lazy rail) | Task 10 |
| Human review (offer, claim, collect) | Task 20 |

## 8. Risks / open questions

None.

## 9. Corrections log

One line per redirect after the user saw something: what was expected, what
they wanted, and why the first attempt missed.

- **2026-10-07, Task 20 (before the human review).** Expected: after a
  household's first offer, Offer posts in one tap with a remembered default
  note (spec FR26–27; NFR-Effortless listed Offer). Wanted: every Offer opens
  the sheet, prefilled with the previous note and editable before posting,
  because notes change from item to item; and an offerer needs a button on
  each of their offers to view and edit that item's note. Missed because the
  spec put "no second tap" ahead of how people actually write pickup notes, and
  the plan copied the spec's one-tap rule without asking whether one default
  note fits every item. Consequences, all applied: `default_pickup_note` means
  last used; `MyOffer` carries `note`; a blank note is refused; the privacy
  invariant widens from "claimer only" to "offerer and claimer"; the separate
  "Offer to…" button folds into the sheet's "Send to" checklist; spec FR26,
  FR27, FR30, the effortless list, the wireframes and decision-log rows 9 and
  21, and the overview's NFR and coverage lines were reworded to match.
- **Open follow-up (not editable here):** accepted ADR 0004 says "Pickup notes
  are only ever sent on the claiming household's stream". The offering
  household's own stream now carries its own note too. An accepted ADR is never
  edited, so this needs a superseding record from `brainstorm-feature`.
