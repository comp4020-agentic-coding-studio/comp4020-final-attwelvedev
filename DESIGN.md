# DESIGN.md

The current design reference. It says what the look is, why, and which piece to
reuse. It keeps **names, never values**: every colour, size and duration lives in
`src/styles/tokens.css` (mirrored for the canvas in `src/client/tokens.ts`), and
`spec/design.test.ts` fails if this file names a token that isn't there, lists a
component that doesn't exist, or holds a hex value.

A change to the look, a token, a component's job or the copy rules updates this
file in the same commit (`CLAUDE.md`, "Working method"). Sections about the 3/4
world are written from `specs/2026-10-19-play-overhaul.md` §4.1 and ADR 0016, and
each item says **planned (Task N)** until that task builds it; the task then
removes the marker. Status words: *built* means it is in the app today.

## 1. The idea

**Daylight and night.** The world is a morning in a pastel island garden over
teal water. Everything that is not the world (HUD, wheel, captions, lobby,
reveal, menus) is **night-glass**: the dark shell, as built today.

- **Light = seen.** Things in your line of sight are drawn in full colour.
- **Haze = known.** The layout of what you can't see right now is veiled, not hidden.
- **Night = unseen.** Dark zones, the alarm's dusk palette, and Can't see's black screen.

The shell stays dark on purpose. The three role colours pass AA as text only on
dark, and a black Can't-see screen next to a light shell would read as a crash.

**Principles**

1. Light means seen; outlined means interactive (architecture has no outline).
2. Name people, not channels. Say who hears you, by shape and name.
3. Comms appear only while held. The wheel is drawn after a still hold, not parked on screen.
4. Directions are drawn arrows, placed where the thing is.
5. Steady states, not flashes. Nothing flashes more than 3 times a second.
6. Never colour alone: every colour carries a shape or words as well.
7. Everything is drawn in code. No new image assets; the only outside art is the reaction faces (`CREDITS.md`).

## 2. Tokens

Names and jobs only. Look the value up in `src/styles/tokens.css`.

### Shell (built)

| Token | Job |
| --- | --- |
| `--bg` | Page background; the gap behind every panel |
| `--panel` | Sheets, cards and the lobby's surfaces |
| `--ink` | The Can't-see screen: pure black, so it reads as dark on purpose |
| `--ui` | Text, icons, outlines of interactables |
| `--ui-muted` | Secondary text and the hatch |
| `--danger` | Alarm, lasers, cancel and decline |
| `--goal` | Loot and exit, "yes" and ready |
| `--camera-light` | A camera's watched zone. Always hatched, since amber and yellow are close |
| `--role-blind` | Can't see: circle |
| `--role-deaf` | Can't hear: square |
| `--role-mute` | Can't speak: triangle |
| `--glass` | Every chip over the world. `--ui` on it is at least 10:1 |
| `--scrim` | Dims the world behind a modal or the reveal |
| `--hatch` | "Can't": 45° stripes of `--ui-muted`. Marks something you cannot do |
| `--paper` | The QR code's quiet zone only; scanners need dark on light |

`--solid`, `--floor` and `--crate` are the flat map's fills. They are retired when
the world tokens below land (Task 18) and then removed from this list.

### Scale

Type `--t-14`, `--t-18`, `--t-28`, `--t-48` and `--t-code` (the lobby code,
fluid). Space `--s-1` to `--s-6`. Corner `--r`. Touch targets `--target` (48 px
minimum). Motion `--ease` (150 ms ease-out; 0 under reduced motion).

### World (planned)

Light from the north-west: a block's top is the base colour, its front is about
18 % darker and shifted toward rose, with a 12 % contact shadow. Wall hue varies
by room (never lilac); the room's `hue` meta picks it, defaulting to rose.

| Token | Job | Status |
| --- | --- | --- |
| `--w-sky-hi`, `--w-sky-lo` | Sky gradient, peach to mint | planned (Task 18) |
| `--w-water`, `--w-water-deep`, `--w-ripple` | Water, its depth, and the drifting ripple | planned (Task 18) |
| `--w-floor`, `--w-floor-front`, `--w-seam` | Floor top, island slab front, tile seams | planned (Task 18) |
| `--w-cliff-hi`, `--w-cliff-lo` | The 2-tile cliff into the water | planned (Task 18) |
| `--w-wall-top`, `--w-wall-front`, `--w-wall-shade` | Wall top, front and shade | planned (Task 18) |
| `--w-crate`, `--w-crate-front`, `--w-crate-brace` | Crates | planned (Task 18) |
| `--w-door`, `--w-door-front`, `--w-door-seam` | Doors, which slide into the floor | planned (Task 18) |
| `--w-plate`, `--w-plate-pressed` | Plates; pressed ones sink 3 px | planned (Task 18) |
| `--w-glass`, `--w-glass-front` | Glass: translucent, two glints | planned (Task 18) |
| `--w-vent`, `--w-vent-front`, `--w-vent-slat` | Vents: slatted | planned (Task 18) |
| `--w-mist` | The veil over tiles outside line of sight | planned (Task 18) |
| `--w-night`, `--w-night-rim` | Dark zones and their rim | planned (Task 18) |
| `--w-line` | The 2 px outline of figures and interactables | planned (Task 18) |
| `--w-laser` | Lasers | planned (Task 18) |
| `--w-watch` | A camera or guard watching: the hatch | planned (Task 18) |
| `--w-exit`, `--w-exit-flag` | The exit's arch and flag | planned (Task 18) |

