# A lit diorama world, a dusk shell, and motion that belongs to each object

- **Date:** 2026-11-07
- **Status:** Approved
- **Approved by user:** yes, 2026-11-07
- **Tier:** Architecture (ADR 0026, proposed; supersedes the flat-shading line of ADR 0016).

## 1. Problem / intent

Backlog, 2026-11-02: "the whole game looks too simple/cartoonish; the user wants a more realistic feel
across it (gradients, soft shadows, gloss), starting from the keepsakes". In the brainstorm, the user
added three things:

- **Subtle setting details.** "Subtle details that do not detract too much from the game, and still keep
  an overall simple aesthetic like MV. Such as lights on walls, and other realistic cosmetics given the
  settings of the rooms."
- **The shell.** They were unsure it matched the world, and asked for a critical designer's view. They
  accepted the critique: a cold navy shell against a warm pastel world, a hard role-blue frame, no
  light or depth, mismatched radii and type, and empty space that reads unfinished.
- **Animation.** "Animations should be unique to the object". One ring is used everywhere. The start of
  a room "isn't clear enough": the 2D map should visibly tilt into 2.5D, then the camera should zoom and
  pan to the player's start.

## 2. Requirements

### 2.1 Functional requirements

**Room colour (phase 0)**

- **FR1.** Each room's `hue` (rose, teal, amber, violet, indigo) picks its wall token set
  (`--w-wall-top`, `-front` and `-shade` per hue), with a dusk variant and a high-contrast variant.
  DESIGN.md's false "built" claim is corrected by building it.

**Shell**

- **FR2. Retint.**
  - `--bg` is `#15121f`.
  - `--panel` is `#221c30`.
  - New `--panel-hi` is `#261f35`.
  - `--ui` is `#efeaf5`.
  - `--ui-muted` is `#aba1c0`.
  - `--glass` is `rgb(34 28 48 / 90%)`.
  - `--scrim` is `rgb(21 18 31 / 62%)`.
  - Role, danger and goal colours are unchanged.
  - Every text pairing passes AA. The worst case is danger on `--panel-hi`, at 4.54.
  - `--ink` stays `#000000`.
  - The values are proposals, and a test measures them.
- **FR3. Surfaces.**
  - Panels get a north-west gradient from `--panel-hi` to `--panel`, plus `--sheen` (a top inset
    highlight) and `--lift` (a soft drop shadow).
  - Nested rows are flat wells.
  - The HUD bar gets the same treatment.
  - High contrast sets `--sheen` and `--lift` to `none` and drops the gradients.
- **FR4. Radii and buttons.**
  - `--r` goes from 4 to 8 px (mirrored in `tokens.ts`). New `--r-lg` is 14 px, for panels, the frame and
    feed windows.
  - Status chips become pills.
  - Secondary buttons are a lit `--panel-hi` body with a 2 px `--ui-muted` outline, which turns `--ui` on
    hover.
  - Primary buttons are a `--ui` fill.
- **FR5. Type.** The display face (125 %/900) is used only for:
  - the home hero
  - the lobby code
  - the reveal's role line
  - the room-cleared title and time

  Every other heading is 100 %/800.
- **FR6. The canvas frame.** The 4 px role border is replaced by:
  - a `--r-lg` bezel in `--panel`, with `--lift`
  - an inset recess: a lit top edge and an inner shadow
  - a 36 px role tab at the top left, with the role shape on the role colour
  - a short role line along the top
  - a **1 px role rim all round**

  The spectator frame keeps a dashed bezel.
- **FR7. Empty screens.** The reveal draws the room's whole-room view in the **dusk** tokens, blurred
  under `--scrim`. Can't see's reveal stays `--ink`. The home page gets a still north-west dusk glow,
  and its feeds become framed windows. The black reveal backdrop seen in
  `review/bp-02-task81-played-icons-1280.png` is investigated and fixed.

**World materials**

