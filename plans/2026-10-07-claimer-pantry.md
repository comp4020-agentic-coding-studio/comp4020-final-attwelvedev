# Claimer pantry: a collected offer lands in the claimer's pantry

- **Date:** 2026-10-07
- **Tier:** Slice
- **Status:** Approved (requirements confirmed by the user 2026-10-07, from the
  backlog line of the same day)
- **Read at:** `0a07735`. Commands: `pnpm check` (typecheck, Biome, vitest;
  spec files need the app running, `APP_URL`). Conventions: `CLAUDE.md`.

## What you'll see

- When either household taps **Collected** on a claimed offer, the claiming
  household's pantry gains that item within about a second, with no reload.
- It is an ordinary pantry item: Used and Binned work, and so does offering it
  on.
- The claimer's History has a new **Received** filter, and a row reading
  "Spinach received from a neighbour", with no Undo.
- The offering household sees exactly what it sees today. Nobody on the
  claiming side can tell who gave it, or read the pickup note.

## Demo script

1. A offers "Spinach" to a shared community; B claims it → B's pantry has no
   spinach yet.
2. A or B taps Collected → A's pantry loses spinach and A's History shows
   "Spinach given to a neighbour", as today.
3. Within about 1 s, with B's pantry page already open → "Spinach" appears at
   the top of B's pantry; no reload.
4. B opens History, filter **Received** → "Spinach received from a neighbour"
   and the time; no household or member name, no Undo link.
5. B taps Used on the spinach → it leaves the pantry and History shows "used by
   <B's member>" as for any item; the Received row stays.
6. Offer and claim a second item; A and B tap Collected in the same moment →
   B's pantry has exactly one copy.
7. Read B's pages, `/api/*` responses and `/events` frames for the whole run →
   A's household name, A's member names and A's pickup note appear nowhere.

## Requirements

- R1 (demo 2–3): collecting creates one pantry item for the claiming household,
  in the same transaction as the collect, then its household stream gets an
  `item.added`. Test: unit + spec.
- R2 (demo 6): the collect's existing `claimed` guard makes it happen once. Test:
  two simultaneous collects give one 200, one 409, one new item.
- R3 (demo 4): a history row with outcome `received` is written for the new item,
  `member_id` null. The History page has a Received filter and the wording
  "received from a neighbour". `undoOutcome` refuses it (`NotFoundError`, 404).
  Test: unit + spec + the History spec.
- R4 (demo 7): the item has `created_by` null and carries only the offer's
  item name. The event's `by` is `{ id: "", name: "a neighbour" }`, as
  `collectedEvents` already uses. Test: the privacy spec.
- R5: `received` is never on an `item.removed` event, because it records an add.
  Test: type-level (`Exclude<Outcome, "received">`) and a unit test on
  `collectedEvents`.

**Out of scope:** offer photos, announcer for remote arrivals (phase 05),
adding on Claim, reversing a receive, a "Received" toast. No migration:
`history.outcome` is plain text (`drizzle/0001_*.sql`), the enum is TypeScript
only, so this slice stays clear of Task 18's `schema.ts` changes.

## Tasks

### Task 1: Collected creates the claimer's item and a Received record

Behaviour: `collectOffer` (`src/lib/offers.ts`) also inserts an item for
`claimedByHouseholdId` (`created_by` null, name from the offer's item, `created_at`
now, the same row shape `addItem` writes) and a `received` history row, and
returns them. A new `receivedEvents` in `src/lib/offerEvents.ts` builds the
`item.added` for the claimer's household channel; `collected.ts` publishes it
after the commit with the existing events. `Outcome` gains `received`; the
`item.removed` event's `outcome` becomes `Exclude<Outcome, "received">`;
`undoOutcome` refuses `received` like `given`. If `addItem`'s insert is worth
sharing (Task 13 will make it do more), extract the insert so both paths use
it.

Files: `src/lib/items.ts`, `src/lib/offers.ts`, `src/lib/offerEvents.ts`,
`src/lib/live.ts`, `src/pages/offers/[id]/collected.ts`, plus tests.

Red first: `offers.test.ts` (collect by either side adds one plain item to the
claimer and one `received` row with null member; the offerer's side unchanged),
`items.test.ts` (undo of `received` is `NotFoundError`; `listHistory(..,
"received")`), `offerEvents.test.ts` (`receivedEvents` channel, type, `by`,
no note and no offerer id; `collectedEvents` never `received`).

Verified by: those tests, then `spec/offers.test.ts` (B's `/api/pantry` gains the
item; two simultaneous collects give 200 and 409 and one item) and
`spec/privacy.test.ts` (B's pages, JSON and frames never contain A's household
name, member names or the note).

Depends on: none.

### Task 2: History: Received filter and wording

Behaviour: `src/pages/history.astro` adds a **Received** filter and renders
`received` rows as "<item> received from a neighbour" with no "by". Empty-state
text names received items. The undo link is absent for `received` rows, as for
`given`.

Red first: `spec/history.test.ts` (Received filter lists the row with the
wording and no name; no Undo; `/history/:id/undo` on it is 404).

Depends on: Task 1.

### Task 3: Live arrival in the browser, spec text and backlog

Behaviour: a browser spec shows the claimer's open pantry gaining the item live.
`specs/2026-10-06-shared-pantry.md` is amended: FR14's "Given happens only via a
collected offer" gains the receiving side, and FR34's filter list adds Received.
`specs/backlog.md` moves the item to "Decided" with this plan. The Task 13
outline in `plans/2026-10-06-shared-pantry-04-logging-item-model.md` gets a line:
the receive path must create its item through the same insert as `addItem`, so
guessed category, measure and shelf life apply to received items too.

Files: `spec/layout/receiving.test.ts` (new, 30 s timeout, a file of its own per
`suite-size.test.ts`), the two docs above, the phase 04 plan.

Verified by: the spec (B's open pantry shows the item within 1 s of A's
Collected, at phone and desktop width, axe clean, no dialog); demo steps 1–5 run
once in a browser with screenshots at 375 and 1280 px.

Depends on: Tasks 1 and 2.

## Human review

None: every demo step is checkable by the specs above.

## Corrections log

(Empty at plan time.)
