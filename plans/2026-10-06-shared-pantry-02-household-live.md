# Shared pantry — Phase 02: Household sharing and live sync

- **Date:** 2026-10-06
- **Status:** Outline. Before executing, re-run `plan-feature` Phases 2–4 on
  this file (overview §0).
- **Requirements confirmed by user:** yes — 2026-10-06
- **Part of:** `plans/2026-10-06-shared-pantry-00-overview.md`. It leans on
  §3 (layering, tests), §4.2–4.4 and the ADR rules.
- **Depends on phases:** 01.

## 1. Summary

A second person can join the household by link or code, and a member can add
another device. Every change appears in every other open session of that
household within about a second, over SSE. The pantry becomes a Preact island
with optimistic updates, rollback and an Undo toast. The phase-01 forms remain
as the no-JS fallback.

## 2. Requirements (this phase)

### 2.1 Functional

| FR | Part implemented here |
| --- | --- |
| FR3, FR5, FR8 | In full |
| FR7 | A join link opened on a signed-in device says "You're already in <household>" and doesn't join |
| FR9 | Household deletion; the offer part is Task 9 |
| FR10 | Optimistic add |
| FR14 | Undo toast |
| FR35, FR36, FR37 | For household channels |

### 2.2 Non-functional

| NFR | Part implemented here |
| --- | --- |
| NFR-Effortless | No confirm dialogs in the island |
| NFR-Abuse | Invite link token of 128 bits; join throttled per device (e.g. 10 per minute) |
| NFR-A11y | Toast live region; reconnecting status as text |

### 2.3 Out of scope for this phase

| Deferred | Phase |
| --- | --- |
| Community channels | 03 |
| Estimate attribution and remote-change marks on values | 04/05 |
| Passkeys | 06 |

### 2.4 Assumptions

See overview §2.4. A new dependency, `qrcode` (server-side SVG), needs a
one-line reason in its commit message.

## 3. Existing code context

To be verified at phase start. The table below is what phase 01 creates.

### Interfaces from earlier phases (exact)

Copied from overview §4.2: `Db`, `db`, `openDb`, `Household`, `Member`,
`Session`, `createHousehold`, `sessionForToken`, `DEVICE_COOKIE`,
`newDeviceToken`, `hashToken`, `Outcome`, `Item`, `HistoryEntry`, `addItem`,
`listPantry`, `recordOutcome`, `undoOutcome`, `listHistory`, `NotFoundError`,
`ValidationError`, and `App.Locals.session`. The spec helpers `client`,
`text`, `launch`, `openPage`, `PHONE`, `DESKTOP`, `horizontalOverflow` and
`axeViolations` come from phase 01 Task 1.

Endpoints from phase 01:

| Endpoint | Behaviour |
| --- | --- |
| `POST /households` | Creates household + member, sets cookie |
| `POST /items` | Adds an item |
| `POST /items/:id/outcome` | 303 → `/?undo=<historyId>` |
| `POST /history/:id/undo` | Restores the item |
| `GET /history` | History page |

## 4. Approach

- **Live hub** (`src/lib/live.ts`):
  - `subscribe(channel: string, send: (e: LiveEvent) => void): () => void`
    and `publish(channel: string, e: LiveEvent): void`.
  - Channels are named `household:<id>` (and `community:<id>` from phase 03).
  - Services return their change. Endpoints publish **after** the write
    commits.
- **`GET /events`** (SSE):
  - Authenticates by cookie and subscribes to the session's channels.
  - Sends `event: <type>` with JSON `data`, plus a 25 s heartbeat comment.
  - On close, unsubscribes.
  - Responds 401 without a session.
- **Event types for this phase:** `item.added`, `item.removed` (carries the
  outcome and member name), `item.restored`, `member.joined`,
  `member.removed`. Each event carries enough to render without a refetch.
- **Snapshot and JSON writes:**
  - `GET /api/pantry` returns `{ household, members, items }`.
  - The phase-01 POST endpoints also accept `Accept: application/json` and
    return JSON (201/200/4xx) instead of 303.
- **Island:** `PantryList.tsx` hydrates over the server-rendered list, using
  `client:load`. It applies its own changes optimistically and reconciles
  with the response, rolling back with an inline "Couldn't save… Retry" on
  failure. It subscribes via `EventSource`, refetches the snapshot on
  `open` after an error, and ignores echoes of its own changes by a client
  request id.
