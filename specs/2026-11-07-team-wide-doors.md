# A door opening is heard and seen by the whole team

- **Date:** 2026-11-07
- **Status:** Approved
- **Approved by user:** yes — 2026-11-07
- **Tier:** Architecture. It amends ADR 0012 for ordinary doors; ADR 0025 (proposed) records the
  decision.

## 1. Problem / intent

Every door in the game opens because the team did something: plates pressed, stations solved, a
sequence played. Today, though, a door opening is local. The click carries 8 tiles, and a sighted seat
that cannot see the door is sent it as closed whatever its true state. A teammate in another part of
the room does not learn that their part worked. The user raised this in the phase 03 review (backlog
2026-11-07): a door opening should be team-wide like loot or the alarm. Every role should hear it from
anywhere, and the sighted should see it open and stay open, in sight or not, as a signal that a
station or group was solved.

## 2. Requirements

### 2.1 Functional requirements

- **FR1 Which doors.** Plate, station and sequence doors (any `D` that is not a cache's secret or
  vault door). A cache's doors are unchanged: wall until open, no `door` event, and their own `uncover`
  and `stash` cues.
- **FR2 The unlock.** When an ordinary door opens:
  - every hearing seat (Can't see, Can't speak), anywhere in the room, hears the `door` sound at full
    volume (gain 1), panned and pointed toward the door as `loot` is
  - walls, glass and distance do not stop it
  - the alarm still silences it, as it silences every cue (the existing exception)
- **FR3 The sound itself.** The `door` sound becomes an "unlock": a bolt sliding, then a low thunk,
  synthesised in `src/client/audio.ts`. No sound file is added. It moves out of the "object clicks"
  family into "team progress", and its caption becomes "A door unlocked", with its direction.
- **FR4 True state everywhere.** Every sighted seat (Can't hear, Can't speak) is sent every ordinary
  door with its true state, in sight or not. The branch in `perception.ts` that sends an unseen door as
  `closed` is removed. Nothing behind a door is sent outside line of sight.
- **FR5 The picture.** In the tick a door opens, every sighted seat gets the opening:
  - the door's open animation and the `ring` at the door, wherever it is (`detectFx` no longer requires
    the door's tile to have been in sight)
  - for a door outside the screen, a door pill at the screen edge, where the ray from the middle of the
    screen to the door leaves it: the existing edge pill, with the `door` stamp glyph and a `DirArrow`
  - the pill stays 4 s, then fades, like a mark's pill
- **FR6 Stays open.** A door is drawn open from then on, for every sighted seat, wherever they stand.
  Doors already latch (`step.ts`, `updateDoors`), including through a send-back.
- **FR7 Several at once.** Doors opening in the same tick each give their own unlock (panned their own
  way) and their own pill.
- **FR8 Parity.** The `door` row in `src/game/parity.test.ts` is rewritten. The listener stands far
  from the door, behind a wall, out of its old 8-tile reach, and hears it. Can't hear stands out of
  sight of the door and sees its state change from closed to open in the same tick. CLAUDE.md's list
  of team-wide events gains "door".
- **FR9 Bots.** Bots read doors only from their view and inbox, as now (ADR 0018). Each room's all-bot
  clear still passes.

### 2.2 Non-functional requirements

- No new socket message. The view's door entities already exist; only their filtering changes.
- The edge pill's layout spec measures the door pill against its neighbours at the screen edge (the
  face and mark pills, and the caption strip) at desktop and phone width, for every role.
- `prefers-reduced-motion`: the door's open animation follows the existing door rule, and the pill
  fades without sliding.
- DESIGN.md is updated in the same commit: the edge pill's door variant, the unlock's family and its
  caption.

### 2.3 Out of scope

- A cache's secret and vault doors.
- Doors that close again (none do).
- Menu and button sounds (backlog item D).
- Spectators: they already see the whole room, and their sound follows the hearing rule above.

### 2.4 Assumptions (confirmed)

- Doors never close again, including on a send-back. Confirmed in `src/game/sim/step.ts`
  `updateDoors` ("latched").
- Every ordinary door means something was solved or pressed. Confirmed from the rooms' `opensWhen`
  (plates, stations, sequences only).
