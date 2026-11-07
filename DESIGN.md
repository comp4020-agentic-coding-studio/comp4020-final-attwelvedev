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
reveal, menus) is **dusk plum**: a warm dark shell. It matches the world's dusk, which the alarm blends toward, where the old cold navy fought the pastel island. **The reveal is the room at dusk:** the whole room is drawn flat in the dusk set (`Scene.dusk`, drawn at once, no blend), blurred 3 px under `--scrim`, with the card over it. Until the room's first view lands the frame shows the dusk sky, never black. Can't see's reveal stays `--ink`, as does high contrast. The home page has a still north-west glow of `--role-mute` (none in high contrast), and each feed is a window: a `--panel` bezel with `--lift` and the canvas set in.

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
| `--panel-hi` | The lit end of a panel's north-west gradient (plan: diorama look) |
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
| `--surface` | A lit panel's body: `--panel-hi` to `--panel` at 135°; `--panel` alone in high contrast |
| `--well` | A row nested in a panel (crew rows, players, credits): a flat, slightly sunk fill with `--well-shadow`; `--bg` and no shadow in high contrast |

**Surfaces.** A panel (the reveal card and crew, the HUD bar, the menu, a modal) is `--surface` with `--sheen` and `--lift` and `--r-lg` corners, so it reads as lit from the upper left. Rows nested in it are wells, never panels in panels. Status chips are pills (999 px radius). High contrast drops the gradient, `--sheen` and `--lift` through the same tokens.

**Buttons.** Secondary: a `--panel-hi` body with `--sheen`, a 2 px `--ui-muted` outline, `--ui` on hover. Primary: a `--ui` fill with `--bg` text. A disabled button keeps its hatch.

`--solid` is no longer a world colour: only the disabled Join button's border and the code field's placeholder use it. The flat map's own floor and crate fills are gone; the world tokens below replaced them.

### Scale

Type `--t-14`, `--t-18`, `--t-28`, `--t-48` and `--t-code` (the lobby code,
fluid). Space `--s-1` to `--s-6`. Corner `--r` (8 px) and `--r-lg` (14 px, frames and sheets). Lighting `--sheen` (a 1 px top highlight) and `--lift` (a soft drop shadow), both an empty shadow (`0 0 0 0 transparent`, never `none`, which is invalid inside a shadow list and would drop the frame's role rim) in high contrast; the canvas chip glass (`SHELL.glass`) follows `--glass` in both looks. Touch targets `--target` (48 px
minimum). Motion `--ease` (150 ms ease-out; 0 under reduced motion).

### World (built, Task 18)

Light from the north-west: a block's top is the base colour, its front is about
18 % darker and shifted toward rose, with a 12 % contact shadow. Wall hue varies
by room (never lilac); the room's `hue` meta picks it, defaulting to rose: `setHue` in
`src/client/tokens.ts` takes it from the reveal and every full view, and `HUE_WALLS`/`HUE_DUSK` hold the five sets.

| Token | Job | Status |
| --- | --- | --- |
| `--w-sky-hi`, `--w-sky-lo` | Sky gradient, peach to mint | built |
| `--w-water`, `--w-water-deep`, `--w-ripple` | Water, its depth, and the drifting ripple | built |
| `--w-floor`, `--w-floor-front`, `--w-seam` | Floor top, island slab front, tile seams | built |
| `--w-cliff-hi`, `--w-cliff-lo` | The 2-tile cliff into the water | built |
| `--w-wall-top`, `--w-wall-front`, `--w-wall-shade` | Wall top, front and shade | built |
| `--w-wall-top-<hue>`, `--w-wall-front-<hue>`, `--w-wall-shade-<hue>` (and `--dusk-wall-*-<hue>`), hue ∈ rose, teal, amber, violet, indigo | Each room's wall set; the unsuffixed three are rose; high contrast is one look for every hue | built |
| `--w-crate`, `--w-crate-front`, `--w-crate-brace` | Crates | built |
| `--w-door`, `--w-door-front`, `--w-door-seam` | Doors, which slide into the floor | built |
| `--w-plate`, `--w-plate-pressed` | Plates; pressed ones sink 3 px. A crate-only plate (`crateOnly`) is a near full-tile square in a `--w-crate-brace` frame with a crate's X brace and no number | built |
| `--w-glass`, `--w-glass-front` | Glass: translucent, two glints | built |
| `--w-vent`, `--w-vent-front`, `--w-vent-slat` | Vents: slatted | built |
| `--w-mist` | The veil over tiles outside line of sight | built |
| `--w-night`, `--w-night-rim` | Dark zones and their rim | built |
| `--w-line` | The 2 px outline of figures and interactables | built |
| `--w-laser` | Lasers | built |
| `--w-watch` | A camera or guard watching: the hatch | built |
| `--w-exit`, `--w-exit-flag` | The exit's arch and flag | built |
| `--w-code-red`, `--w-code-blue`, `--w-code-yellow`, `--w-code-green`, `--w-code-white`, `--w-code-black` | The six code colours (wires, bells, lamps, plaque swatches): each always outlined in `--w-line` and carrying its fixed pattern | built |
| `--w-steel`, `--w-steel-front`, `--w-brass` | Station furniture: steel bodies, brass rails, plates and bells | built |
| `--w-lamp` | A lit lamp, key or pip (always with rays or a number, never alone) | built |
| `--w-uv`, `--w-uv-ink` | The UV pool's wash, and the ink it shows | built |
| `--w-nv` | Night vision: the goggles' tint and lenses | built |
| `--w-card` | Card faces: the safe's dial, the radio's band, gear mats | built |
| `--w-dye-pink`, `--w-dye-mint`, `--w-dye-sky` | The dye pack's splats | built |