- **FR8.** Material per element, light from the north-west, every tone a token mixed toward white or
  black:
  - **Floor:** stone flags, with 4 seeded tone variants, grooved seams and speckle. Rooms 04 and 08 get
    wood boards. Plates and keys keep their legibility.
  - **Floor at a wall's base:** ambient occlusion, a 0.25-tile gradient of `--w-wall-shade` (16 % or
    less) south of each wall, and a 0.15-tile strip east of west walls.
  - **Wall tops:** a north-west gradient and a lit lip. **Wall fronts:** a vertical gradient and a 1 px
    bevel highlight.
  - **Doors:** inset panels, a bevel, and sheen on the top face.
  - **Crates:** a lit corner, wood grain, and a live drop shadow.
  - **Glass:** a graded front, a sheen band and a bright top edge.
  - **Vents:** brushed steel, and louvre highlights. The slat count is unchanged.
  - **Station bodies:** brushed steel and brass bands. Swatches, lamps, keys and numbers stay flat.
  - **Figures:** a soft gradient, a hat sheen, the 2 px outline kept, and a radial shadow.
  - **Backdrop:** a faint north-west sun glow, cliff strata and a foam line.
  - **Water:** a static slab reflection at 12 %. The ripples are unchanged.
- **FR9. Information stays flat:** mist, night, cones, lasers, the UV pool, code swatches, outlines,
  labels and marks. High contrast draws no gradient, shadow, texture or decor.

**Decor**

- **FR10. Placement.** `decorFor(roomId, tiles)` is seeded from the room id and reads only the layout the
  client has. It places items on `#` fronts that are open to the south (not the last row) and on `#`
  tops. It excludes wall tiles within 1 tile of:
  - a station part, wire, plaque, camera, hatch, door, sign or UV-ink reach
  - a night tile
  - a label anchor (2 tiles each side)

  Density is at most 1 per 6 eligible fronts, at least 3 apart, and at most 1 per 8 tops. Room 01 is at
  half that. A cache's secret wall may carry decor, which sinks with it. Placement never reads cache
  state.
- **FR11. Drawing.** Decor is drawn inside its wall's own call, so it shares the wall's see-through alpha
  and mist cut. It has no `--w-line` outline and no animation, and it is not drawn in high contrast.
  Any glow is a radial gradient of the new `--w-sconce` at 35 % or less, **clipped to its own wall
  face**: it never touches a floor pixel.
- **FR12. Themes.**

  | Room | Theme | Decor |
  | --- | --- | --- |
  | 01 | Garden pavilion | ivy, planters |
  | 02 | Conservatory | diagonal trellis, ferns |
  | 03 | Watch house | swallowtail banners in wall tones, unlit iron sconces |
  | 04 | Bank office | wainscot, certificates, lit sconces |
  | 05 | Gallery | gilt-framed abstract paintings, each with a picture light |
  | 06 | Backstage | curtain swags, unlit sconces |
  | 07 | Service corridor | steel kick panels with vertical seams, caged bulbs |
  | 08 | Music salon | violin and lute silhouettes, staves **without notes**, swags |
  | 09 | Strongroom | rivet rows, steel cladding with vertical seams, caged sconces |

  **Banned:** clocks or dials, bells or horns, windows, horizontal slats or rails, lanterns with rays,
  role shapes, any of the six motifs, and countable notes.
- **FR13. Home feeds** show the decor.

**Motion**

- **FR14. The start of a room** replaces DESIGN.md §4.5. When all are ready:
  1. Hold the flat top-down plan for 300 ms.
  2. Tilt back like a board tipping, over 900 ms: depth goes from 1 to TILT, and walls grow out of the
     floor, staggered north to south.
  3. The camera swoops (zoom and pan) from the whole room to your start, over 900 ms.
  4. Land over 300 ms: your figure hops, with a small ring at its feet.

  The details:
  - **Input and clock:** input is locked throughout. The server holds its first simulation tick for the
    sequence's length (`INTRO_MS`), so the guards, the clock and bots all start when it ends.
  - **Spectators:** the tilt, then a swoop to the whole room.
  - **Can't see:** a black screen; their figure fades in after step 4.
  - **Reduced motion:** a 300 ms cross-fade to the game camera (the hold still applies).
  - **Restarts:** a restart of a room plays the same sequence.