**The alarm's dusk set** (planned, Task 18) replaces sky, water, walls and floor
with a dusky palette over about 600 ms (instant under reduced motion). Lasers,
role colours and Show items do not change. **High contrast** (built for the shell
and the flat map; world set planned, Task 18): black sky and water, near-black
floor, white walls, 3 px white outlines, and mist replaced by half-black plus the
stipple. The Settings toggle sets `data-contrast="high"`, and `setContrast` in
`src/client/tokens.ts` swaps the canvas's copy.

## 3. Type

One family, **Archivo** (variable, self-hosted, OFL), so there is no network
dependency. Roles by axis:

- **Expanded, black (width 125 %, weight 900):** the lobby code, the reveal's role line, the room-end time, headings.
- **Condensed, 700 (width 75 %):** HUD chips, wheel labels, receiver lines.
- **Regular:** body and captions.
- **Tabular figures** for timers and cooldown numbers.

Sentence case everywhere ("Alarm", not "ALARM").

**The ASCII-subset rule.** The shipped font is an ASCII subset, to stay small.
Anything outside it is **drawn, not typed**: arrows (`DirArrow`), role shapes
(`RoleShape`), gems and the "no sound" glyphs. Don't paste a typographic arrow or
a symbol into copy; it would fall back to another font and look wrong.

## 4. The world

### 4.1 The 3/4 recipe (planned, Tasks 18 and 19)

- Axis-aligned grid, north up, about a 55° tilt: a floor tile's top face is 0.82 of a tile deep, a wall's front 1.1 tiles tall, crates and doors 0.7. planned (Task 18)
- Painter's order by row, north to south, with figures interleaved by row. planned (Task 18)
- The camera follows your avatar on both layouts: about 18 tiles wide on desktop, about 7 on phone, clamped to the room. The home feeds and the reveal fit the whole room. planned (Task 18)
- The room is one island slab with a 2-tile cliff into the water; sky and water are cached per size. planned (Task 18)
- A wall in front of a figure fades to 35 % with a dashed silhouette of the figure. planned (Task 18)

### 4.2 Figures (planned, Task 19)

- A pill body in the role colour, a 2 px outline, a face disc whose eyes lean toward the facing, a floor shadow. planned (Task 19)
- **The hat is the role's shape**: dome (circle), box (square), cone (triangle). The shape is therefore on the figure, not only in the colour. planned (Task 19)
- Your own avatar has a floor ring and a "You" chevron; a bot has an antenna. planned (Task 19)
- Moving: a small hop and dust every quarter second. Blocked: a squash toward the facing. Pushing a crate: a lean. Reduced motion keeps facing only. planned (Task 19)
- Can't see's own screen is black with their dimmed figure centred, facing and hopping as they move. planned (Task 19)

### 4.3 Hazards and objects

- **Camera:** a dashed cone when idle, a hatched cone when watching. Guard: a larger slate figure with a torch cone. planned (Task 18)
- **Laser:** a beam at 0.6 of a tile with a floor shadow; off is dashed. planned (Task 18)
- **Plates** sink when pressed; sequence plates carry drawn numerals. **Doors** slide into the floor. **Loot** is a faceted gem. **Marks** are upright signposts on a tile. planned (Task 18)
- **Today (built):** the flat map draws all of these as top-down shapes (`src/client/render.ts`), with glass as a light outlined tile and a vent as a slatted wall.

### 4.4 Glass, vents, mist, night (planned, Tasks 18 and 20)

- **Glass** is translucent with glints and a "no sound" mark: you see through it, sound doesn't pass. **Vents** are slatted with a "sound passes" mark: sound passes, sight doesn't. Neither lets a body through. planned (Task 18)
- **Mist** veils tiles outside your line of sight (desaturated, a static stipple, a half-tile feathered edge). You still know the layout. planned (Task 20)
- **Night** is a dark zone: only Show items and marks light it. planned (Task 20)
- Marks in unseen tiles are drawn faint. A face or mark from someone you can't see appears as an **edge pill** where their direction leaves the screen: shape, name, and the face for 1.5 s, then the pill alone for 4 s. planned (Task 20)

### 4.5 The world rises (planned, Task 21)