**Materials** (built, Tasks 104 and 105; ADR 0026 `proposed`): light comes from the north-west, and every tone is a world token mixed toward white or black (`mix` in `src/client/tokens.ts`), so no material brings a colour of its own. The painters are in `src/client/render/materials.ts`: stone flags in four tones with a 1.5 px `--w-seam` groove, a lit lip south-east of it and a faint speckle (boards in rooms 04 and 08, `FLOOR_OF`); a soft `--w-wall-shade` shade (at most 16 %) on the floor at a wall's foot; a wall top graded from its lit north-west corner with a bright lip along its south edge; a wall front darker toward the foot with a 1 px bevel along its top. The backdrop adds a sun glow in the top-left corner (it holds through a pan north or south: the last sky is drawn a few pixels stale until the horizon settles, then repainted), three strata across the cliff, a `--w-ripple` foam line with a white crest where the cliff meets the water, and a still reflection of the slab at 12 %. Floor and wall tiles are painted once into a per-tile **atlas** (`src/client/render/atlas.ts`) at the frame's device scale and copied after, except while the board tips at the start of a room or dusk is blending; `pnpm bench:frame --compare` holds the frame time to the committed baseline. **High contrast draws none of it**: today's flat fills only. Mist, night, cones and labels stay flat.

**The alarm's dusk set** (built, Task 18): `--dusk-sky-hi`, `--dusk-sky-lo`, `--dusk-water`, `--dusk-water-deep`, `--dusk-wall-top`, `--dusk-wall-front`, `--dusk-wall-shade`, `--dusk-floor`, `--dusk-floor-front` and `--dusk-seam` replace the day colours over about 600 ms while the alarm is on (instant under reduced motion or with no clock). Lasers, role colours and Show items do not change. **High contrast** (built): black sky and water, near-black floor, white walls, and the shell's own set; `setContrast` in `src/client/tokens.ts` swaps the canvas's copy, and dusk steps aside while it is on. The mist is half black. A 3 px outline on interactables is still to draw.

## 3. Type

One family, **Archivo** (variable, self-hosted, OFL), so there is no network
dependency. Roles by axis:

- **Expanded, black (width 125 %, weight 900):** exactly four lines: the home hero, the lobby code, the reveal's role line, and the room-cleared title and time. Every other heading is 100 %, 800.
- **Condensed, 700 (width 75 %):** HUD chips, wheel labels, receiver lines.
- **Regular:** body and captions.
- **Tabular figures** for timers and cooldown numbers.

Sentence case everywhere ("Alarm", not "ALARM").

**The ASCII-subset rule.** The shipped font is an ASCII subset, to stay small.
Anything outside it is **drawn, not typed**: arrows (`DirArrow`), role shapes
(`RoleShape`), gems and the "no sound" glyphs. Don't paste a typographic arrow or
a symbol into copy; it would fall back to another font and look wrong.

## 4. The world

### 4.1 The 3/4 recipe (built, Task 18)