- **FR15. Object motion.** Each event animates its own object, in its own painter row and light clip,
  with the durations and motions in §4.2. No two events differ only by colour or size. Each one's
  reduced-motion form is its end state (at most a 150 ms fade).
- **FR16. The ring is reserved** for "station solved" (big, at the anchor) and "you landed" (small, at
  your feet). A test enforces that no other trigger emits one.
- **FR17. The audit's rulings.**
  - A rung bell swings once per ring, not on a loop.
  - The goggles' grain drops to 6 fps.
  - Every visible figure hops on room cleared.
  - Hands joining and parting are picture only, with no new sound.
  - Everyone sent back by a catch squashes into a puff and pops up at the checkpoint.
  - The inspection plate does not dip.

### 2.2 Non-functional requirements

- **Performance.**
  - Static world layers come from a per-room tile atlas on an offscreen canvas, keyed by scale × dpr,
    token set and theme. It is rebuilt on a scale change, `setContrast`, dusk and the intro.
  - It is not a whole-room canvas (about 90 MB on a phone).
  - Frame time is measured on a phone-class profile before phase 3 and after each world phase. It may
    not be worse than the baseline.
- **Accessibility.**
  - An AA contrast test covers every text pairing on the new shell surfaces.
  - At most 3 flashes a second, always. The radio pip is once every 2 s (`PIP_TICKS = 40` at 50 ms).
  - Never colour alone.
  - Reduced motion is honoured everywhere.
- **Parity.** Every `parity.test.ts` row's `sees` predicate stays true. Motion is drawing only: the view
  is unchanged, except where FR14's hold changes when the first view arrives.
- **Verification.** Every visual phase is checked by screenshots at 1280 and 375 for each sighted role,
  plus a spectator. DESIGN.md is updated in the same commit as the look.

### 2.3 Out of scope

- A night-interior theme.
- Layout redesigns of the shell.
- New gameplay objects.
- Sound changes. The menu sounds are their own plan.
- Decor placed by hand.

### 2.4 Assumptions (confirmed)

- The user chose the polished diorama, the shell pass included, and generated decor.
- The user's rulings on the proposal: build room tints; the tab plus a 1 px rim; staves without notes;
  decor in the home feeds; a dusk reveal; wood floors in rooms 04 and 08.
- The user's rulings on the start of a room: the staged sequence, with the timer waiting for it.
- The user ordered a full animation audit, and accepted its rulings (FR17) and the overall approval.
- Contrast ratios were computed on paper by the design pass. FR2's test confirms them.

## 3. Existing context

- **The look's rules.** DESIGN.md §1 to §6. ADR 0016 (tilted 3/4, flat-shaded). The keepsakes are the
  reference realism (`src/client/items.ts`, `render/items.ts`).
- **The renderer.** `src/client/render/` holds about 8,000 lines: `blocks.ts` (floor, walls, glass,
  vents), `backdrop.ts`, `figures.ts`, `stations.ts`, `signals.ts`, `hazards.ts`, `gear.ts`,
  `chamber.ts` and `index.ts` (draw order and `drawFx`). The only offscreen canvas today is in
  `sight.ts`.
- **Room hue.** It is set in every room file. Nothing in `src/` reads it, so every room draws rose.
- **Effects.** `src/client/fx.ts` has `Fx.kind` ring, dust, spark, swing, arc, cloud, slide and lift.
  `detectFx` emits a ring for plate, door, braille, checkpoint, sequence and solved; a cache take emits
  a ring too.
- **The rise.** `RISE_MS = 900` in `Game.tsx`; `setRise` in `render/project.ts` (depth from a full tile
  to TILT, with the camera eased from fit to follow).
