# Escape-room heist: Phase 14, side jobs as hidden caches (a secret chamber and a keepsake)

- **Date:** 2026-11-02 (amended 2026-11-02 after the user rejected Task 56's first build on human review; see §9)
- **Status:** Approved
- **Tier:** Architecture, split into five session files (sim and view, server and results, chamber sim and results, client, rooms and wrap-up)
- **Requirements confirmed by user:** yes, 2026-11-02 (spec `specs/2026-11-02-escape-room-caches.md`; the chamber amendment
  confirmed in the plan-feature restatement, 2026-11-02; ADR 0020 proposed and amended in place)
- **Part of:** `plans/2026-10-28-escape-room-heist-00-overview.md` (add a §5 row for phase 14, unticked).
  Depends on phases 11 (narrowed: Tasks 28 to 30 done, committed), 12 and 13. Tasks 51 to 65.
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
- The room hides a **side chamber** in its own grid, branching up or down off the room. Its door is a **secret door**: on every
  sighted map it is solid wall until it opens. The room holds a few motif tiles; pressing Act on the right one slides the secret
  door open with an animation, and everyone gets that moment in their own senses (Can't see hears the `uncover` thunk, which is not
  the ordinary door click).
- Anyone of any role may walk in. The chamber holds a station of a type the heist already taught (a safe, keypad, wires and so on).
  The team works it together: the clue is something only some role perceives. A wrong answer re-draws only it.
- Solving it slides a **second secret door** open inside the chamber, on a vault alcove. The `stash` chime plays and a caption reads
  "Ana's side job open: the gold watch". The item sits there as a real object in the world (the six drawings, standing on the floor).
- **Only the owner can take it.** Act on it puts it in the owner's own **keepsake slot** (separate from the gear slot) and only then
  does it count: loot +1, the loot chime, "Ana took the gold watch".
- The cleared card gets a side-job tile (taken; opened but left behind; or not found, dashed with the riddle). The heist-complete card
  gets a shelf of the six items taken or missed.

## 2. Demo script

1. Reveal, room 4, as seat 1 → a "Your side job" row: moon motif, riddle, "Only you can read this". Seats 2 and 3 have no row.
2. Walk the room → no chamber, label or sound for it; the wall where it hides looks like any wall; two motif tiles (a moon and a star)
   are drawn.
3. Press Act on the star tile → nothing opens. Press the moon tile → the secret door slides into the floor (sighted: the wall slides
   down; hearing: the `uncover` thunk, never the ordinary door click; Can't see: that cue and the caption "Something opened"; Can't hear:
   the picture and the caption). Anyone may now walk in, whatever their role.
4. Work the chamber's dial wrongly → only the chamber's number changes; no dye, no send-back.
5. Work it rightly → a second secret door slides open on the vault: the item stands there, `stash` chime, caption "Ana's side job open:
   the gold watch", a glint and goal ring. Loot is **still 0**. The owner's chip shows the item and that it waits in the vault.
6. As a non-owner press Act on the item → nothing is taken; the Act hint says only the owner can take it.
7. As the owner press Act on it → it leaves the vault into the keepsake slot, the loot chime plays, caption "Ana took the gold watch",
   loot +1. The chip shows it taken.
8. Be caught after step 7 (checkpoint before step 3) → both doors close, the item is back in the vault, the loot is taken back. Be
   caught after a checkpoint taken after step 7 → it stays taken.
9. Clear the room → the cleared card has a side-job tile: "Ana took the gold watch. Bo opened the way. Worth 1 loot." (solid outline).
10. Replay, open the chamber and solve it but leave the item → the tile is dashed: "Side job opened, but the gold watch was left
    behind." Replay and skip it → "Side job not found: <riddle>". Rooms 1 to 3 have no tile.
11. Finish room 9 → heist complete shows six plates in room order: taken ones with names, the rest dashed with "Room 7, not found".
12. Reduced motion, high contrast, 375 phone → the door does not slide (a 300 ms cross-fade), chip, tiles and slot wrap, never clip.
13. Two bots in the crew → a person can still work a cache from any seat; the room clears whether or not it is opened.

## 3. Requirements and out of scope

Requirements are the spec's FR1 to FR18 as amended 2026-11-02 (cited "cache FRn"), plus its §2.2. Out of scope: a bot relay skill,
caches that give anything but loot, side jobs in rooms 1 to 3, more than one cache (or chamber) a room, a stuck-for-N-minutes hint,
ambience, bots opening or using a chamber, dropping or handing on the keepsake once taken.

## 4. Shared design

**Cache metadata** (a `Q` station's `params`; parsed in `src/game/rooms/format.ts` as a typed accessor, no new tile letter, no new
`RoomObject` kind, so `pacing.test.ts` is untouched: a secret door is an ordinary `D` door). The station's own parts (pads, anchor,
keys, wires...) lie **inside the chamber**:

```json
"Q9": {"type": "dial", "pads": [[..],[..]], "back": [..], "digits": 2, "range": 10,
       "cache": {"owner": 1, "motif": "moon", "riddle": "Where the moon watches, listen twice.", "item": "watch",
                 "tiles": [{"at": [20, 3], "motif": "moon"}, {"at": [22, 3], "motif": "star"}],
                 "chamber": {"rect": [30, 8, 34, 10], "door": [32, 7],
                             "vault": {"rect": [33, 10, 34, 10], "door": [33, 9], "item": [34, 10]}}}}
```

`owner` is a spawn seat 1 to 3; `item` is one of `ITEMS`; exactly one tile matches `motif`; decoy tiles carry other motifs.
`chamber.rect` is `[x0, y0, x1, y1]`, an inclusive bounding box of the side room (floor, interior `#` walls, and the vault's `D`; the example needs `#` at (32,10) and (34,9) to seal the vault); `door` is a `D` tile of the grid on its edge, touching
the main room's floor on one side and the chamber's on the other (the secret door); `vault` is an alcove inside the chamber with its own
`D` tile (`door`) between it and the rest of the chamber, and `item` is the floor tile the keepsake stands on, inside `vault.rect`.
The chamber branches up or down: its rows lie outside the main room's rows. Authors append rows below the room by default, which
shifts no coordinate in the file.

**Types** (created by the tasks named):

```ts
// src/game/rooms/format.ts (Task 51 built the cache; Task 62 adds the chamber)
export const ITEMS = ["watch", "ledger", "ring", "goblet", "pen", "necklace"] as const;
export type ItemId = (typeof ITEMS)[number];
export type Rect = [x0: number, y0: number, x1: number, y1: number];   // inclusive tiles
export interface ChamberSpec { rect: Rect; door: Vec; vault: { rect: Rect; door: Vec; item: Vec } }
export interface CacheSpec {
  owner: 1 | 2 | 3; motif: Motif; riddle: string; item: ItemId;
  tiles: { at: Vec; motif: Motif }[];
  chamber: ChamberSpec;                                // Task 62
}
export function cacheOf(o: RoomObject): CacheSpec | null;   // null for an ordinary station
export function inRect(r: Rect, t: Vec): boolean;           // Task 62

// src/game/sim/world.ts (Tasks 51 and 63)
World.cacheUncovered: string[];            // cache ids whose motif tile was pressed: the chamber's secret door is open
World.cacheBy: Record<string, Seat>;       // cache id -> seat whose Act solved it: the vault's secret door is open
World.cacheTaken: Record<string, Seat>;    // cache id -> the seat that took the keepsake (always the owner); +1 loot   (Task 63)
Snapshot.cacheUncovered, Snapshot.cacheBy, Snapshot.cacheTaken;   // a send-back restores all three and re-shuts the doors
WorldEvent += { kind: "cache"; id: string; result: "uncover" | "solved" | "taken"; seat: Seat; at: Vec }
// "uncover": the chamber door opened. "solved": the vault door opened (no loot). "taken": the owner took the keepsake (+1 loot).

// src/game/perception.ts (Tasks 52 and 64)
RoleView.cache?: { id: string; motif: Motif; riddle: string; item: ItemId;
                   state: "hidden" | "open" | "vault" | "taken"; by?: Seat }   // own seat's cache only; `by` is who solved it
RoleView.keepsake?: ItemId;                // own slot: the item you took (every role knows what it carries)
RoleView.cacheEvent?: { result: "uncover" | "solved" | "taken"; at: Vec; owner: Seat; item?: ItemId }   // this tick only, every role (the team moment)
EntityView.kind += "motiftile" | "keepsake";   // motiftile: `motif`; keepsake: `keep` (the item standing in an open vault)
EntityView.keep?: ItemId;
RoleView.tiles for a sighted seat or a watcher: the chamber, the vault and both secret doors read "#" until each is open
SoundCue += { n?: seat; item?: ItemId }     // "uncover" n = owner (no item); "stash" n = owner, item; "loot" from a take: n = owner, item

// src/net/protocol.ts (Tasks 54 and 65)
{ t: "cleared"; ...; cache?: { room: string; found: boolean; opened: boolean; item: ItemId; owner: Seat; by?: Seat; riddle: string } }
{ t: "heist"; ...; caches: { room: string; found: boolean; item: ItemId }[] }
// `found` means taken. `opened` means the vault door opened (the station was solved). `by` is the solver.
```

**Reveal:** `{ t: "reveal"; ...; cache?: { motif: Motif; riddle: string; item: ItemId } }` (own seat only; Task 52).
**Log:** `GameEvent += "cache"`, detail `kind` is `uncover`, `solved` or `taken` only (Tasks 54, 65).
**Rule changes:** a cache station is excluded from FR2's "two open at once" count and from any door's `opensWhen` (Task 53); the two
secret doors are `D` doors named only by `cache.chamber`, opened by cache state and never by plates, and they emit no `door` event (so no
ordinary door click); a wrong answer on a cache calls `redrawOne` (Task 51); solving a cache gives **no loot** (Task 63 replaces Task 51's rule);
bots never get a job for one and no job may target a chamber tile (Task 62).

## 5. Phase map

Each session loads this overview plus one file. Ordered by real dependency (the amendment's file sorts between 02 and 03 on purpose).

- [x] `2026-11-02-escape-room-heist-14-01-sim-view.md`: Tasks 51 to 53 (cache in the sim, own-only view and team sounds, linters). Done
  as first built; **superseded in part** by 14-02b (the solve rule, the in-place hidden station).
- [x] `2026-11-02-escape-room-heist-14-02-server.md`: Task 54 (credits, heist record, wire formats, log). Done; **amended** by Task 65.
- [x] `2026-11-02-escape-room-heist-14-02b-chamber.md`: Tasks 61 to 65 (commit what survives, the chamber in the format and linters, the
  doors, keepsake and loot-at-pickup in the sim, the masked view, the amended server results). Depends on 51 to 54.
- [ ] `2026-11-02-escape-room-heist-14-03-client.md`: Tasks 55 (done), 56 (rewritten: the chamber on the map, the chip, the keepsake slot),
  57 (the cleared tile and the shelf, three states). Depends on 62 to 65. Ends with screenshots and the user's reviews.
- [ ] `2026-11-02-escape-room-heist-14-04-rooms-wrap.md`: Tasks 58 to 60 (six caches with chambers in rooms 4 to 9, wrap-up). Depends on 53,
  62 to 65, 55 to 57.

Add a §5 row for phase 14 to `plans/2026-10-28-escape-room-heist-00-overview.md` when the first file is started.

## 6. Phase Definition of Done

- [ ] Tasks 51 to 65 done; `pnpm test:unit` and `pnpm check` green on a fresh check server (see above).
- [ ] Demo script 1 to 13 played on a local build, three tabs, 1280 and 375, by the user.
- [ ] CLAUDE.md invariants hold: `uncover` and `stash` have `parity.test.ts` rows, `RoleView.cache` and `RoleView.keepsake` are gated in
  `viewFor`, the hidden chamber and both secret doors are in no sighted or watcher tile grid until open, log lines carry kinds only,
  DESIGN.md matches the visual changes.
- [ ] Every `Human review:` task accepted explicitly by the user. ADR 0020 accepted by the user.
- [ ] Master overview row ticked; phase 11's Task 28 note ("floor items replaced by phase 14") stays accurate.

## 7. Requirements coverage

| Requirement | Task |
| --- | --- |
| Cache FR1 (one a room, a hidden chamber, owner rotates) | 62, 63, 64, 58, 59 |
| FR2 (owner rotates) | 58, 59 |
| FR3 (riddle owner-only) | 52 |
| FR4 (the motif tile opens the secret door, decoys; anyone may enter) | 51, 52, 63 |
| FR5 (wrong re-draws only the cache) | 51 |
| FR6 (presence, tile and clue by different roles) | 53, 62 |
| FR7 (item stands in the vault; only the owner takes it; loot +1 at pickup; undone by send-back) | 63 |
| FR8 (bots ignore caches, rooms still clear) | 53, 62, 58, 59 |
| FR9, FR10, FR11 (door moments, vault, take, reduced motion, contrast) | 52, 64 (events, sounds, captions), 56 (drawing) |
| FR12, FR13 (reveal row, chip, keepsake slot) | 52, 64 (data), 56 |
| FR14 (cleared tile, three states) | 57 |
| FR15 (credit names the opener and the taker) | 65 |
| FR16 (heist shelf and its data: found means taken) | 65, 57 |
| FR17 (items drawn from one path table) | 55 |
| FR18 (logging kinds only) | 65 |
| §2.2 perception, parity, linting, accessibility, layout | 52, 53, 62 to 65, 55 to 57 |

## 8. Risks / open questions

None open. Accepted: a crew with a bot in the clue's role cannot finish a cache (one loot), and a bot as the owner can never take the
item (the same cost); the watch and necklace may need a redraw after the real-size look (Task 55 reviews them); six chambers is authoring
work that the user plays through (Tasks 58, 59). Watch in execution: bots' pathing must never route through a closed secret door (Task 62
adds a test); `floorNear` for a checkpoint must never pick a chamber tile (Task 63 test); the client predictor is built once from the first
map and must be rebuilt when the map is re-sent (Task 56 test).

## 9. Corrections log

- 2026-11-02, Task 56 human review REJECTED (approach, not wording). The first build treated a cache as a station state change: a
  steel panel slid off a station in place and the item was a picture on a plate beside it. The user: the panel "is hiding a whole safe";
  the picture "feels weird as a picture"; they want a side room off the room behind a secret door that animates, the item in it behind a
  second secret door as a real object the owner picks up like gear (a separate slot), and loot counted only on pickup. Anyone may enter;
  Can't see hears a door sound unlike the ordinary door; the room lives in the room's own grid; the item drawings and sounds stay. The
  agent stopped, logged it, and handed back here rather than patching the drawing. What survives of the first build is listed in
  14-02b Task 61. (The same entry is in `PROCESS_LOG.md` and in 14-03 §9.)