When everyone is ready, the flat blurred room under the reveal tilts up into the
3/4 world over 900 ms. Reduced motion: a 300 ms cross-fade. The canvas stays
mounted throughout.

### 4.6 Labels

Room 1 carries glass chips with a leader line that name what each thing is for.
planned (Task 22)

### 4.7 The role frame (built)

The viewport has a 4 px border in the role's colour and the role's shape notched
into its top-left corner, readable from a distance. The Can't-see viewport is
`--ink` with a dim ring at the centre until the new figure (Task 19) replaces it.

## Components

Reuse these before drawing something new. The test checks each name exists.

- `RoleShape`: a role's shape in its colour, drawn so all three are the same visual size. `mono` takes the surrounding text colour. Use it anywhere a role is named.
- `ReceiverLine`: who hears a method, by name ("Ana hears this · Bo can't"), shape and name together. Never a shape alone.
- `DirArrow`: an 8-way arrow, drawn, screen up is north. For captions and edge pills.
- `ConfirmButton`: asks first; the second press within 3 s acts. For anything that wipes a room or ends a session.
- `PlayerRow`: a person in the lobby: name, setup chips, plays N.
- `YourSetup`: a person's own real-life answers; the lobby and `/preferences` both use it.
- `PreferencesSheet`: the preferences without leaving the lobby; every change is saved and sent as it is made.
- `RoleReveal`: the reveal screen: what you send and get, in the wheel's words, with the crew's ready states.
- `SoundBriefing`: Can't see's "Learn the sounds": one play per cue, and Play all.
- `CommsWheel`: the marking menu, mark placement and cooldown numbers. Decisions live in `src/client/wheel.ts`.
- `TalkBar`: Enter to write, V or the mic to talk; roles that can't send say why instead of showing a dead button.
- `Captions`: what was said and what the room sounds like, with the sender's shape and name and a `DirArrow` where the sound came from. A polite live region.
- `Connection`: the live light: a shape and words ("Live", "Weak 180 ms", "Offline"), never colour alone.
- `HudMenu`: the menu: settings, the restart proposals, Leave.
- `VotePrompt`: the vote card at the top of the map, not an overlay, so people keep moving; each voter named, the time as a bar and a number.
- `LeaveGuard`: the glass modal that asks before leaving the lobby; the browser's own prompt covers a tab close.
- `SpectatorChat`: the watchers' room (text and voice); players never see it.
- `TouchControls`: the phone's joystick, comms buttons and Act.
- `RoomCleared`: the room-end card: time, gems, and (Task 24) the comms map.

Glass chips (anything over the world) sit on `--glass`.

## 5. Motion

| Thing | Duration |
| --- | --- |
| UI transitions | `--ease`: 150 ms ease-out |
| Wheel draws after a still hold | 200 ms; a flick of 24 px before then sends undrawn |
| Face pop over its sender | 1.5 s; a mark fades over 8 s |
| Reveal shape pops | 400 ms; a role swap morphs over 600 ms |
| Live light | pulses once a second |
| Alarm | a steady border and banner, a pulse of about 1 Hz |
| World rises (planned, Task 21) | 900 ms; reduced motion 300 ms cross-fade |
| Dusk palette (planned, Task 18) | 600 ms; instant under reduced motion |

**Reduced motion** (`prefers-reduced-motion`): no pulses, no hop or squash, no
dust, no water drift, no morph (a plain cross-fade), no wall rise. State changes
are instant or fade. **Flashing is at most 3 per second**, always.

## 6. Accessibility

- **Never colour alone.** Roles are colour and shape; the live light is shape and words; a receiver is a shape and a name; a "can't" is hatch and words; directions are arrows, not hues.
- **AA text.** Chips over the world sit on `--glass`; role colours are text only on the dark shell.
- **Targets** are at least `--target` (48 px), on phone and desktop.
- **Focus** is a 3 px `--ui` ring with a 2 px gap in `--bg`, on every focusable element.
- **High contrast** and **captions** are in the menu, for everyone, separate from the role simulation.
- **Keyboard complete:** the wheel (Q), talk (V), write (Enter), number keys.
- Screen readers get what a drawing says: captions are a live region, an arrow is also "from the upper right".

## 7. Copy

- Name a method as the wheel does: **Talk**, **Faces**, **Clips**, **Marks**. Never with a family word.
- Name people, not channels: "Ana hears this", not "goes to the voice channel".
- Never say "Say", "Sound", "Show" or "channel" as a category. They were the old tray's names.
- Sentence case. No exclamation marks. "Room cleared". The canvas banner says "Alarm"; it still reads "ALARM" until Task 18.
- Say what is true now and what to do: "Dark on purpose. Listen."; "Tap where, in sight".
- A refusal says why: "You can't send clips. Ana and Cy can."
- A vote says how it ended: "Restarting the room.", "Not restarted: Bo kept playing."