- **The server.** `runIfReady` in `src/net/attach.ts` starts `setInterval(tick, TICK_MS)` as soon as
  `ready.size === 3`, so a client-only intro would let the world run under it. That is why FR14 needs a
  server hold.
- **Tokens.** `src/styles/tokens.css`, mirrored in `src/client/tokens.ts`. `spec/design.test.ts` and
  `tokens.test.ts` check names and contrast.

## 4. Design

### 4.1 UI design

From two read-only `frontend-design` passes, amended by the user's rulings.

```
IN GAME 1280                                       light from NW ↘
 HUD bar: lit panel, 1px bottom shade; chips are pills
 ╭[■]━━━━━──────── bezel r-lg, 1px role rim all round ─────────╮
 │░░░░░░░░░░░░░░░░ recess lit top edge ░░░░░░░░░░░░░░░░░░░░░░░│▓
 │▓ sky peach→mint  ☼ sun glow NW                             ▓│▓
 │▓ ~~~   ┌wall top░░░░░░░░░░░░┐  ~~~                         ▓│▓
 │▓       │front ✦sconce│▣art  │  (glow stays on the face)    ▓│▓
 │▓       │▓▓ AO on floor ▓▓▓▓▓│                              ▓│▓
 │▓       │ stone (Bo)▓ crate▓ │  [chip on glass]             ▓│▓
 │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ recess shade ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│▓
 ╰─────────────────────────────────────────────────────────────╯▓
            [ Q Comms ] [ Enter Write ]   lit bodies, 2px outline

ROLE REVEAL 375                       HOME 1280
 ▒ dusk room, blur 3, scrim ▒          ☼ NW dusk glow behind the hero
 ▒╭░ Room 2 of 9          ▓╮▒         A heist for three. (display)
 ▒░ ▲ You can't speak  (display)      ╭░ feed window r-lg ░╮  ╭░ join panel ░╮
 ▒░ [  I'm ready  ]       ▓▒          ╰▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓╯  ╰▓▓▓▓▓▓▓▓▓▓▓▓▓▓╯
 ▒╭░ Crew  (100%/800)     ▓╮▒
 ▒░ ┌well: ■ Bo Not ready┐ ▓▒
```

New tokens:

| Token | Value | Reason |
| --- | --- | --- |
| `--panel-hi` | `#261f35` | the lit end of a surface |
| `--r-lg` | 14px | the world's softness for panels |
| `--sheen` | top inset 1 px white 6 % | one highlight, removable in HC |
| `--lift` | soft two-layer drop | one shadow, removable in HC |
| `--w-sconce` | `#ffe9c4` | the decor light, apart from `--w-lamp` |

Plus the per-hue wall sets (FR1).

### 4.2 Motion table (replaces DESIGN.md §5's rows; RM = reduced motion)

| Event | Duration | Motion | RM |
| --- | --- | --- | --- |
| Start of a room | ~2.4 s | flat 300, tilt 900, swoop 900, land 300 | 300 ms cross-fade |
| Plate press / release | 180 / 200 ms | sink, side puffs / spring, no dust | end state |
| Door | 450 ms | leaves part and sink, seam dust line, 1 px thud | slot |
| Crate | 250 ms | rock 2°, trailing dust | moved |
| Loot | 400 ms | hop and arc to the picker, spark | 150 ms fade |
| Keepsake take | 1 s | rise, gloss sweep, glide to owner; no ring or spark | fade in place |
| Gear take / drop / sill / give | 250 / 250 / 300 / 250 | hop / bounce / slide / arc | end state |
| Flag pip / checkpoint | 220 / 500 ms | pip pop with a pole wobble / pennant unfurl with one wave | end state |
| Exit occupied / cleared | 400 / 600 ms | hatch marches outward / every figure hops twice | static / none |
| Hide | 250 ms | squash into the box | hidden |
| Seq ok / wrong / open | 200 / 300 (+600) / 400 | stamp / shake ±4 px, steady danger outline / ripple fill | end state |
| Solved | 600 ms | **ring** + tick plate drop + type flourish | 150 ms fade |
| Dial / key / practice / wire / radio / switch | 150 / 200 / 200 / 300 / 250 / 270 | detent / piano tip / dull tip / ends curl / needle slide / throw + rays | end state |
| Bell / music-box bell | 1.2 s **once** / 300 ms | 3 swings / 1 nod | static tilt |
| Braille read | 400 ms | studs lift in reading order; no ring | outline only |
| Jam | 240 + 200 ms | stutter, then the tape unrolls | tape at once |
| Dye | 600 ms | puffs, then blotches splat 80 ms apart | blotches at once |
| Hands join / part / tug | 150 / 150 / 2 Hz | beads meet / retract / arc tremor ±1 px | end state |
| Lever | 280 ms | throw, then a thud | thrown |
| Secret door / vault | 600 / 600 + 500 | block sinks with a dust curtain / keepsake rises on its plinth | 300 ms cross-fade |
| Camera / laser / guard | 250 / 150 / 1.5 Hz | nod and hatch fill / beam draws / heavy hop and torch sway | instant / translate |
| Caught | 200 + 250 ms | everyone sent back squashes into a puff, then pops at the checkpoint | teleport |