- An out-of-sight door being drawn open is wanted. Confirmed by the user ("that's the point").
- A new synthesised sound, not a bundled file. Confirmed by the user's choice of "new team sound".

## 3. Existing context

- `src/game/sim/step.ts` `updateDoors`: pushes `{ kind: "door", id, open, at }` once, when a door
  opens. Doors latch.
- `src/game/perception.ts`:
  - `entitiesFor` builds door entities, and skips a closed secret door
  - the sight filter (around line 983) sends an unseen non-secret door as `state: "closed"`
  - sounds (around line 632) build the door cue with `cue(world, "door", ...)`, which applies the
    8-tile reach and the wall and glass stops
- `src/game/cues.ts`, `src/game/channels.ts`: the `door` cue and channel entries.
- `src/client/fx.ts` `detectFx`: a door closed→open gives a `ring`, but only when its tile was in
  `seenBefore`.
- `src/client/audio.ts`: the `door` sound is `click(c, s)`, in the "object clicks" family.
- DESIGN.md "Edge pills": a face or mark from someone out of sight is a glass pill at the screen edge
  (`DirArrow`). `src/client/wheel.ts` already has a `door` stamp glyph.
- `src/game/parity.test.ts`: the `door` row stands the listener within reach today.

## 4. Design

**Server.**
- In `perception.ts`, the door sound skips the reach and wall test: it becomes a team cue built like
  `loot` (gain 1, pan, direction). The sight filter sends ordinary doors untouched.
- The rest of the filter is unchanged, so nothing else is sent outside line of sight.

**Client.**
- `detectFx` drops the `seenBefore` condition for doors.
- A door that opens off screen adds a door pill to the edge-pill layer.
- `audio.ts` gets an `unlock` voice for `door` (filtered noise for the bolt, then a low sine thunk),
  and the caption copy changes.

**Alternatives** (full reasons in ADR 0025):
- the same click with no reach limit
- a click near and a chime far
- the picture only at the moment of opening
- station and sequence doors only

### 4.1 UI design

Design pass skipped: the pill is a variant of the existing edge pill (glass, `DirArrow`, the stamp's
`door` glyph), and the ring and door animation already exist. The only new visual is the door glyph
inside the pill, which must be checked by a screenshot at 1280 and 375 for each sighted role.

## 5. Probes raised and resolved

| # | Type | What was raised | Resolution |
| --- | --- | --- | --- |
| 1 | contradiction | ADR 0012 says sound stops at walls and the state is local. | ADR 0025 amends it for ordinary doors. |
| 2 | ambiguity | Same click louder, or a new sound? | A new synthesised unlock (user). |
| 3 | gap | What does Can't hear get for a door off screen? | The animation and an edge pill (user). |
| 4 | ambiguity | Which doors? | Every ordinary door, with cache doors excluded (user). |
| 5 | gap | The true state leaks that a far door is open. | Wanted (user). What is behind it stays hidden. |
| 6 | gap | Do doors ever close again, e.g. on a send-back? | No: they latch (`updateDoors`). |
| 7 | gap | Several doors opening in one tick (room 7). | One unlock and one pill each (FR7). |
| 8 | gap | Does the alarm silence it? | Yes: it is the existing exception, and the sighted still see the door. |
| 9 | contradiction | CLAUDE.md's team-wide list leaves out doors. | Add "door" in the same commit (FR8). |

## 6. Handoff notes for planning

- Do not re-litigate: every ordinary door is team-wide in sound and state; cache doors are unchanged;
  it is a new synthesised sound, not a file.
- Order: rewrite the parity row first and show it red, then the perception changes, then `detectFx`
  and the pill (with its layout spec), then the audio voice and caption, then DESIGN.md and CLAUDE.md.
- `spec/` promises: a layout spec for the door pill (in the edge pills' area file), and a parity row.
  Each is shown failing first.
- The plan reads `src/game/bots/` for any logic that relied on an unseen door reading closed. If none
  relies on it, say so in the plan.
- Three-tab playtest of room 4 and room 7 (the chain) before reporting done.
- After it lands: move the 2026-11-07 backlog line to Decided, pointing here, and add "door" to
  CLAUDE.md's team-wide events.
