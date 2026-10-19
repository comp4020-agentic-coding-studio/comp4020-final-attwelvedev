# Play overhaul: balanced roles, line of sight, a comms wheel and a Monument Valley world

- **Date:** 2026-10-19
- **Status:** Approved
- **Approved by user:** yes — 2026-10-19
- **Builds on:** `specs/2026-10-08-sensory-heist.md` (unchanged where this spec
  says nothing). Supersedes its channel table (§2.1 item 16), comms sheets,
  real-life wizard, role reveal, lobby wireframes and flat top-down look.
- **ADRs:** 0011–0016 (proposed with this spec).

## 1. Problem / intent

Two playtests (`playtests/2026-10-09-playtest-01.md`,
`playtests/2026-10-14-playtest-02.md`) found the concept fun and the setup flow
quick, but:

- **Roles are unbalanced.** Can't see is "deadweight" (it only ever receives
  instructions); Can't speak "does its own thing" in both playtests. The cause,
  checked in `src/game/perception.ts`: sight is global, so Can't speak perceives
  everything everywhere and needs no one, and Can't see perceives a strict
  subset of what Can't speak does, so it has nothing unique to give.
- **The dark area stranded Can't hear** with no input at all (playtest 1, room 3).
- **The sequence door was solved by one person.**
- **"Say / Sound / Show" confused everyone**, at the reveal and in game; the
  comm sheets were clunky and covered the map; players glossed over comms.
- **The reveal** didn't say what anything meant, who was ready, or who had left;
  the blind player didn't know the black screen was intended.
- **The real-life setup was glossed over** (a team-wide wizard before anyone has
  a role; also the backlog's per-seat headphones problem).
- **Players and faces felt small; captions like "ahead" were ambiguous.**
- Newcomers didn't know what game objects were.

Intent: overhaul the playing experience end to end — lobby, role reveal, game —
so every role leads at least once per room, communication is obvious and fast,
the real-life rules land at the moment they matter, and the game looks unique
(Monument Valley as the primary visual reference, Crossy Road and Pico Park
secondary).

Guiding direction (from the user, before this session): no role-specific map
interactions — balance comes from who can perceive and send what, plus map
design.

## 2. Requirements

### 2.1 Functional requirements

**Channel rules (ADR 0011)**

1. The channel table becomes, per method:

   | Role | Sends | Receives |
   |---|---|---|
   | Can't see | talk (callouts, text, voice), faces | talk, clips, game sound |
   | Can't hear | talk, clips, faces, marks | faces, marks |
   | Can't speak | clips, faces, marks | everything |

   Can't see loses the soundboard and marks (it never saw where they went).
   The server routes by method, the same rules for humans and bots. Cooldowns
   unchanged (clips 3 s, faces 1.5 s, marks 1 s).
2. The words "Say", "Sound", "Show" and "channel" never appear in the UI. Every
   comm option names its method with a verb and its receivers by name and role
   shape ("Ana ● hears this · Bo ■ can't").
3. Marks (the old stamps: four arrows, X, ?, !, door, key) are placed on a tile
   the sender taps or clicks, which must be in the sender's line of sight; the
   server rejects a mark outside it.
4. Captions show only what the viewer receives. Can't hear receives no sound,
   so it has no sound captions even with "Always show captions" on.

**Line of sight (ADR 0012)**

5. A sighted role (Can't hear, Can't speak) receives entities only within its
   line of sight: hazards, puzzle state (plates, doors, sign, crates, loot) and
   teammates. Outside it, the client draws the room layout (walls, floor) only.
   There is no range limit; sight stops at solid walls and closed doors.
6. New tiles: **glass** (blocks movement and sound, passes sight) and **vent**
   (blocks movement and sight, passes sound). Sound cues are blocked by solid
   walls and glass, pass through vents and open doors, and fall off with
   distance as today.
7. Dark zones: a sighted role sees nothing inside them (as today), except faces
   and marks, which stay visible in the dark.
8. A face or mark from a sender outside the receiver's sight shows as an edge
   pill (sender's shape, name and the face or mark glyph) pointing toward the
   sender or the mark; a mark in an unseen place is also drawn faintly through
   the haze.
9. Team-wide events (loot, checkpoint, caught, alarm, room cleared) still reach
   every role in the same tick. Local events (doors, plates, crates, hazards)
   reach only the roles that can perceive them from where they stand. This
   amends the CLAUDE.md sensory-parity invariant; `parity.test.ts` is rewritten
   to test both halves under the new rule.
10. Spectators see the whole room by default (no line of sight, no dark), with a
    toggle to follow one player's view and audio.

**Puzzle and room rules**

11. **Held sequence:** a sequence door's plates must each stay held from when
    they are pressed until the last is pressed, so it needs three bodies. The
    linter rejects any door one person could open alone.
12. The heist becomes **4 rooms**: room 1 a tutorial, then one room for each
    role's lead beat:
    - **dark** → Can't see leads (hears what no one sees; Can't speak hears but
      can't talk);
    - **alarm** → Can't hear leads (unaffected, and the richest sender);
    - **twin cue** (a sight and a sound at the same spot, e.g. the door that
      hums) → Can't speak leads (the only role perceiving both, translating
      via clips and marks).
    Each of rooms 2–4 also contains at least one **split cue** (a sight and a
    sound placed apart, e.g. a dial turned in one place, its click heard
    through a vent at another) that forces a hand-off between roles. Each room
    has its own wall hue (no lilac: too close to Can't speak's purple).
13. The room linter additionally rejects:
    - any combination of flips that leaves a role with no input (playtest 1);
    - a held-sequence door one person could open;
    - a room whose lead beats are not declared in metadata.
14. **Every role is needed:** `spec/rooms.test.ts` keeps "three bots clear every
    room in every rotation" and adds, per lead beat, that bots with the lead
    role's sending switched off fail that beat.
15. Room 1 shows small in-world labels the first time each object type enters
    the player's sight (crate, plate, door, loot, camera, laser, guard, exit,
    glass, vent, dark). A `Labels` toggle in the HUD; on by default in room 1.