- Axis-aligned grid, north up, about a 55° tilt: a floor tile's top face is 0.82 of a tile deep (`TILT.depth`), a wall's front 1.1 tiles tall (`TILT.wall`), crates and doors 0.7 (`TILT.block`). `toScreen` in `src/client/render/project.ts` is the one projection.
- Painter's order by row, north to south: the floor, then each row's blocks, then what stands in that row (doors, crates, flags, hazards, figures, marks) by row.
- `follow` is the game camera: about 18 tiles wide on desktop and 7 on a phone, clamped to the room. It keeps your avatar a third of the view in from the edge (`MAP.edgeMargin`), so it starts to follow well before you reach it, and it is **eased** by `easeCamera`, a critically damped spring with a velocity of its own (0.15 s), so its speed never changes in a single frame. The constant was measured, not chosen: over a walk the length of a 48-tile room with the teammates left behind, 0.3 s let the avatar within 6% of a phone window's edge and 0.4 s let it out; 0.15 s keeps it 14% (desktop) to 18% (phone) in, with the worst single-frame change at about a tenth of cruise speed. A jump (a restart) takes the target outright. `fit` shows the whole room (the home feeds).
- The room is one island slab with a 2-tile cliff into the water, under a peach-to-mint sky. The ripples drift unless motion is reduced.
- The floor is stone flags, or wood boards in rooms 04 and 08, with ambient occlusion at the foot of a wall to its north or west (drawn with the floor tile, so the floor's mist cuts it); see "Materials" in §2.
- A wall in front of a figure is see-through by distance: 35 % where it is right over them, fading smoothly to solid over about 1.6 tiles, so walking along a wall moves a soft window with you and no tile flips. The figure behind it is drawn again, outline only and dashed, over the wall, by the same figure code as the body, so it hops, squashes and leans with it.
- Glass is translucent, graded from 0.55 to 0.8 alpha downwards, with a sheen band, a bright top edge and its outline; a vent is opaque brushed steel with exactly four slats, each with a lit lip. Both are solid to bodies. A door has two inset panels a leaf with a bevel, a sheen on its top and its seam; a crate has a lit north-west corner, three grain lines, its X brace and a live drop shadow on the floor. Station bodies and brass rails are banded steel like the keepsakes; swatches, lamps, keys, numbers and outlines stay flat. High contrast draws all of these flat. Doors slide into the floor (an open one is a dashed slot). Plates sink 3 px when pressed. Loot is a gem that bobs. Marks are upright signposts.
- Lasers run at 0.6 of a tile with a floor shadow (off is dotted); a camera or guard's sight is a hatched cone on the floor when watching.

### 4.2 Figures (built, Tasks 18 and 19)

- A pill body in the role colour with a soft vertical gradient (a lighter crown, the role colour, a darker foot), a 2 px outline, a face disc whose eyes lean toward the facing, and a radial floor shadow (the outline colour at 22 % fading to nothing). The hat has a sheen arc. High contrast draws the flat role colour and a flat shadow.
- **The hat is the role's shape**: dome (circle), box (square), cone (triangle), sitting on the crown. The shape is therefore on the figure, not only in the colour.
- Your own avatar has a floor ring and a "You" chevron; a bot has an antenna.
- **Moving:** a hop of about 2 px at 2.5 Hz and a puff of dust every quarter second. **Blocked** against a wall: a 10 % squash toward the facing. **Pushing a crate** (blocked with a crate in line ahead): an 8° lean. **Reduced motion keeps facing only**: no hop, squash, lean or dust, and a frame with no clock is byte-stable.
- Your own figure turns the moment a key goes down and reads moving and blocked off the predicted position, so it is never a round trip behind. Other players' poses come from the view (`moving`, `blocked`, `facing`).
- **Can't see's own screen** is black with their dimmed (40 %) figure centred, facing the way they push, hopping while they walk and squashing when blocked. The server sends that seat only `you.motion`, which is no more than the footsteps and bump it already hears.

### 4.3 Hazards and objects (built, Task 18)

- **Camera:** a dashed cone when idle, a hatched cone when watching, its body on a bracket. **Guard:** a larger slate figure with a torch cone. **Laser:** see 4.1.
- **Plates** carry their number; sequence plates show it on the sign. **Exit:** a pale arch tile with its flag hatching. **Checkpoint:** an upright flag with three pips.

### 4.4 Glass, vents, mist, night (built, Tasks 18 and 20)

- **Glass** is translucent with glints: you see through it, sound doesn't pass. **Vents** are slatted: sound passes, sight doesn't. Neither lets a body through. (The "no sound" and "sound passes" marks on them are still to draw.)
- **Mist** veils everything outside your line of sight, under `--w-mist` at 60 % with a static stipple (half black under high contrast). You still know the layout; the server never sends what is in it. The edge of the light is the **true ray cast** from where you stand (`lightPolygon`): it runs exactly through the corners of walls, as a camera's or guard's cone does, with the same blockers as the server (walls, vents, closed doors; glass passes). The veil is **one region filled once**, with the light punched out of it (even-odd), so the edge has no steps and no tile seams. It is cast over the layout, which every sighted client already has, not from the server's `seen` tile set, which is symmetric shadowcasting and leaves out whole tiles the exact ray lights; `seen` still decides which *entities* you are told of. **A wall's top is never veiled**: it is left untouched, whatever the cone does. A wall's front (south face) is cut by a **vertical line** from where the light meets the wall's foot, since a shadow edge is a vertical plane; it is seen only from south of that line, and a front the light never reaches (a wall behind where it lands, or one in the map's last row seen from the north) is veiled whole. Glass and vents are cut the same way. A wire is always shown, never cut. What stands (stations, figures, lamps, bells) is cut by the **diagonal**: the cone's edges are rays on the floor from a wall corner, carried up the screen along the same diagonal, so a thing is veiled only on the dark side of one, straight across, whatever its geometry. Where a station overlaps the wall behind it, the part over the wall's front takes the wall's vertical cut. A camera bolted to a wall is cut by its wall's vertical line, with no top. A wire is **layout, shown at every distance**: the server sends it to every sighted seat as an entity of its own (`wire`, only its route, never the station's state), wherever the seat stands, and it stops at the wall's foot. A cache's dial has no wire. A station carries no name plate (the labels name it). **An open door's frame is never cut.** A camera's cone out of sight over ground you can see is drawn as one shape without the camera (ADR 0022); an idle one is dashed. Watchers are sent no `seen`, so they see the whole room clear.
- **Night** is a dark zone: `--w-night` with a rim along its edge. Only Show items, marks and your own ring are in it.
- **Marks** in a tile you can't see are drawn at 35 % through the mist: only a teammate's message, never room state.
- **Edge pills.** A face or mark from someone you can't see (or a mark placed off screen) is a glass pill at the screen edge, where the ray from the middle of the screen to them leaves it: their role shape, their name in the HUD's font, and the face (a 1.5 s plate) or the mark's glyph. The face goes after 1.5 s; the pill stays alone for 4 s, then fades. A sender in sight shows over their head instead.
  A door that opens off screen: a pill in the door's colour with "Door", no role shape, 4 s (ADR 0025).
  Two pills toward nearby places never touch: a later one steps along its edge until 18 px clear of the others (48 px between centres).

### 4.5 The start of a room (built, Task 109)

When everyone is ready the server sends `intro` and holds its first tick for 2400 ms (`INTRO_MS`), so the clock, the guards and the bots start when it ends. Meanwhile every page plays the staged start under the reveal (`introAt` in `src/client/intro.ts`):

1. **Hold**, 300 ms: the flat plan, as the reveal showed it.
2. **Tilt**, 900 ms, ease in-out: depth goes from a full tile to 0.82 and the walls grow from no height **north to south** (row 0 is whole at two thirds of the tilt, the last row at its end; doors, hatches, glass and vents grow with their row).
3. **Swoop**, 900 ms, ease in-out: the camera flies from the whole room to the game camera on you. It starts only once the board has tipped.
4. **Land**, 300 ms: your own figure hops once (a quarter of a tile) and one small `--ui` ring opens at your feet (`targetId: "landed"`, one of the two rings FR16 allows).

The reveal stays over it as the same element (its flat backdrop keeps drawing, nothing remounts), and its card, scrim and blur fade away over the hold and the tilt. The cover takes no clicks and is `inert`. Input is locked until the land ends (`.game[data-intro="playing" | "done"]`). A passed room restart replays it from the flat plan.

- **Reduced motion:** no tilt, swoop or hop frames. The 300 ms hold, then the cover cross-fades away over 300 ms; the land's ring is not drawn.
- **Can't see** has no world to watch: their screen is black throughout, and their dimmed figure fades in over the land.
- **Spectators** get the tilt; their camera already shows the whole room (or follows on a phone), so the swoop settles there.
- A page that loads mid-game (a reload) has no start; it is simply there.
- `Scene.rise`, `Scene.swoop` and `Scene.landing` (each 0 to 1) drive it; `LIVE` in `src/client/render/project.ts` is the projection a frame draws with (`wallAt(y)` the wall height of row y), and `TILT` is the finished one. The timeline scales to the server's `ms`, so `INTRO_MS=0` is done at once.

### 4.6 Labels (built, Task 22)

Room 1 (and, for the escape-room objects, every room: a station, gear, the hatch, bell, lamp, ink and held hands) carries glass chips with a leader line that name what each thing is for
(`src/client/labels.ts` picks them, `src/client/render/labels.ts` draws them). They are a
reference, not a notification: while a kind of thing (plate, crate, door, glass, vent, camera,
guard, exit, loot, and a cache's secret door, which has its own chip: "Secret door: it slid open from a hidden catch", never the ordinary door's plates line) is in your line of sight, one chip floats above the nearest of it on `--glass`
with a one-sentence job, in the HUD's font. Out of sight, the chip goes; back in sight, it returns.
At most three chips show on desktop and two on a phone (a canvas under 720 px), the nearest first.
Chips wrap, stay inside the frame, and move to the nearest free spot rather than overlap. The
escape-room objects are labelled in every room, the rest in the first room only, and the **Labels** setting (in the menu's Settings, on by default) turns them off.
Can't see has no map and gets none.

### 4.8 Stations, gear and signals (built, escape-room phase 02)

The object is the readout: nothing about a station shows anywhere else. They are gallery furniture
in the same 3/4 world, steel and brass, as quiet as a plate; the UV pool is the one bold effect.

- **One colour = one name = one pattern**: red plain, blue a stripe, yellow bands, green dots, white hatch, black chevrons. Every swatch is outlined in `--w-line`, so a pale fill on the cream floor (or a black one under high contrast) still has a 3:1 edge (`tokens.test.ts` checks it).
- **Parts:** floor pads with an arrow (`turnPad`); numbered floor keys with 1 to 3 pitch bars; numbered buttons; wall wires as patterned swatches under a brass rail; bells in brass with a code band and a number, tilting when struck; lamps lit with rays or hollow, numbered; vault sockets with a drawn symbol (`symbolGlyph`), never a letter. The part you stand on is outlined in `--ui` and sinks 3 px.
- **Where it shows:** a station's furniture is drawn wherever any of its parts is in sight; its state only where it shows it (the switches' lamps from the lamp room, never from the buttons).
- **Solved:** a brass tick plate over the anchor, which stays, and a goal ring. **Wrong:** the dye pack: a pastel cloud puffs from the station, every figure gets three blotches until the reset (`splat`), and the banner reads "Wrong wire. Back to the flag." ("Wrong code.", "Wrong note."). Failure is a toy, not the alarm.
- **Gear:** on the floor a card mat with a contact shadow and no bob, so it never reads as loot; on a hatch sill it sits at sill height. Carried, on the figure (goggles over the eyes, stethoscope round the neck, earpiece curl, torch at the hip), plus a shoulder badge at phone scale. A hand-over flies the glyph between the two over 250 ms (none under reduced motion).
- **UV pool:** `--w-uv` at 30 % inside a 2 px dashed ring along its rim (the ring is the rim only: no line runs in to the torch, `drawUv` traces it from the rays, not the torch point), cast with the walls; ink in `--w-uv-ink` outlined, clipped to the pool so only the lit part of a letter shows, however far the holder stands. An ink wider than the room to its left wall is shifted right until it starts on the wall's face. **Goggles:** the wearer's whole view tinted `--w-nv` with 8 % grain at 6 fps (static under reduced motion). High contrast: no wash or tint (`OVERLAY` in `tokens.ts`), a 3 px dashed white ring on the light (the only mark of it there) and a 2 px green inner frame.
- **A tug of war (escape-room phase 12, ADR 0019):** both hand-holders steer, and when they push opposite ways and the pair stalls, the slack hold arc is drawn straight, thicker (4 px) and crossed by three short strain ticks (`drawHold` with `pulling`): never told by colour alone, and no new token. Both figures carry `pulling`. Its sound is `pull`, a short low strain heard in the two holders' heads only, captioned "Pulled" with no direction.
- **UV ink (escape-room phase 12):** the words are wrapped to the light they sit in (a pool is at most 5 tiles across), never below 11 px, and written on the wall's face: the pool is cast over floor only, so the block's last line ends at the wall tile's top edge and the rest stand above it over the lit floor (`inkBox` in `gear.ts`, which the label chips also read, so no chip sits on a line). Room 7's ink is only a number (the wire to cut; `numbered` panels), so it fits; the wrap rule stays for any longer text, which can still lose the start of its first line where a wall cuts the pool.
- **Jammed (FR13):** a teaching station or a cache answered wrong ignores input for 3 s (`JAM_TICKS`). Its anchor is greyed under a `--w-mist` wash with a small bar hatched in `--w-line` diagonal stripes over it, like barrier tape (`jammedBar`), drawn while the view's `station.jammed` is set. The station is redrawn at the same moment, but there is no dye and no banner. Its sound is `jam`, two short low sawtooth pulses from the mistakes family (caption "Jammed"), heard within 6 tiles. An ordinary station never jams: its wrong answer is the dye pack.
- **Braille plate (FR6 to FR8, ADR 0023):** for the sighted, a `--w-brass` plaque flush with the floor, outlined in `--w-line`, studded with a fixed 2 by 3 pattern of `--w-line` dots, the same on every plate (`drawBraillePlate`): what it really carries is Can't see's alone and never sent to them. While a hand is on it (`state: "on"`) its outline is `--ui` and thicker; the read pulses one `--ui` ring (`detectFx`). Its sound is `tap`, two soft high sine taps (caption "Plate read"), heard within 4 tiles. The Act hint is "Read the plate".
- **Practice lever (escape-room phase 12):** a wide steel plate on the floor with a long handle thrown to the left (off, the word "Real") or the right (on, "Practice") and left there, so it never reads as the lamp switch's short post (`drawLever`). While it is on, the keys and bells of the stations that name it are drawn at 45 % (`PRACTICE_ALPHA`): still there, plainly not counting. It adds no colour. Its sounds are `lever` (a heavy two-part clunk) and `practice` (a short low thud, then the real rising chimes of the key or bell pressed at 60 % level, so a person hears which one they pressed and the thud keeps it from passing for a solve), so the dimming has a sound twin and the sound has a picture.
- **Links (escape-room phase 12):** a safe's back box and a music box's tune box are joined to their station by a thin dashed wire in the line colour at 35 % (`drawLink`, `linkPath`). It runs along wall tiles where a short wall route exists (no more than twice the Manhattan distance), else straight. It is drawn in the row of its southernmost point, after that row's wall blocks and before what stands in the row, so the walls it runs along never hide it; points on a wall tile sit on the wall's top. A safe's wire is drawn only when a wall, pane or vent lies on the straight line between its dial and its back box (an open-floor back needs none); a music box's wire ends in the middle of its bells, not at the first bell. A keypad has no remote tile and no wire; a keypad anchor draws no box, only its keys.
- **Clues (escape-room phase 03):** a sign's own words (a plaque) sit on a brass plate on the wall over its tile, wrapped to about four tiles wide, outlined, never below 11 px (`drawPlaque`). The switches' target card is a cream card on a stand with the station's lamp grid, lit lamps filled with rays and hollow ones outlined (`drawTargetCard`). A link's motif (moon, star, wave, key, eye, leaf; `motifGlyph`, a family apart from the vault's symbols) sits on a cream disc at the front corner of both stations it joins (`motifBadge`); the vault's order clue is a brass plate of its wings' motifs in socket order (`drawOrder`). A solved wing shows a card plate above it with its vault symbol. A teaching safe has a small lamp by its face: lit with rays on the right number, hollow otherwise.
- **Inspection plate (escape-room phase 14, Task 66):** a cache dial's back tile is a small steel plate set flush in the floor (`drawInspectionPlate`): outlined in `--w-line`, two rivets, a faint worn ring round it where someone has knelt. It is flat (nothing stands up from the floor, unlike the plinth under an ordinary safe's back box), unlabelled, and has no wire to it. It adds no token. Its sound is `hollow`, a low dropping sine with a thin ring above it, played in place of the step (yours) or the footsteps (a teammate's) while someone walks on it, captioned "hollow step" with a direction. Ordinary safes are unchanged, and `hollow` is deliberately left out of Can't see's briefing, which would announce that a cache exists.
- **Hatch:** a wall with a waist-high sill and a lintel on two posts, open between. **Bell:** brass on a bracket with its rope; it swings ±15° three times in 1.2 s when rung (a static tilt under reduced motion). **Lamp switch:** a steel post with a lever and a small bulb. **Holding hands:** a 2 px arc between the hands, a bead each end, an arrowhead toward the leader; the towed figure's eyes look at the leader.

### 4.7 The role frame (built)

The canvas sits in a bezel: a `--panel` frame with `--r-lg` corners and `--lift`, 6 px of padding,
and a `.recess` inside it (an inset shadow, so the canvas looks set in). A 36 px tab at the bezel's
top-left carries the role's shape in `--bg` on the role colour, and a short 64 × 2 px line in the same
colour runs along the top edge past it; a 1 px rim in the role colour goes all round. Why: you tell
whose screen is whose from across a room by the tab and the line, and the rim keeps the role colour
on every side without a heavy border. The side-job chip starts past the tab, never under it. A
spectator's bezel is dashed (a 2 px `--ui-muted` dashed outline inset on the bezel) with no rim and
no tab, since a watcher plays no role. The Can't-see viewport is
`--ink` with their own figure at the centre (see 4.2); the dim ring is only for a feed that has no figure to show.

## Components

Reuse these before drawing something new. The test checks each name exists.

- `RoleShape`: a role's shape in its colour, drawn so all three are the same visual size. `mono` takes the surrounding text colour. `outline` draws it hollow, stroked in the role's own colour (stroke 2.5 in the 28 box): a role held before, not now. In the crew row a filled shape means now and a hollow one means history, each in its role's colour: the coloured shape is the role this room, and the hollow 14 px shapes after the muted word "Played" are the roles played earlier this heist, labelled "Already played: …" for screen readers. Nothing played, no Played group. Use it anywhere a role is named.
- `BrailleCell`: one braille cell as an SVG, positions 1 2 3 down the left and 4 5 6 down the right. A raised dot is a filled `--ui` disc (`size` px across: 12 on the card, 7 in the key); a flat position is a 4 px hollow `--ui` ring. Raised and flat differ by shape, never colour, so high contrast keeps them apart.
- `BrailleCard`: Can't see's open plate, "felt, not lit": a thin `--ui` outline (corner `--r`) straight on black with no fill, top-centre just under the side-job chip (never over it), no Close button. Title "Plate under your hand"; in room 4 the teaching line "Raised dots, read left to right. Match each to the key."; the plate's cells, then the fixed key of 1 to 9, 0 and # as `BrailleCell`s with a label under each. `role="group"` named "Braille plate"; a polite status "Plate: N cells"; hidden text gives dot numbers only ("Cell 1: dots 3 4 5 6."), never the number. Cells appear left to right 60 ms apart; with reduced motion all at once. It closes the moment Can't see steps off. On a phone it lets touches through and the key wraps under the cells. A spectator following Can't see sees it too.
- `ReceiverLine`: who hears a method, by name ("Ana hears this · Bo can't"), shape and name together. Never a shape alone.
- `DirArrow`: an 8-way arrow, drawn, screen up is north. For captions and edge pills.
- `ConfirmButton`: asks first; the second press within 3 s acts. For anything that wipes a room or ends a session.
- `PlayerRow`: a person in the lobby: name, setup chips, plays N.
- `YourSetup`: a person's own real-life answers; the lobby and `/preferences` both use it.
- `PreferencesSheet`: the preferences without leaving the lobby; every change is saved and sent as it is made.
- `RoleReveal`: the reveal screen: what you send and get, in the wheel's words, with the crew's ready states. The room behind it is drawn in dusk (see section 1); its card and crew are lit panels.
- `Feeds`: the home page's three live windows, one per role: a `--panel` bezel with `--lift`, the canvas recessed, captions over it.
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
- `RoomCleared`: the room-end card, one centred column (`.cleared`, 44rem or the frame): the title with Time and Loot as two stats, a card per player (role shape, name, what they did; the same job done twice is one line with a count), the buttons, then the room's board on the same middle. Cards sit side by side while the column fits three and stack on a phone. A teammate in a credit line is a `{seat}` token the page fills with a nickname, so the server never has one. The comms map (`CommsMap`) sits after the buttons and before the board, so the buttons stay in view.
- `SideJobTile`: the cleared card's side-job tile, after the credits and before the buttons, one box (`.side-job-tile`, full column width, a fixed minimum height) in three states so the card never changes height with the result. **Taken:** solid `--ui` outline, the item on its `KeepsakePlate`, a drawn tick and "Ana took the gold watch. Bo opened the way. Worth 1 loot." ("Ana opened the vault and took the gold watch." when the owner opened it too). **Opened but left behind:** dashed `--ui-muted` outline, an empty plate, the item named because it was seen. **Not found:** the same dashed box and an empty plate, the riddle and no item name. Names come from the crew; an empty seat reads "A teammate". Text wraps. A room with no side job has no tile.
- `KeepsakeShelf`: on the heist-complete card above the rank line, one `KeepsakePlate` per room that had a side job, in room order, under "Side jobs N of M". Every slot, taken or missed, is the same three lines: the room's title (bold), "Room 7" (muted), then the item's name or "Not found" (italic for a miss), so no slot wraps differently from its neighbours. A missed one is an empty dashed plate and gives nothing away. Only a take counts as found; opening the vault does not. Plates wrap in a grid and never clip.
- `CommsMap`: on the cleared card (and the heist-complete card, for the last room), the crew as a triangle (role shape and name at each corner, seat 0 on top) with an arrow each way between every two: thickness 2 to 8 px by share of the busiest, its tally beside it, a thin dashed line where nothing went. Each arrow is its own stop (`role="button"`, `tabindex=0`, `aria-pressed` while lit, labelled "Bo to Cy: callout 10 · voice 45 s"): pointing at it, tapping it or tabbing to it turns it `--goal` and the line under the map breaks it down by method. There are no separate buttons. Messages are counted; voice is counted as time ("45 s", "2 min 5 s"), from the frames the server relays at 60 ms each, so it means the same to someone who holds the mic open as to someone who taps it. For thickness a message weighs one and every 5 s of voice weighs one more. The summary is one line naming the busiest direction ("Most went Bo → Ana."). Counts, methods and time only, never what was said; names come from the crew in the browser.
- `RoomBoard`: on the cleared card, this room's top 5 (team, time, loot) with this team's row outlined in `--goal` and bold (never colour alone); a run outside them gets a sixth "You" line with its rank; nobody before you says "First clear of this room". "Full leaderboard" opens `LeaderboardPanel`.
- `LeaderboardPanel`: the leaderboard as a modal inside the game (tabs, Close, Escape), from `/leaderboard.json`, so nobody leaves their seat to look. Opened from `RoomBoard` and from "See the leaderboard" on the heist-complete card.
- `GearGlyph`: a gear item drawn (goggles, stethoscope, earpiece, UV torch), the HUD's mirror of the canvas `gearGlyph`. In the crew row it shows what each teammate carries. Always with the item's name for screen readers.
- `GearSlot`: your own gear. On a keyboard a glass chip at the world's bottom-right ("Goggles", "G take, give, swap or drop"), the Act hint to its left; on a phone a 48 px button at the same corner, held to give or drop (`data-gear`). The dock is inside the frame, above the captions: the chat box and the touch controls are below the frame, so it never touches them.
- `ActHint`: what Space will do where you stand, in `view.act`'s words only ("Cut the blue wire"; "Cut wire 2" for Can't see). On a phone the Act button says it instead.
- `LampLight`: the lamp's flash in a sighted HUD, four rays and the puller's role shape, for a second.
- `ItemGlyph`: one of the six keepsakes a cache holds (gold watch, ledger, signet ring, silver goblet, fountain pen, pearl necklace), drawn as a stack of layers on a 64 grid (`src/client/items.ts`) that the canvas's `drawItem` reads too. Realistic rather than flat, lit from the north-west like the world: bodies are metal (a banded gradient: a lit edge, a dark band, a second light), matte (leather, paper) or pearl (radial), each with an edge tinted from its own token instead of the line colour, a bevel's worth of light and shade laid over them, a soft south-east drop shadow, and fine ink (a watch's hands and hour marks, a necklace's chain). Every tone is a world token (`--w-brass`, `--w-card`, `--w-steel`, `--w-crate-brace`, `--w-code-red`, `--w-code-black`) mixed toward white or black, so no new colour exists. Fine layers drop out at small sizes, and ink is never thinner than about 1.4 px on screen, so each item still reads at 24 px. High contrast is flat: plain token fills, `--w-line` edges, no gradient, shadow or shine. Decorative: the name goes beside it.
- `KeepsakePlate`: the plate an item sits on: `--w-card` face, `--w-brass` rim, `--w-line` outline. A missed one is the same plate empty with a dashed `--ui-muted` rim and no item name, so found and missed differ by line and shape, never colour alone.
- `MotifGlyph`: one of the six motifs (moon, star, wave, key, eye, leaf) as a flat shape in the text colour on a 24 grid, the HUD's mirror of the canvas `motifGlyph`. Shape alone says which; never colour. Decorative: the riddle beside it is the text.
- `SideJob`: your private side job, a glass chip at the world's top-left, for its owner alone, in four states. **Hidden or open:** the motif at 24 px, "Side job" and the riddle; on a phone the label alone, a tap shows the line. **In the vault:** the keepsake on its `KeepsakePlate` at 32 px, its name and "Waiting in the vault", with no tick, because nothing counts until it is taken. **Taken:** the item from your keepsake slot, its name beside a drawn tick and "Taken by you"; it pulses once as it lands (a 600 ms scale, none under reduced motion). The two later states do not expand, since there is nothing more to read. The chip is at least 48 px tall; names wrap, never clip.
- The reveal's side-job row (`.reveal-cache`, in `RoleReveal`): the owner's motif at 48 px, "Your side job", the riddle and "Only you can read this". The other two seats have no row.
- The cache moment (`.cache-moment`): a glass card at the top centre of the map for 4 s that never blocks play, like the vote card. It carries the words of the team-wide `cacheEvent`, so every role reads the same: "Something opened" (a secret door slid, naming nobody), "Bo's side job open: the gold watch" (the vault door slid) and "Bo took the gold watch" (a take, which is also the loot cue and counts the loot).

Glass chips (anything over the world) sit on `--glass`.

**Canvas helpers** (not components; in `src/client/render/`): `codeSwatch` (a code colour with its
pattern and outline), `turnPad` (a floor pad with its arrow), `symbolGlyph` (a vault symbol),
`splat` (a dye blotch), and `gearGlyph` (a gear item, which the HUD's `GearGlyph` will mirror), and `drawItem` (a keepsake, the canvas half of `ItemGlyph`), `drawKeepsake` (the item standing in an open vault: on a low stone plinth in `--w-card` and `--w-steel-front`, with a soft contact shadow, and no bob, so it never reads as the loot diamond), `drawSlide` (a secret door sinking into the floor), `drawMotifTile` (a cache's motif tile: a card square flush with the floor, the symbol in `--w-line`, drawn the same open or not so only the riddle tells the right one from a decoy).

## 5. Motion

| Thing | Duration |
| --- | --- |
| UI transitions | `--ease`: 150 ms ease-out |
| Wheel draws after a still hold | 200 ms; a flick of 24 px before then sends undrawn |
| Face pop over its sender | 1.5 s; a mark fades over 8 s |
| Reveal shape pops | 400 ms; a role swap morphs over 600 ms |
| Live light | pulses once a second |
| Alarm | a steady border and banner, a pulse of about 1 Hz |
| Start of a room | 300 ms hold, 900 ms tilt, 900 ms swoop, 300 ms land (2.4 s); reduced motion: the hold, then a 300 ms cross-fade |
| Dusk palette | 600 ms; instant under reduced motion |
| Secret door (chamber or vault) | slides into the floor over 600 ms with a dust puff; reduced motion: a 300 ms cross-fade, no slide; the dust only fades |
| Keepsake taken | the item lifts off its plinth and fades over 1 s with a spark burst and a `--goal` ring; reduced motion: it fades in place |
| Taken side-job chip | one 600 ms pulse; none under reduced motion (the vault chip does not pulse) |

**Menu sounds** (client only; not `SoundCue`s, so no parity row): a soft tick or chime for pressing, never for play (the wheel, the touch zones, the canvas, the gear slot and the talk bar's buttons are marked `data-no-ui-sound`; nothing sounds while the audio context is locked; the lobby's join and leave chimes stop once the game is on). Switched by `Settings.menuSounds` (on by default, "Menu sounds" in both settings places), separate from game sound. Each has a picture twin, because a sound alone would tell the hearing something the rest cannot see:

| Kind | Sound (`UI_PLANS` in `src/client/uiSound.ts`) | Picture twin |
| --- | --- | --- |
| `press` | a 50 ms sine tick sliding 700 to 560 Hz, on any `button` click outside the game canvas, the wheel and the touch zone | the press itself (the button's own state) |
| `toggle-on` / `toggle-off` | two sine notes, rising (520 then 780 Hz) for on, falling for off | the checkbox mark |
| `error` | one low triangle blip, 180 falling to 130 Hz | the error text beside the field |
| `join` / `leave` | two triangle notes, rising (C5 then G5) for a join, falling for a leave | the joined row's glow (below); a leave has the row going |
| `reveal` | three rising sines (E4, B4, E5) when your role appears | the reveal card itself |
| `ready` | one soft high sine (880 Hz), when a teammate (not you) is ready | the crew row's "Ready" mark pulses once |
| `all-ready` | four rising triangle notes ending on C6, as the room starts | the start of the room under the reveal |

**Row glow and ready pulse:** a lobby row that has just joined gets a 2 px `--ui` outline, inset so it never reaches the row below, fading over 1 s; the crew row's state mark scales down from 1.25 over 1 s once. Under reduced motion neither animates: the glow is a still outline for 1 s and the pulse a still outline.

**Masking noise** (Can't hear, `Settings.maskNoise`, picked in both settings places and applied at once; a changed bed cross-fades over about 300 ms): three synthesised 6 s beds in `src/client/maskBeds.ts`, each looped without a seam and normalised to the same level. **Brown** (the original: a leaky sum of white noise, low and even); **Rain** (noise band-passed 0.9 to 7 kHz, with sparse short droplet pings at random 2 to 5 kHz pitch); **Café** (pink noise band-passed 250 Hz to 2.5 kHz, a slow swell, and a faint high clink every few seconds).

**Door sound** (`door`, team-wide, ADR 0025): an unlock, not a click: a short band-passed noise burst (the bolt, about 120 ms) then a low sine thunk (about 90 Hz over 180 ms), panned toward the door at full gain, caption "door unlocked" with its direction.

**Cache sounds** (`uncover`, `stash`; team-wide, like `solved`): the uncover is one soft low thunk (a sine falling from 150 to 90 Hz and a dull knock); the stash is two soft rising triangle notes about half a second long, a fifth apart. Neither is the `solved` arpeggio (three rising sines) or the `dye` pomf. High contrast: the tile draws from the same world tokens, so it remaps by itself, and the item itself is flat (see `ItemGlyph`).

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
- Sentence case. No exclamation marks. "Room cleared". The canvas banner says "Alarm".
- Say what is true now and what to do: "Dark on purpose. Listen."; "Tap where, in sight".
- A refusal says why: "You can't send clips. Ana and Cy can."
- A vote says how it ended: "Restarting the room.", "Not restarted: Bo kept playing."
- A wire plaque from room 4 on is a riddle, not an instruction: an image or a count that the wires in
  front of you answer (`One sky among them: sever it.`). It names no colour or position the plain rule
  would not, it is one sentence, and it never uses arithmetic beyond one. Rooms 1 to 3 and teaching
  stations keep the plain rule.
