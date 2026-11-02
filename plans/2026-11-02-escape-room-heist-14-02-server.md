# Escape-room heist: Phase 14 (caches): server and results data

- **Date:** 2026-11-02
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-11-02
- **Part of:** `plans/2026-11-02-escape-room-heist-14-00-overview.md`. Read it first (shared types §4, demo §2).
- **Depends on phases:** 14-01 (Tasks 51, 52).

## 1. Summary

The server turns the cache into results: a credit line naming the solver, the `cleared` message's cache result, the heist record kept
across rooms and sent with `heist`, and a `cache` log line of kinds only. Ends with `spec/heist.test.ts` seeing the new fields.

## 2. Requirements (this phase)

### 2.1 Functional

Cache FR15 (credit names the solver), FR16 (the data half: the per-room record), FR18 (logging).

### 2.2 Non-functional

Logging: never the item, riddle, motif, owner or solver in a log line. Never a nickname server-side: a teammate is a `{seat}` token.

### 2.3 Out of scope for this phase

Drawing the tile or shelf (14-03).

### 2.4 Assumptions

See overview §2. A cache that was never uncovered reports `found: false`, same as an uncovered one left unsolved.

## 3. Existing code context (verified 2026-11-02)

- `src/net/attach.ts`: `running.heist: { ms; loot; lootTotal; versions: string[] }` (line ~106, created at ~494 and ~828); the room-clear
  block builds `roomRun`, `board`, sends `{ t: "cleared"; room; ms; loot; lootTotal; board; credits: creditsOf(world) }` per human seat,
  then pushes into `running.heist`, and on the last room sends `{ t: "heist"; ms; loot; lootTotal; rank }` per human.
- `src/net/protocol.ts`: the `cleared` and `heist` server messages (see overview §4 for the additions); `credits: { seat; lines }[]`.
- `src/lib/gameLog.ts`: `GameEvent` union; `gameLinesFor(events: readonly WorldEvent[]): EventLine[]`; `describeGame`, `redact` allowlist
  in `src/lib/log.ts` (`kind` is allowed, nothing else is added).
- `src/game/sim/credits.ts` (Task 28): `creditsOf(world): Credit[]`, `SOLVED` templates per station type, folding repeats.
- `src/net/game.ts`: `Game` holds `world`, `crew`, `roomIndex`; `startGame`/next-room create a fresh `Running.heist`.
- `spec/heist.test.ts` / `spec/heistPlay.ts`: `ClearedMsg` type (has `credits: { seat; lines: string[] }[]`), `clearRoomOne`.

### Interfaces from earlier phases (exact)

From 14-01: `World.cacheUncovered: string[]`, `World.cacheBy: Record<string, Seat>`, `WorldEvent { kind: "cache"; id: string; result:
"uncover" | "solved"; seat: Seat; at: Vec }`, `cacheOf(o: RoomObject): CacheSpec | null` and `CacheSpec { owner: 1 | 2 | 3; motif: Motif;
riddle: string; item: ItemId; tiles: { at: Vec; motif: Motif }[] }` and `ITEMS`/`ItemId` in `src/game/rooms/format.ts`; `RoleView.cache`.

## 4. Approach

`creditsOf` stops listing a cache as a "cracked the safe": a cache solve is a credit line "found {owner}'s side job: the gold watch" for
the solver (and "found your side job" is the page's job for the owner's own card, via the `{seat}` token: the server writes
`side job found: the gold watch` for the owner when the owner solved it and `found {owner}'s side job: the gold watch` otherwise). The
item's display name comes from a fixed table in `src/game/sim/credits.ts` (`ITEM_NAME: Record<ItemId, string>`), never from the room file.
The room's cache result is built from `world` at the clear: `{ room, found, item, owner, by, riddle }`. The heist record gains
`caches: { room; found; item }[]`, pushed at each clear whose room has a cache. A cache solve and an uncover each log one `cache` line.

## 5. Task breakdown

### Task 54: Credits, the cache result, the heist record, the log line

- **Description:** per this file's §4.
- **Files touched:** `src/game/sim/credits.ts` (`ITEM_NAME`, a cache line; a cache is skipped by the station-type fold), `src/net/attach.ts`
  (the `cleared` cache field, `running.heist.caches`, the `heist` `caches` field), `src/net/protocol.ts` (the two message shapes),
  `src/lib/gameLog.ts` (`"cache"` event, `gameLinesFor` for `cache` events, kind `uncover`/`solved`; remove the `sidejob` event and its test),
  `spec/heistPlay.ts` (`ClearedMsg.cache?`), tests: `src/game/sim/credits.test.ts`, `src/lib/gameLog.test.ts`, `src/net/protocol.test.ts`,
  `spec/heist.test.ts`, `spec/game-log.test.ts` if it lists events.
- **Tests first (red):** (a) a solved cache gives the solver "found {1}'s side job: the gold watch" and the owner (solver = owner) "side job
  found: the gold watch"; a room with no cache adds nothing; two safes still fold to "cracked 2 safes". (b) `gameLinesFor` turns
  `cache` events into `{ event: "cache", detail: { kind } }` and the redacted line never contains an item, a motif, `Q`, or a seat number.
  (c) The `cleared` message for a room with a cache carries `cache` with `found`, `item`, `owner`, `riddle` and `by`; for rooms 1 to 3 it has
  no `cache`. (d) A heist through all rooms sends `heist` with `caches` in room order, `found` per room. (e) `spec/heist.test.ts` (room 1 is
  not a cache room) sees `cache` absent and `heist` untouched until a cache room exists (Task 58 extends it).
- **Implementation (green):** as described. The `cache` log line follows CLAUDE.md Logging: through `logGame`, name in `GameEvent`, kind only.
- **Acceptance criteria:** tests green; each guarding test shown red by breaking the line (leak the item into the log detail; drop the `caches`
  push); `pnpm check` green on a fresh check server (overview).
- **Depends on:** 51, 52.

## 6. Phase Definition of Done

- [ ] Task 54 done and committed.
- [ ] `pnpm test:unit` and `pnpm check` pass on a fresh check server.
- [ ] `cleared` and `heist` carry the new fields; no log line carries an item, motif, riddle or seat.
- [ ] Tick this phase in the 14 overview §5 and commit.

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR15, FR16 (data), FR18 | 54 |

## 8. Risks / open questions

None open.