**Lobby (ADR 0013)**

16. A lobby holds up to 6 players plus any number of spectators. Each room,
    three play and the rest sit out (and spectate). Rotation is fair by default:
    it spreads play and roles as evenly as possible; the lobby's rotation table
    shows who plays which room and "plays N" per person.
17. The host can make the lobby **private**: hidden from Open lobbies; anyone
    with the code or link can still join.
18. Any player can edit their nickname in the lobby; duplicate nicknames get a
    number appended.
19. The host sets the starting order (drag to reorder), which seeds rotation.
20. Each player answers **Your setup** for themselves: headphones yes/no; in the
    room / remote; always show captions; gear (earplugs or earmuffs; sleep mask
    or blindfold). Rows show a short summary and "Set up" once answered. This
    does not gate Start. The team-wide real-life wizard is removed.
21. Effective settings (masking noise, sound vs captions, in-app voice between
    in-room players) are recomputed every room from who holds which role and
    their own setup (backlog item 2026-10-09).
22. Navigating away from the lobby warns ("Leave the lobby? You'll lose your
    spot.") and, if confirmed, leaves it. Closing the tab uses the browser's
    native prompt.

**Role reveal**

23. Before each room, the reveal shows over a blurred, faded, flat view of the
    room:
    - your role, what you can send and receive, by method and by name;
    - a real-life line from your role and your own setup, e.g. "Earplugs in
      now", "No earplugs? Headphones on with the noise playing", "Mask on; find
      WASD and Space first", "Don't mouth words or point at screens", and a
      seating hint (Can't hear shouldn't see the speakers' faces);
    - for Can't see: "Your screen goes dark. That's on purpose." and a sound
      briefing that plays each key cue for this room;
    - the crew with each person's ready state, "Left the game" when someone
      leaves, who sits out, and pips of roles each person has already played.
24. The host can swap any two people's roles, or swap a playing person with a
    sitting-out one; any swap resets everyone's ready.
25. When every active human is ready, the overlay fades, the blur clears and the
    room rises into the 3/4 world (walls extrude up); for Can't see it then
    fades to black. Under reduced motion: a 300 ms cross-fade.

**In game**

26. **Comms wheel** (a marking menu): hold Q (centred on screen) or right mouse
    (centred on the cursor) on desktop; hold the wheel button above-left of Act
    on phone (drawn just above it). A quick flick-and-release in a direction
    sends without the wheel being drawn; holding still ~200 ms draws it. It
    always opens in the same place. Pages: Talk (the 9 callouts at compass
    positions, Stop centre), Faces, Clips, Marks; switch by 1–4, scroll, or
    dwelling on a tab. Unsendable options are hatched with who can send them.
    Cooldowns show as a number. Release beyond the rim (desktop) or on the
    button (phone) cancels.
27. Talking needs no wheel: **Enter** opens text; **V** is push-to-talk, or
    press-to-toggle if the player chooses (backlog item 2026-10-10), with a
    visible "mic live" state. The phone mic button does the same.
28. Desktop number keys still send callouts and faces directly (also the
    fallback for a masked Can't see player). Phone has one quick-send slot next
    to Act; long-press any wheel item to pin it there (default per role).
29. The HUD shows teammates with role shape and name, spectators ("2 watching",
    expandable), timer, loot and a pulsing Live light (Weak / Offline states
    kept).
30. Sound captions use 8-way drawn arrows pinned at the screen edge in the
    sound's direction, and in the caption log; never words like "ahead".
31. Figures show movement: they face their heading, hop while moving, squash
    when blocked, lean into a crate. Can't see's own screen shows their dimmed
    figure doing the same from their own moving/blocked state only (nothing
    about the world). Reduced motion keeps facing and drops the rest.
32. **Votes:** any active human can propose "Restart room" or "Restart heist"
    (back to room 1, rotation reset). Every active human must accept within
    15 s; bots accept automatically; one decline or the timeout ends it, with a
    one-line outcome. Movement continues during a vote. Spectators and
    sitting-out players don't vote. "Back to lobby" stays host-only.
33. **Leaving:** navigating away mid-game warns ("Leave the heist? Your crew
    carries on with a bot or a teammate in your place."). A confirmed leave
    skips the 45 s wait: the game pauses and the host chooses at once — a bot
    takes the seat, a sitting-out player is pulled in (taking the leaver's
    role), or back to lobby. A dropped connection keeps the 45 s wait.
34. **Spectators** have a panel with spectator-only text chat and push-to-talk
    voice that never reach players (ADR 0015); follow a player or the whole
    room. Spectator chat text is never logged.

**Results and records (ADR 0014)**

35. Room end shows time, loot and a **comms map**: the three players as a
    triangle with message counts each way (arrow thickness by count), a
    per-edge breakdown by method on hover or focus, and a one-line summary.
36. Heist records carry a heist version. The leaderboard shows the current
    version; the v1 board stays reachable by a link. Full-heist records name
    everyone who played any room; per-room records name the three who played
    it. No data is deleted.

**Sound**

37. Light ambience per room and quiet music, under the game cues, last and
    cuttable. Any new game sound keeps the parity rule (sight + caption).

### 2.2 Non-functional requirements

- **Viewports:** phone portrait ~375px and desktop ~1280px, both designed. The
  wheel button (56px), mic (48px), quick slot (48px) and Act (72px) never
  overlap the joystick.
- **Accessibility:** never colour alone (role = colour + shape + hat; camera
  state = outline vs hatch; out of sight = mist + stipple). WCAG AA text: all
  text over the world sits on `--glass`. World figures and interactables have a
  2px plum outline (≥3:1 on every pastel). Flashing ≤3/s. Reduced motion:
  cross-fades, no bob/squash/shake/water drift. High-contrast swaps the world
  palette too.
- **Font:** Archivo is an ASCII subset; arrows, role shapes and gems are drawn
  (SVG/canvas), never typed.
- **Performance:** canvas 2D, no sprite sheets or new image assets; backdrop and
  static blocks cached offscreen. Line-of-sight raycasting per seat per tick
  must keep a 20 Hz tick for ~10 lobbies on the 256 MB machine; measure it.
- **Voice:** a spectator voice room adds relay load; measure alongside player
  voice.
- **Logging:** new events (vote proposed/passed/failed, role swap, leave,
  spectator chat sent — kind only) follow `gameLog` rules; never chat text,
  nicknames or choices.

### 2.3 Out of scope

- True isometric, and isometric with real heights (stairs, levels).
- Remembered fog (last-seen positions).
- A spoken wheel for Can't see.
- Swapping in mid-room at checkpoints (rotation is per room).
- A separate tutorial room 0 (room 1 teaches with labels).
- Host approval for joiners (private = hidden only).
- A minimap.
- Pivoting cameras and alternative masking noises (stay in the backlog).
- Role-specific map interactions or abilities.

### 2.4 Assumptions (confirmed)

| Assumption | How confirmed |
| --- | --- |
| 3+ weeks of build time remain | User |
| Only active humans vote | User, at approval |
| Duplicate nicknames get a number | User, at approval |
| Up to 6 players plus unlimited spectators per lobby | User, at approval |
| A pulled-in sitting-out player takes the leaver's role, not a new rotation | Resolved in the final sweep; stated at approval time as part of the leave flow |
| Captions only describe what the viewer receives | Proposed in the design review; user accepted the design |
| A mark drawn faintly through haze leaks only a teammate's message, not room state | Proposed in the design review; accepted |
| Can't see sees its own wheel and controls (the world is hidden, not the UI) | User agreed |

## 3. Existing context

- Channel rules: `CHANNEL_RULES` in `src/game/types.ts` and `route()` in
  `src/game/channels.ts` (family-based, cooldowns per family). Spec 2026-10-08
  item 22 claimed Can't see's Show reaches nobody; in fact Show already reached
  Can't hear. The new table removes Can't see's clips and marks.
- Perception: `src/game/perception.ts` (503 lines). Sight is global except dark
  zones (`darken`, `subtractRects`); sound is local via `cue()` with distance
  falloff; `soundsFor` adds own step/bump, plate hum, door/plate/crate events.
  Cones already respect walls (`blockedFor`), which seeds line of sight.
- Sequence door: `src/game/sim/step.ts` ~L122 counts in-order presses without
  requiring plates to stay held.
- Roles: `rolesFor(roomIndex)` in `src/net/game.ts` is a fixed seat rotation for
  3 seats; lobbies (`src/net/lobbies.ts`) have 3 seats plus spectators; host
  handover at L162; `LobbySettings` is team-wide (`inPerson`, `maskNoise`,
  `othersSoundOff`, `voice`), built by `RealLifeWizard.tsx` and
  `realLifePreset.ts`.
- Restart: `room.restart` is host-only (`src/net/protocol.ts`).
- Client: `render.ts` (712 lines, flat top-down, `fit`/`follow` camera),
  `Tray.tsx` + `SaySheet`/`SoundSheet`/`ShowSheet`/`SheetGrid`, `hud.ts`
  `cueCaptions` (left/right/ahead words), `RoleReveal.tsx` (shape morph),
  `Spectator.tsx`, `Captions.tsx`, `Connection.tsx`, tokens in
  `src/styles/tokens.css` mirrored in `src/client/tokens.ts`.
- Rooms: 3 rooms, 48–50×9 strips, `.room` format linted by
  `src/game/rooms/lint.ts`; bots in `src/game/bots/` (brain 839 lines) drive the
  solvability spec.
- Voice relay: ADR 0010, `src/net/voice.ts`.
- Records: ADR 0009, `src/lib/runs.ts`.
- Backlog items folded in: per-seat headphones; restart heist; tolerant bots;
  Can't speak's contribution; ambience and music; tap-to-toggle voice; the
  2×4-grid wording (obsolete). Left parked: masking-noise options, pivoting
  camera; the two pantry items are dead.

## 4. Design

**Balance model.** The previous design made sight global and sound local, so
the omniscient seeing-and-hearing role needed nobody. Making sight local too
(ADR 0012) gives each player exclusive knowledge of where they stand, and turns
"three bodies in three places" into an information problem. Room design then
gives each role a lead beat (dark, alarm, twin cue) and split cues force
hand-offs; the spec check that disabling a role's sending fails its lead beat
is the measurable promise behind "every role matters".

**Channels by method.** Routing moves from three families to methods (callout,
text, voice, clip, face, mark), each with its own sender and receiver set
(ADR 0011). The UI reads names off the same table (`ReceiverLine`), so the
words on screen can't drift from the rules.

**Lobby of people.** A lobby becomes an ordered list of up to 6 people with
per-person setup; each room picks three active players and their roles from a
fair rotation, overridable by the host at the reveal (ADR 0013). Effective
real-life settings are a pure function of (room's roles, each person's setup).

**Rendering.** The simulation and grid are unchanged in orientation; the client
draws a tilted 3/4 view (ADR 0016) with the Monument Valley recipe in §4.1.
`render.ts` splits into backdrop, blocks, figures, hazards, sight and labels.

**Alternatives seriously considered**

- Keeping global sight and balancing via channels and map design only: cheaper,
  but leaves Can't speak omniscient — the root cause of both playtests' finding.
- True isometric (Monument Valley literal): breaks the shared sense of "up"
  that callouts, controls and arrow captions depend on, and fits long rooms
  badly. Isometric with heights: rewrites sim, perception, bots and linter.
- Teammates visible out of sight (layout + teammates): user chose layout only.
- Remembered fog: richer but misleading, more client state.
- Split cues only (user's idea): would remove Can't speak's lead moment; kept
  alongside twin cues instead.
- A spoken wheel for Can't see: too much; number keys cover the masked case.
- A wheel that opens on the emptier side: breaks flick muscle memory; replaced
  by a fixed position plus a marking menu.
- Spectator text only: user chose chat and voice.
- Host-only restarts (today): replaced by unanimous votes.

### 4.1 UI design

From a frontend-design proposal (first pass), amended by the user: movement
cues on figures (including Can't see's own); the wheel fixed in place and a
marking menu rather than opening on the emptier side; Enter and V outside the
wheel; captions rule; per-room hues without lilac; "plays N" counts.

**Idea: daylight and night.** The world is a Monument Valley morning (pastel
islands over teal water). Everything that is not the world — HUD, wheel,
captions, lobby, reveal — is night-glass: the existing dark shell. Light = seen;
haze = known layout only; night = unseen (dark zones, the alarm's dusk palette,
Can't see's black screen). The shell stays dark because the role colours pass
as text only on dark (amber 8.3:1, blue 7.3:1, purple 5.1:1 on `--panel`, vs
1.6–2.7:1 on sand), and a black Can't-see screen beside a light shell would
read as a crash.

**One bold moment:** the world rises at the end of the reveal (§2.1 item 25).

**Tokens.** Shell tokens unchanged. New shell: `--glass` rgba(20,30,54,.88)
(every chip over the world; `--ui` on it ≥10:1), `--scrim` rgba(11,18,32,.62),
`--hatch` (45° stripes of `--ui-muted` 35%, 6px). New world tokens, mirrored in
`tokens.ts` and checked by `tokens.test.ts`:

| Surface | Top | Front | Extra |
|---|---|---|---|
| Sky | #FADCCB → | #CDEBDF | gradient |
| Water | #6CC3B8 | deep #3F9A98 | ripple #A9E2D6 |
| Floor | #F7E9D2 | #E6C7A0 | seams #EEDDC1 |
| Island cliff | | #E9B48C → #C98A86 | into water |
| Wall (room 2 hue; others vary, no lilac) | #F4B9C3 | #DC8FA6 | shade #B9708F |
| Crate | #F2B57A | #CF8A55 | braces #A86A3D |
| Door | #F6CF63 | #D9A93A | seam #A9822A |
| Plate | #A8E3C9 | pressed #7FCFAE (sunk 3px) | |
| Glass | rgba(214,242,248,.55) | rgba(156,207,219,.7) | 2 glints, "no sound" mark |
| Vent | #A3A8C4 | #8E93B0 | slats #6C7192, "sound passes" mark |
| Out of sight | layout veiled `--w-mist` #E4E8EC 60%, desaturated | | white stipple 30% |
| Dark zone | `--w-night` #1D2130 | | rim #3A4157 |
| Line (figures, interactables) | `--w-line` #2E2A4A | | |
| Laser | #E5304F | | floor shadow 25% |
| Camera/guard watching | hatch #E9A400 | | |
| Exit | flag #2FA678 on #BDEFD8 | | MV arch |

Alarm dusk set: sky #3A2E44 → #5A2236, water #2B3346, walls #4A5068/#353A4F,
floor #5C6178/#474C62; lasers, roles and Show items unchanged. High contrast:
black sky/water, floor #1A1A1A, walls #FFF/#BDBDBD, 3px white outlines, mist
replaced by 50% black + stipple.

**Type.** Archivo: expanded black for the lobby code, the reveal's role line
and room-end time; condensed 600 for HUD chips, wheel labels and receiver
lines; regular body; tabular figures for timers. Sentence case ("Alarm").
Arrows, shapes and gems drawn (`DirArrow`, `RoleShape`).

**Principles.** Light = seen; outlined = interactive (architecture has no
outline); name people, not channels; comms appear only while held; directions
are drawn arrows placed where the thing is; steady states, not flashes.

**3/4 recipe.** Axis-aligned grid, north up, ~55° tilt: top face depth 0.82T,
wall front 1.1T, crates/doors 0.7T. Painter's order by row, entities interleaved
by y. Camera follows your avatar: ~18 tiles wide on desktop (T≈64px), ~7 on
phone (T≈52px). Room = one island slab with a 2T cliff into water. Blocks: top
base, front ~18% darker and rose-shifted, light from the north-west, 12% contact
shadow. A wall in front of a figure fades to 35% with a dashed silhouette.
Figures: pill bodies in role colour with plum outline, face disc, shadow; the
**hat is the role shape** (dome / box / cone); own avatar has a floor ring and
"You" chevron; bots have an antenna plus "bot" in the HUD; face pops 1.4T on a
white plate. Camera: dashed cone idle, hatched cone watching. Laser: beam at
0.6T with a floor shadow; off = dashed. Guard: larger slate figure, torch cone.
Plates sink when pressed; sequence plates show drawn numerals. Doors slide into
the floor. Loot: faceted gem with bob. Marks: upright signposts on the tile.
Labels (room 1): glass chip with leader line.

**Lobby, desktop host (5 players).**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Share this code                        │ Players  5 of 6         Private [ off]│
│   K  7  M  Q                           │ Drag to set the starting order        │
│ [ Copy ]  [ Show QR ]                  │ 1 ⋮⋮ Ana (you, host) [edit]   Set up  │
│ Team name [Night Owls        ]         │      headphones · in room · mask     │
│ Rooms and who plays                    │ 2 ⋮⋮ Bo                       Set up  │
│ 1 Loading dock  Ana Bo Cy · Dee Eli out│ 3 ⋮⋮ Cy                   Setting up  │
│ 2 ...  (rotates; host can change in    │ 4 ⋮⋮ Dee   plays 2            Set up  │
│        the reveal)                     │ 5 ⋮⋮ Eli   remote · plays 2   Set up  │
│                                        │ Spectators: Fay                       │
│                                        │ Your setup                            │
│                                        │ Headphones ( Yes ) ( No )             │
│                                        │ Where      ( In the room ) ( Remote ) │
│                                        │ [x] Always show captions              │
│                                        │ Gear [x] Earplugs/earmuffs [x] Mask   │
│ [ Leave lobby ]                        │ [ Start heist ]                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

Private on adds under the code: "Hidden from open lobbies. Only people with the
code can join." Phone stacks: name edit, Your setup, Players, rotation line,
Leave. No role shapes in the lobby (roles appear at the reveal). Empty lobby:
"Share the code to fill seats; bots fill the rest." Full (6): later joiners
spectate.

**Role reveal, desktop (Can't hear).**

```
┌──────────────────────────────────────────────┐  Crew
│ Room 2 of 4: Don't blink                     │  ● Ana   Ready    played ■▲
│        ■  (box-hat figure)                   │  ■ Bo (you) …     played ●
│ You can't hear                               │  ▲ Cy   Ready     played —
│ You can send  talk, clips, faces, marks      │  Sitting out: Dee, Eli
│ You see       faces and marks from Ana ● Cy ▲│
│ You won't get talk or sounds from anyone     │  [host: Swap roles]
│ Earplugs in now. Sit where you can't see     │
│ Ana's and Cy's faces.                        │
│ [      I'm ready      ]     2 of 3 ready     │
└──────────────────────────────────────────────┘
```

Can't speak: "You can send clips, faces, marks · You get everything · Don't
mouth words or point at screens." Can't see (phone) adds "Your screen goes
dark. That's on purpose.", "Learn the sounds" with ▶ per cue and ▶ Play all,
and "Mask on. Find WASD and Space first." Host swap: select two rows (or a
sitting-out person) → "Swap Ana and Bo — swapping resets everyone to not
ready." Someone left: their row hatched "Left the game"; "Waiting for the
host" with host actions [Bot takes Bo's role] [Pull in Dee].

**In game, desktop (sighted).**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│[● Ana] [■ Bo you] [▲ Cy talking]          1:42  ◆3  ◉ Live  2 watching  [≡] │
│   peach→mint sky                                                             │
│     ┌──── rose walls (top + front) ───────────────────────────┐             │
│     │ sand floor   ▲Cy          ║glass║  ≈≈ mist: layout only ≈ │             │
│     │  [Plate: one person on each…]─┐   ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈ │             │
│     │  ▭1 ▭2 ▭3      ■Bo(you) ◯     ║vent ║≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈ │             │
│     │ ╱╱cam cone╱╱  ◆      ▣crate                             │   ┌──────┐ │
│     └──────────── cliff into teal water ──────────────────────┘   │●Ana →│ │
│                                                                    │[face]│ │
│                                         Hold Q / right-click: comms└──────┘ │
│                                         V talk   Enter type                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

The bottom-right hint hides after room 1. `[≡]` holds settings (high contrast,
labels, captions, voice mode) and the vote proposals.

**In game, phone (Can't speak).**

```
┌───────────────────────────┐
│● Ana ■ Bo ▲You  1:42 ◆3 ◉ │
│[≡]            2 watching  │
│   world (map full height) │
│→ edge pill          ◀     │
│ ┌ captions (glass) ─────┐ │
│ │ ■ Bo: wait at the door│ │
│ │ → Footsteps           │ │
│ └───────────────────────┘ │
│        [★quick][◐wheel]   │
│ (joystick)  [Mic]  (Act)  │
└───────────────────────────┘
```

Mic hatched "Can't talk" for Can't speak. **Can't see** (both viewports): glass
top bar on black; "Your screen is dark on purpose. You'll hear the room and
your crew." for 10 s, then "Dark on purpose. Listen."; their dimmed hat-figure
centred, facing and hopping per §2.1 item 31; wheel, mic, Act as above.

**Wheel** (fixed: screen centre for Q, cursor for right mouse, above the
button on phone; drawn only after ~200 ms still):

```
          Talk   Faces   Clips   Marks
        ┌───────────────────────────────────┐
        │ Go    ● Ana hears this   ■ Bo can't│
        └───────────────────────────────────┘
           Push        ↑        Here
             ←      ( Stop )      →
           Wait        ↓        Go ◀ aimed
        (ring 70% see-through; release beyond rim cancels)
```

Clips as Can't see: all hatched, "You can't send clips. Ana ● and Cy ▲ can."
Cooling slot shows "2.4". Marks: pick → ghost signpost follows pointer → tap a
visible tile ("Tap where, in sight"); misted tiles show "not in sight".

**Captions and edge pills.** `→ Footsteps` pinned at the edge where the sound
is; the log line "↗ Camera starts watching" (screen readers: "from the upper
right"). Edge pill: `▲ Cy ▶` + face thumb for the pop (1.5 s), the pill alone
4 s, then fades.

**Vote.**

```
┌──────────────────────────────────────┐
│ Cy wants to restart this room   12 s │
│ ● Ana  Yes    ■ Bo  …    ▲ Cy  Yes   │
│ [ Restart room ]   [ Keep playing ]  │
│ ▬▬▬▬▬▬▬▬▬▬▬▬▬░░░░░░ (bar + number)   │
└──────────────────────────────────────┘
```

Outcomes: "Restarting the room." / "Not restarted: Bo kept playing." / "Not
restarted: time ran out."

**Leave warning.** Glass modal with [Stay] [Leave heist] / [Leave lobby]
(reusing `ConfirmButton`); native beforeunload for tab close.

**Room end with comms map.**

```
┌──────────────────────────────────────────────────────┐
│ Room cleared        1:42        ◆ 3 of 5             │
│                ● Ana                                 │
│            14 ↗╱    ╲↘ 9                             │
│             ╱  ↙6  3↖ ╲                              │
│      ■ Bo ───────────── ▲ Cy                         │
│            → 11    ← 2                               │
│ Most messages went Ana → Bo. Cy sent 5 in total.     │
│ [ Next room ] (host)   Waiting for Ana… (others)     │
└──────────────────────────────────────────────────────┘
```

The final room's card adds rank, Leaderboard and Play again.

**Spectator, desktop.** Map left ("Watching Night Owls", Follow [● Ana] [■ Bo]
[▲ Cy] [Whole room], "Sitting out this room: Dee, Eli (you play room 3)");
right panel "Spectators (3) — only spectators see and hear this", chat log,
input, [Hold to talk] V. Phone: map top 60%, bottom sheet (Chat / Players)
peeking the last 2 messages.

**Reused:** shell tokens, focus ring, `RoleShape` (plus a hat variant),
`Connection` (live light), `Captions` (arrow lines), `ConfirmButton`,
`Disconnect` (restyled), `RoleReveal` (restructured; morph and honour-line
logic kept), `RoomCleared`/`HeistComplete`, `Spectator`, `TouchControls`,
`Settings`, `Lobby` (code + QR), render helpers `hatch`, `shapePath`,
`blockedFor`, cone logic, `drawAlarm`.
**Retired:** `Tray`, `SaySheet`, `SoundSheet`, `ShowSheet`, `SheetGrid` (key and
cooldown logic moves to the wheel), `RealLifeWizard` (`realLifePreset.ts`
logic stays, per person).
**New:** world tokens + alarm/HC sets; `--glass`, `--scrim`, `--hatch`; a
`render/` split; `CommsWheel`; `ReceiverLine`; `DirArrow`; edge pills;
`VotePrompt`; `LeaveGuard`; `CommsMap`; `PlayerRow`; `YourSetup`;
`SoundBriefing`; `SpectatorChat`.

## 5. Probes raised and resolved

| # | Type | What was raised | Resolution |
| --- | --- | --- | --- |
| 1 | gap | New channel rules alone can't fix balance: sight is global, so Can't speak is omniscient and Can't see has nothing unique | Line of sight for sighted roles (ADR 0012) |
| 2 | contradiction | Split cues (user idea) remove Can't speak's lead moment | Keep both: twin cues give Can't speak its lead; split cues force hand-offs |
| 3 | gap | Sequence door solved alone (playtest 1) | Held sequence + linter rule |
| 4 | ambiguity | "2.5D": isometric breaks shared directions for callouts/controls/captions | Tilted 3/4 with MV art (ADR 0016); user confirmed after explanation |
| 5 | contradiction | Spec 2026-10-08 item 22 said Can't see's Show reaches nobody; it reached Can't hear | Recorded; new table removes Can't see's clips and marks deliberately |
| 6 | contradiction | Old spec: channel table "do not re-litigate" | Deliberate change, ADR 0011 |
| 7 | contradiction | CLAUDE.md sensory parity (every event reaches every role) vs local sight | Amended: team-wide events reach all; local events reach who can perceive them; user approved |
| 8 | gap | Under local sight, faces from unseen teammates are invisible | Edge pills; marks faintly through haze |
| 9 | gap | Dark zone left Can't hear with no input | Show visible in dark; linter rejects no-input flip combos |
| 10 | ambiguity | Host role control vs automatic rotation | Fair rotation by default; host swaps at each reveal, resets ready; pips show history |
| 11 | gap | 4+ players | Up to 6, sit-out rotation, "plays N" shown |
| 12 | gap | Real-life setup ignored; headphones belong to a person, roles rotate | Per-person setup in lobby, settings recomputed per room, real-life line on reveal |
| 13 | gap | Real-life gear | Earplugs/earmuffs, sleep mask; seating and no-mouthing rules per role |
| 14 | gap | Captions for Can't hear would leak sound | Captions describe only what you receive |
| 15 | ambiguity | How does Can't see use a visual wheel? | It sees its own controls; number keys for the masked case; spoken wheel rejected |
| 16 | ambiguity | Wheel opening on the emptier side breaks muscle memory | Fixed position, marking menu (flick sends undrawn) |
| 17 | gap | Talking via the wheel is slow | Enter for text, V push-to-talk or toggle |
| 18 | gap | Lobby "ready" duplicates the reveal's ready | Lobby shows setup status only, not gating |
| 19 | gap | Deliberate leave vs dropped connection | Leave skips the 45 s wait; host chooses bot / pull in / lobby |
| 20 | gap | Who votes | Active humans only; bots auto-accept; 15 s; restart room and heist |
| 21 | gap | Leaderboard comparability after room redesign | Versioned records; v1 board archived (ADR 0014) |
| 22 | ambiguity | Private lobby | Hidden from open list only |
| 23 | gap | Spectator comms | Spectator-only chat and voice (ADR 0015); never reach players; text never logged |
| 24 | gap | Newcomers don't know objects; blind didn't know black screen was intended | Room 1 labels; reveal briefing and "on purpose" line; world rises then fades for Can't see |
| 25 | gap | Players small, captions ambiguous | Follow camera ~18/7 tiles; 8-way drawn arrows |
| 26 | gap | Role colours fail contrast on pastel | Dark shell, plum outlines, text only on glass |
| 27 | gap | Font is ASCII-only | Arrows, shapes, gems drawn |
| 28 | gap | Every new mechanic needs bot support | Bots rewritten for LOS and made tolerant (backlog); "disable a role's sending fails its lead beat" spec |
| 29 | gap | Pulled-in sitting-out player mid-room | Takes the leaver's role; rotation continues next room |
| 30 | assumption | Can't see's movement figure leaks nothing | Driven only by its own moving/blocked state, already received for step/bump sounds |

Ambitious alternatives raised and decided: isometric and isometric-with-heights
(rejected: directions, cost), remembered fog (rejected), swap-in mid-room
(rejected for sit-out rotation), separate tutorial room (rejected for labels),
spoken wheel (rejected), host approval for joiners (rejected).

## 6. Handoff notes for planning

- **Tier:** Architecture; plan as an overview plus per-session phases.
- **Phase order** (each playable and testable before the next):
  1. Channel rules by method, the wheel (marking menu), Enter/V and toggle
     voice, arrow captions — works on the current rooms, so playtest 3 can run
     early.
  2. Lobby of people (up to 6, private, nicknames, per-person setup, rotation,
     host swap), reveal redesign, votes, leave flows, spectator chat and voice.
  3. Line of sight, glass and vents, held sequence, bots, linter rules,
     rewritten parity test and the "every role is needed" spec.
  4. 3/4 renderer, world tokens, movement cues, world-rising transition, edge
     pills.
  5. Four new rooms with lead beats and split cues, room 1 labels, comms map,
     versioned leaderboard.
  6. Ambience and music (cuttable).
- **Update `CLAUDE.md`** (shape of the app: the channel table by method; the
  sensory-parity invariant amended as §2.1 item 9) and the backlog's Decided
  section for every item folded in here.
- **ADRs 0011–0016** are written `proposed`; mark accepted when the user
  approves them. 0007, 0009 and 0010 are extended, not superseded.
- **Risks accepted:** bot rewrite cost for line of sight; LOS CPU per tick on
  256 MB (measure); spectator voice load; flick gestures need playtesting
  (cancel gesture especially); rotation with 5 players can't be perfectly
  equal.
- **Do not re-litigate:** the channel table above; line of sight with layout
  only; tilted 3/4 with MV art and a dark shell; wheel fixed + marking menu;
  sit-out rotation; unanimous restart votes; per-person setup; 4 rooms;
  versioned leaderboard; no role abilities.
- **Playtest 3** after phase 1 (comms), playtest 4 after phase 5, using the
  comms map counts as balance evidence; log both in `PROCESS_LOG.md`.
