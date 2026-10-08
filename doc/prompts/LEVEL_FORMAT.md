# LEVEL_FORMAT.md (draft v0)

A room is one text file: a metadata block, a blank line, then the grid. Art is never stored here; the renderer draws from the tokens in `DESIGN.md`.

All numbers are guesses to be tuned. Order of work: a solver bot clears the room first, then three humans playtest it.

## Grid rules

- Rectangular. One character is one 32px tile. Row 0 is the top.
- An unknown character is a load error.
- Exactly one each of `b`, `d`, `m`. These are spawn points; the server assigns roles to spawns, so any player can be any role.
- At least one `E`.
- Every `T` must be linked to a door in the metadata.

## Legend

| char | meaning |
|---|---|
| `.` | air |
| `#` | solid |
| `b` `d` `m` | spawn points (blind, deaf, mute roles) |
| `B` | light crate |
| `H` | heavy crate |
| `T` | target: a heavy crate resting here opens its linked door |
| `D` | door (solid until opened) |
| `C` | camera mount (its watched zone is in the metadata) |
| `G` | guard start (patrol is in the metadata) |
| `h` | hide spot (blocks guard line of sight) |
| `K` | checkpoint (numbered left to right: K1, K2, ...) |
| `L` | loot (optional, adds score) |
| `E` | exit |

## Visibility

Every object lists `visible_to` and `audible_to` (role ids). The server only sends an object's state to roles that can perceive it. Default: `visible_to` everyone, `audible_to` nobody.

## Soft abilities (constants file, not per room)

- Push strength: blind 3, deaf 1, mute 1 (guesses).
- Push speed factor = `min(1, total strength pushing / crate weight)`.
- If total strength is under half the weight, the crate does not move.

## Room 1: Loading Dock (first sketch)

Beat 1 is a one-tile-high tunnel blocked by a light crate. Beat 2 has a heavy crate that must be pushed onto a target while a camera sweeps the floor. Beat 3 is a guard patrol with hide spots.

```
room: 01
name: Loading Dock
tile: 32
beats:
  - { id: 1, name: The Tunnel,   x: [0, 19] }
  - { id: 2, name: Camera Bay,   x: [20, 39] }
  - { id: 3, name: Guard Patrol, x: [40, 59] }
objects:
  crate.light: { weight: 1 }
  crate.heavy: { weight: 3 }
  camera.C1:   { tile: [31, 1], zone_x: [28, 33], period_s: 6, watching_s: 3, visible_to: [deaf, mute], audible_to: [] }
  target.T1:   { tile: [35, 9], accepts: crate.heavy, opens: door.D1 }
  door.D1:     { tiles: column x=40, rows 1-9 }
  guard.G1:    { start: [47, 9], patrol_x: [43, 55], speed_tps: 1.5, sight_tiles: 6, visible_to: [deaf, mute], audible_to: [blind, mute] }
rules:
  alarm: any player or crate inside camera.C1.zone while it is watching, or any player in guard.G1 sight and not on a hide spot; the team returns to the last checkpoint
  win: all three players on E
  loot: L is optional, 100 points

############################################################
#.......############...........C........D..................#
#.......############....................D..................#
#.......############....................D..................#
#.......############....................D..................#
#.......############....................D..................#
#.......############....................D..................#
#.......############....................D..................#
#.......############....................D..................#
#.bdm.......B.........K......H.....T....D.K...hG....h...LE.#
############################################################
############################################################
```

Intent per role in this room:

- Beat 1: anyone can push the light crate; the team learns the controls and the channels.
- Beat 2: the camera cone is visible to deaf and mute only, so they call the timing. The heavy crate is easiest for the blind player to push inside the safe window.
- Beat 3: the blind player hears the footsteps (distance); the deaf player sees which way the guard faces. Neither has the whole picture.

## Open questions

- Should a room have a time limit, or only a score for speed?
- Does the guard also react to crates, or only players?
- Maximum team spread for the shared camera.
