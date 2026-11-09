# Escape-room heist: Phase 14 handoff (2026-11-03), for the next session

Written at the end of a long execute-plan session so a fresh one can pick up. Read this, then
`plans/2026-11-02-escape-room-heist-14-04-rooms-wrap.md` §9 to §11 (the corrections log and the review
findings), `specs/2026-11-03-escape-room-cache-reveals.md` and `doc/adr/0021-*.md`. Branch
`auto/escape-room`, tree clean at `f252845`. `pnpm check` was green on exactly that code (145 files,
2130 tests, 12 skipped).

## State of the code

Four commits sit on top of `a5aa62c`, none pushed, none separately checked (the code is interleaved
across files; only the last state was run):

| Commit | What |
| --- | --- |
| `26c418e` | Phase 14 code: the inspection plate, chambers in the view, the playtest fixes |
| `113e565` | Rooms 4 to 9: a cache and chamber in each, `spec/caches.test.ts`, the docs |
| `524fb43` | The reveal spec and ADR 0021 (both `proposed`) |
| `f252845` | Light: clip what stands to the light, cones and doors apart |

**Not ticked and not accepted by the user:** Tasks 66, 58, 59 and 60 each carry a Human review line.
The user has played them twice and sent findings; most are fixed (see the plan's §9). They have not
said "accepted". The plan's §5b status block and the phase Definition of Done are still unticked. ADR
0020 is `proposed` (its uncover half superseded by 0021); ADR 0021 is `proposed`.

`stash@{0}` ("WIP on auto/escape-room: 0e614b2 Room 7's ink...") is **not from this session**. Leave it
alone and ask the user.

## Work to do, in order

### 1. Light: things pop when you move a hair (the user wants this fixed)

The user's rule: **nothing may suddenly vanish when you move a hair.** Measured cause: the server
decides which stations to send by the symmetric shadowcast tile set (`visibleFrom`,
`src/game/sim/visibility.ts`), which is stricter than the exact light the client draws
(`lightPolygon`, `src/client/render/sight.ts`). At 1 to 61 positions per room (worst: room 9, 61 of
818; room 7, 15 of 998) the cone reaches a station the server has not sent, so it pops at tile
boundaries. The user answered **yes** to: the server sends a station whenever the exact light touches
any part of it, from one shared definition of the light.

- The client's `lightPolygon` lives in `src/client/`; `src/game/` may not import it
  (`src/layering.test.ts`). The shared routine must live in `src/game/` and the client import it.
- The two polygons disagree on 208 of 2,240 tiles in room 9 (probe: `visiblePolygon` in
  `src/game/cone.ts` with 360 degrees against `lightPolygon`). Most are wall tiles: the client runs to a
  wall's far face, the server's stops at the near face. Decide which is right for wall-hung parts
  (wires, vault sockets) before merging them.
- Test it as a sweep, not a sample: for each real room, walk a viewer over its floor in steps of 0.05
  to 0.25 tiles and require that every station part the exact light touches is in the view. The probe
  that found this is described in the commit message of `f252845`; rewrite it as a spec.
- Not allowed to leak: the client already draws the light, so sending what the light touches tells the
  player nothing new. Say so in the ADR or the plan.

### 2. Light: a veiled part of a station must be invisible, like the station

User, on image 38: one pad lit, the other veiled; **they expected the veiled one invisible too**, "the
safe itself is invisible, so it makes no sense that the dial to the right of it is still visible".
Cause found just now: in `src/client/render/index.ts`, `drawStationFloor` (pads, keys, buttons,
sockets) is called **after** the flat layer's `ctx.restore()`, so station floor parts are drawn with no
clip and veiled ones show through the mist. Fix: draw `drawStationFloor` inside the flat clip (reach 0,
the exact outline), and add a test in the style of the existing "cuts the floor layer by the exact
light outline" one. The user's rule applies to **every part of a station** (floor parts, standing
parts, name plate, wire). Also check `drawLink` and `drawStationPlates` against it.

### 3. The label chip over the riddle chip (the user has not answered)

