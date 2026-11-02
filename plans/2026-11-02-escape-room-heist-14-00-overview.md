# Escape-room heist: Phase 14, side jobs as hidden caches

- **Date:** 2026-11-02
- **Status:** Approved
- **Tier:** Architecture, split into four session files (sim and view, server and results, client, rooms and wrap-up)
- **Requirements confirmed by user:** yes, 2026-11-02 (spec `specs/2026-11-02-escape-room-caches.md`
  approved in the brainstorm, UI proposal approved after a full `frontend-design` pass; ADR 0020 proposed;
  user ruled: caches are a new phase 14, phase 11 is narrowed)
- **Part of:** `plans/2026-10-28-escape-room-heist-00-overview.md` (add a §5 row for phase 14, unticked).
  Depends on phases 11 (narrowed: Tasks 28 to 30 done, committed), 12 and 13. Tasks 51 to 60.
- **Commits:** one per task once `pnpm check` is green, ending with
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never push or deploy without the user's go-ahead.
- **Review mode:** a task with a `Human review:` line is not committed until the user accepts it, on a local build
  at 1280 and 375 (phase 11's rule).
- **Check server:** a stale server on the port silently runs an old build against new tests (it cost a bogus red
  run in phase 11). Always: `pnpm build`, `pkill -f "node server.ts"`, `PORT=8181 pnpm start:check`, confirm
  its log has no `EADDRINUSE`/`throw er`, then `APP_URL=http://localhost:8181 pnpm check`. Another process
  (an `astro dev` on :8080) may hold the default port: do not kill it.

## 1. What you'll see

- Each of rooms 4 to 9 has one optional side job for one player (the owner rotates). Their reveal card and HUD chip give a
  riddle: a motif (moon, star, wave, key, eye, leaf) and a sentence. Nobody else's screen shows it.
- The room holds a few motif tiles. Pressing the right one uncovers a hidden station (a safe, keypad, wires and so on, a type
  the heist already taught). Everyone gets a "something opened" moment in their own senses.
- The team works that station together: the clue is something only some role perceives. A wrong answer re-draws only it.
- Solving it opens a stash with one drawn item (gold watch, ledger, signet ring, silver goblet, fountain pen, pearl necklace)
  worth 1 loot, with a chime, a caption and a spark. The owner's chip becomes the item with "Found by Bo".
- The cleared card gets a side-job tile (the item and "found by", or the unsolved riddle, dashed). The heist-complete card gets a
  shelf of the six items found or missed.

## 2. Demo script

1. Reveal, room 4, as seat 1 → a "Your side job" row: moon motif, riddle, "Only you can read this". Seats 2 and 3 have no row.
2. Walk the room → no stash, label or sound for it; two motif tiles (a moon and a star) are drawn.
3. Press Act on the star tile → nothing opens. Press the moon tile → every seat gets the uncover moment (sighted: a panel slides
   aside; hearing: the uncover cue; Can't see: that cue and the caption; Can't hear: the picture and caption).
4. Work the revealed dial wrongly → only the cache's number changes; no dye, no send-back.
5. Work it rightly → the stash opens: item rises on its plate, spark, goal ring, chime, caption "Ana's side job found: the gold watch",
   loot +1. The owner's chip becomes the watch, a tick and "Found by Bo".
6. Be caught after step 5 (checkpoint before it) → the cache closes and the loot is taken back.
7. Clear the room → the cleared card has a side-job tile: the watch, "Ana's side job, found by Bo. Worth 1 loot." (solid outline).
8. Replay and skip it → the tile is dashed and reads "Side job not found: <riddle>". Rooms 1 to 3 have no tile.
9. Finish room 9 → heist complete shows six plates in room order, found with names, missed dashed with "Room 7, not found".
10. Reduced motion, high contrast, 375 phone → no slide, a static star, a cross-fade; chip and tiles wrap, never clip.
11. Two bots in the crew → a person can still work a cache from any seat; the room clears whether or not it is solved.

## 3. Requirements and out of scope

Requirements are the spec's FR1 to FR18 (cited "cache FRn"), plus its §2.2. Out of scope, as the spec's §2.3: a bot relay skill,
caches that give anything but loot, side jobs in rooms 1 to 3, more than one cache a room, a stuck-for-N-minutes hint, ambience.

## 4. Shared design

**Cache metadata** (a `Q` station's `params`; parsed in `src/game/rooms/format.ts` as a typed accessor, no new tile letter, no new
`RoomObject` kind, so `pacing.test.ts` is untouched):

```json
"Q9": {"type": "dial", "pads": [[..],[..]], "back": [..], "digits": 2, "range": 10,
       "cache": {"owner": 1, "motif": "moon", "riddle": "Where the moon watches, listen twice.",
                 "item": "watch", "tiles": [{"at": [20, 3], "motif": "moon"}, {"at": [22, 3], "motif": "star"}]}}
```

`owner` is a spawn seat 1 to 3; `item` is one of `ITEMS`; exactly one tile matches `motif`; decoy tiles carry other motifs.

**Types** (created by the tasks named):

```ts
// src/game/rooms/format.ts (Task 51)
export const ITEMS = ["watch", "ledger", "ring", "goblet", "pen", "necklace"] as const;
export type ItemId = (typeof ITEMS)[number];
export interface CacheSpec {
  owner: 1 | 2 | 3; motif: Motif; riddle: string; item: ItemId;
  tiles: { at: Vec; motif: Motif }[];
}
export function cacheOf(o: RoomObject): CacheSpec | null;   // null for an ordinary station

// src/game/sim/world.ts (Task 51)
World.cacheUncovered: string[];            // cache station ids whose motif tile was pressed
World.cacheBy: Record<string, Seat>;       // cache station id -> seat whose Act solved it (a solved cache is in here)
Snapshot.cacheUncovered: string[];         // a send-back restores both, and un-solves a cache solved after the checkpoint
Snapshot.cacheBy: Record<string, Seat>;
WorldEvent += { kind: "cache"; id: string; result: "uncover" | "solved"; seat: Seat; at: Vec }
EntityView.station.stash?: ItemId;         // a found cache's item, for the sighted
SoundCue += { item?: ItemId; motif?: Motif }  // on "uncover"/"stash": `n` is the owner seat; named by the page

// src/game/perception.ts (Task 52)
RoleView.cache?: { id: string; motif: Motif; riddle: string; item: ItemId;
                   state: "hidden" | "open" | "found"; by?: Seat }   // own seat's cache only; replaces `sideJob`
EntityView.kind += "motiftile";            // `motif` field; drawn for the sighted whether or not the cache is open
SoundCue.kind += "uncover" | "stash";      // team-wide, global (no range), like "solved"

// src/net/protocol.ts (Task 54)
{ t: "cleared"; ...; cache?: { room: string; found: boolean; item: ItemId; owner: Seat; by?: Seat; riddle: string } }
{ t: "heist"; ...; caches: { room: string; found: boolean; item: ItemId }[] }
```

**Reveal:** `{ t: "reveal"; ...; cache?: { motif: Motif; riddle: string; item: ItemId } }` (own seat only; Task 52).
**Log:** `GameEvent += "cache"`, detail `kind` is `uncover` or `solved` only (Task 54).
**Rule changes:** a cache station is excluded from FR2's "two open at once" count and from any door's `opensWhen`
(Task 53); a wrong answer on a cache calls `redrawOne` (Task 51); bots never get a job for one.

## 5. Phase map

Each session loads this overview plus one file. Ordered by real dependency.

- [x] `2026-11-02-escape-room-heist-14-01-sim-view.md`: Tasks 51 to 53 (cache in the sim, own-only view and team sounds, linters).
  Ends green with a test room where a cache is uncovered, solved and undone by a send-back.
- [ ] `2026-11-02-escape-room-heist-14-02-server.md`: Task 54 (credits, heist record, wire formats, log). Depends on 51, 52.
- [ ] `2026-11-02-escape-room-heist-14-03-client.md`: Tasks 55 to 57 (items and plate, chip and moments, cleared tile and shelf).
  Depends on 52, 54. Ends with screenshots and the user's reviews.
- [ ] `2026-11-02-escape-room-heist-14-04-rooms-wrap.md`: Tasks 58 to 60 (six caches in rooms 4 to 9, wrap-up). Depends on 53, 55 to 57.

Add a §5 row for phase 14 to `plans/2026-10-28-escape-room-heist-00-overview.md` when the first file is started.

## 6. Phase Definition of Done

- [ ] Tasks 51 to 60 done; `pnpm test:unit` and `pnpm check` green on a fresh check server (see above).
- [ ] Demo script 1 to 11 played on a local build, three tabs, 1280 and 375, by the user.
- [ ] CLAUDE.md invariants hold: `uncover` and `stash` have `parity.test.ts` rows, `RoleView.cache` is gated in `viewFor` and the
  hidden station is in no view, log lines carry kinds only, DESIGN.md matches the visual changes.
- [ ] Every `Human review:` task accepted explicitly by the user. ADR 0020 accepted by the user.
- [ ] Master overview row ticked; phase 11's Task 28 note ("floor items replaced by phase 14") stays accurate.

## 7. Requirements coverage

| Requirement | Task |
| --- | --- |
| Cache FR1, FR2 (one a room, hidden, owner rotates) | 51, 58, 59 |
| FR3 (riddle owner-only) | 52 |
| FR4 (uncover by motif tile, decoys) | 51, 52 |
| FR5 (wrong re-draws only the cache) | 51 |
| FR6 (presence, tile and clue by different roles) | 53 |
| FR7 (item, +1 loot, undone by send-back) | 51 |
| FR8 (bots ignore caches, rooms still clear) | 53, 58, 59 |
| FR9, FR10, FR11 (team moment, stash, reduced motion, contrast) | 52 (events, sounds, captions), 56 (drawing) |
| FR12, FR13 (reveal row, chip) | 52 (data), 56 |
| FR14 (cleared tile) | 57 |
| FR15 (credit names the solver) | 54 |
| FR16 (heist shelf and its data) | 54, 57 |
| FR17 (items drawn from one path table) | 55 |
| FR18 (logging kinds only) | 54 |
| §2.2 perception, parity, linting, accessibility, layout | 52, 53, 55 to 57 |

## 8. Risks / open questions

None open. Accepted: a crew with a bot in the clue's role cannot finish a cache (one loot); the watch and necklace may need a
redraw after a real-size look (Task 55 reviews it); six caches is authoring work that the user plays through (Tasks 58, 59).

## 9. Corrections log

(execution appends one line per user redirect and mirrors it into `PROCESS_LOG.md`)