- **Status:** `ConnectionStatus.tsx` shows "Reconnecting…" only after 3 s
  disconnected.
- **Join:**
  - `/join/<linkToken>` (128-bit, stored hashed) and `/join` (code form).
  - Both ask for a name only, then create a member and token.
- **Device link:** `/household/devices` shows a one-time link and a QR SVG,
  valid for 10 minutes and single use, that signs the scanning device in as
  the same member.

## 5. Task breakdown

### Task 5: Invites, joining, device links, leaving and removing members

- **Description:** Implement the join and device flows above, plus the
  household settings page (invite link and code, members, leave, remove,
  devices). Removing a member deletes their device tokens. When the last
  member leaves, the household is deleted (cascade). Accept ADR 0002 with the
  user's yes.
- **Files:**
  - `src/lib/households.ts`: adds `joinByCode`, `joinByLink`,
    `inviteLinkToken`, `createDeviceLink`, `redeemDeviceLink`,
    `removeMember`, `leaveHousehold`.
  - `src/lib/schema.ts` + migration: `invite_links`, `device_links`.
  - `src/pages/join/[token].astro`, `src/pages/join/index.astro`,
    `src/pages/household/index.astro`, `src/pages/household/devices.astro`.
  - Endpoints under `src/pages/household/`.
  - `spec/invites.test.ts`.
- **Tests to write first:**
  - Unit: each new function, including a single-use expired device link,
    removing a member, and deletion when the last member leaves.
  - Spec:
    - Two clients share a household through a link and through a code.
    - A signed-in device opening a join link doesn't join.
    - A removed member's next request lands on first run.
    - A device link signs in as the same member exactly once.
    - Join throttling returns 429.
- **Acceptance:** tests green; `pnpm check` green.
- **Depends on:** Task 4.

### Task 6: In-process live hub and the `/events` SSE stream with snapshot

- **Description:** `src/lib/live.ts`, `src/pages/events.ts`,
  `src/pages/api/pantry.ts`, JSON variants of the phase-01 endpoints, and
  publishing after commit. Accept ADR 0004 with the user's yes.
- **Tests to write first:**
  - Unit: `publish` reaches only subscribers of that channel; unsubscribe
    stops delivery.
  - Spec (`spec/live.test.ts`, using a raw `fetch` stream reader):
    - Client A's stream receives `item.added` within 1000 ms of client B's
      POST in the same household.
    - A third household's stream receives nothing.
    - `/events` returns 401 without a session.
- **Acceptance:** tests green; the SSE response has
  `Content-Type: text/event-stream` and no buffering through Fly (header
  `X-Accel-Buffering: no`; verify on the deployed app).
- **Depends on:** Task 5 (`member.*` events). The core could start after
  Task 4.

### Task 7: Pantry island with optimistic updates, rollback, Undo toast and connection status

- **Description:** `src/components/PantryList.tsx`, `ToastRegion.tsx`,
  `ConnectionStatus.tsx`, wired in `index.astro` with `client:load`. The no-JS
  forms still work.
- **Tests to write first** (`spec/layout/live.test.ts`, browser):
  - Two browser contexts in one household. Add in A, and it appears in B
    within 1 s. Used in B, and it leaves A with "Used by <name>".
  - Undo toast restores the item.
  - With route interception failing `POST /items`, the optimistic row rolls
    back with Retry.
  - With scripts blocked, the phase-01 form flow still works.
  - No dialogs.
- **Acceptance:** tests green at PHONE and DESKTOP; axe clean.
- **Human review:** the user watches two browsers side by side. **Pass:**
  live changes feel immediate and calm, with no flicker or jumping.
- **Depends on:** Task 6.

## 6. Phase Definition of Done

- [ ] Tasks 5–7 complete, each committed with `pnpm check` green
- [ ] Deployed; two real browsers verified live on the fly.dev URL
- [ ] ADRs 0002 and 0004 accepted, with the user's yes
- [ ] Task 7 human review accepted
- [ ] Tick phase 02 in overview §5

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR3, FR5, FR7 (join refused), FR8, FR9 (household part) | Task 5 |
| FR35, FR37 | Task 6, Task 7 |
| FR10 (optimistic), FR14 (toast), FR36 | Task 7 |
| NFR-Abuse | Task 5 |

## 8. Risks / open questions

None. Refine at phase start.