The riddle chip is now always open and canvas label chips can be drawn under its corner (visible in a
room 8 screenshot). Ask: should labels avoid it, or may it overlap since a click hides it?

### 4. Verify in a browser what is only unit tested

The previous session could not put a player in front of a station in a real browser (two scripted
screenshots missed). Not seen rendered: the user's images 21 to 30 with the fix; how a half-lit object
looks cut at a corner; the final-room restart (only the pure function `afterRestart` is tested); the
tumbler's loudness (its gain and length are pinned by tests, whether it is audible is the user's ear);
the plate's new look in a real room.

### 5. Plan the reveal phase (new session, with `plan-feature`)

The spec and ADR 0021 are approved by the user. Plan it as a **new phase file**, not an edit of the old
ones. It overwrites: each room's `cache.tiles` and motif, `seeTile`, `drawMotifTile`, `uncover` in
`src/game/sim/stations.ts`, the motif glyph on the reveal row and chip, the rooms-cache fixtures, and
the tests that name the tiles (`spec/caches.test.ts`, `src/game/sim/cache.test.ts`, `sight.test.ts`,
`fx.test.ts`, the lint and format tests). Open items in the spec §6: a held item does not count for a
carry (confirm in a playtest); room 9's stethoscope was added for its own dial cache.

### 6. Close phase 14

After the user accepts Tasks 66, 58, 59, 60: tick them in the plan, tick the phase in the overview, add
the PROCESS_LOG entries (they need real commit SHAs, which now exist: `26c418e`, `113e565`, `f252845`),
and mark ADR 0020 and 0021 `accepted` only when the user says so. PROCESS_LOG is append-only.

## Findings from the last review round that are still open

- **Tumbler not heard**: fixed by raising its floor (gain at least 0.6 inside 1.5 tiles) and a longer
  sound. Unconfirmed by the user.
- **Room 8's tune box** is in a vent alcove at (30,8); sound still leaves through the vent, so someone
  beside it can hear it next to the second real box's tune.
- **Room 9's cache is a dial** (not the keypad or vault the plan's table lists), because every spot for
  a second vent there renumbered a clue or broke a presence rule. The plate at (6,14) is one tile from
  the vault door.
- **Room ids number in reading order**: a letter added above an existing one of its kind silently
  renumbers it, and `pnpm lint:rooms` stays green. A rule is in CLAUDE.md and `spec/caches.test.ts`
  pins which clue, card and ink each station reads for rooms 5, 6 and 7. A durable guard for all
  rooms is in `specs/backlog.md`.
- **Automating the playtest** is in `specs/backlog.md`: every bug the user found lived between two
  layers that each pass their own tests. The cheapest first step is a renderer assertion that nothing
  is drawn at a tile the view did not send.

## Things this session got wrong, so the next does not repeat them

- **Stale watcher output.** `pnpm check` logs were read from an earlier run three times, giving false
  "green" or "red". Always `rm -f /tmp/check.log` before a run and match on this run's own `Test Files`
  line. A watcher's exit is not the check's exit.
- **Overlapping commands kill the check.** Running `pnpm build` or the typecheck while the check runs
  killed its server (exit 143, a timeout in `load.test.ts` that was not real). Leave the tree alone
  while it runs.
- **A swept clip that costs 5x the canvas calls stalled the walking specs** (`escape-hud`, `labels`).
  Measure the calls per frame before and after any change to the draw loop.
- **Commits missed the `Co-Authored-By` trailer** three times; the project's attribution rule asks for
  it on every commit.
- **Edits that silently did not apply** because the formatter had reflowed the text: re-read before a
  scripted edit, and check the red-check actually changed the file (a "no tests" result is an error, not
  a pass).

## Commands

`pnpm build && pkill -f "node server.ts"; PORT=8181 pnpm start:check &` then
`rm -f /tmp/check.log; APP_URL=http://localhost:8181 pnpm check`. A one-room app for a screenshot: copy
one `rooms/NN-*.room` into a temp dir and run the server with `ROOMS_DIR` pointing at it.