The other rows are unchanged: UI, wheel, faces, reveal, live light, alarm, dusk, taken chip.

**Primitives.** Pure functions of t from 0 to 1: `sink`, `squash`, `pivot`, `swing`, `slide`, `shake`,
`hop`, `arc`, `pop`, `unfurl`, `ripple` and `puff` (side, line, trail, curtain, burst), plus `ring`,
which is restricted. Easings: out, in-out, out-back, out-bounce, spring and linear. `Fx` gains
`targetId`, and each drawer reads its own active fx.

## 5. Probes raised and resolved

| # | Type | What was raised | Resolution |
| --- | --- | --- | --- |
| 1 | ambiguity | How realistic? | A polished diorama (user) |
| 2 | gap | The shell's cohesion | Critique accepted; a retint and material pass (user) |
| 3 | contradiction | DESIGN.md says hue is "built", but it isn't read | Build tints, phase 0 (user) |
| 4 | gap | The role border's readability from a distance | Tab + 1 px rim (user) |
| 5 | gap | Decor could read as light, objects or motifs | The banned list; clipped glow; no outline (FR10 to FR12) |
| 6 | gap | Animations not unique; colour-only pairs | Object motion; the ring reserved (FR15, FR16) |
| 7 | gap | The intro unclear | The staged sequence (user) |
| 8 | contradiction | The server ticks as soon as all are ready, so a client intro would let the world run | A server-side hold, `INTRO_MS` (FR14) |
| 9 | gap | Performance of gradients per frame | A per-room atlas, measured (NFR) |
| 10 | gap | The pip rate and flashing | Measured: 1 per 2 s |
| 11 | gap | Hollow plate, goggles, cleared, hands, caught | FR17 (user) |
| 12 | gap | The reveal backdrop is black in a review shot | Investigate and fix in FR7 |

## 6. Handoff notes for planning

- **Phased set:**
  - 0 room tints
  - 1 shell retint and radii (tokens only)
  - 2 shell surfaces, buttons, type, frame, and the reveal and home fill
  - 3 world atlas and base materials (with the phone-profile baseline first)
  - 4 objects
  - 5 the start-of-room sequence and the server hold
  - 6 object motion (fx retargeted, primitives, the ring test)
  - 7 the decor engine plus 05, 08 and 09
  - 8 the other six themes, then the DESIGN.md wrap-up
- Each phase ends green and committed, with screenshots at 1280 and 375. Each visual phase carries a
  Human review on a local build.
- **Do not re-litigate:**
  - the dark shell stays dark
  - information stays flat
  - decor never touches the floor and is never outlined
  - the ring is reserved
  - the timer waits for the intro
- **Risks:**
  - the size of the renderer
  - the atlas keeping in step with dusk and the rise
  - flaky layout specs from longer animations (`spec/flaky-patterns.test.ts`)
