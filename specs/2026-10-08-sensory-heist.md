# Sensory heist: a three-player co-op game with missing channels

- **Date:** 2026-10-08
- **Status:** Approved
- **Approved by user:** yes — 2026-10-08
- **Replaces:** `specs/2026-10-06-shared-pantry.md` (archived at tag `archive/pantry-2026-10-08`)

## 1. Problem / intent

The final-project brief asks for a multi-user, real-time website that's good,
designed for co-presence: "the app should be more interesting because other
people are using it at the same time", with the capstone showcase (a room full
of people using it at once) as the situation to design for. The pantry app
answered co-presence weakly (households talk in person; the app stayed out of
the way), it was my third food-tracking prototype, and the domain kept
producing small, tiring problems. The convenor allowed a change of idea; one
day of pantry work is abandoned, and the process (harness, skills, logging,
checks) carries over.

The new app is a browser co-op game for exactly three players, based on the
viral trend of friends playing "deaf, blind and mute" together. Each player
takes a role named by a missing channel: **Can't see**, **Can't hear**,
**Can't speak**. The game enforces each limit on that player's own screen and
speakers. The team crosses a top-down heist (loot, guards, cameras, lasers)
whose rooms require three things to happen in three places at once, so every
player must act, and information has to travel along a broken chain:

```
Can't speak ──(stamps, emoji, gestures)──▶ Can't hear ──(voice/text)──▶ Can't see
     ▲                                                                     │
     └──────────────────────────(voice/text)───────────────────────────────┘
Can't speak ──(soundboard ONLY)──▶ Can't see
```

The fun is the chaos of getting information across that chain. Normal game
tropes (rooms, loot, checkpoints, a leaderboard) are deliberate, so players
focus on the one unusual mechanic. Inspirations: Pico Park (minimal flat
geometry, co-op), Fireboy and Watergirl (asymmetric co-op), Monaco (top-down
heist).

Framing: the game simulates *missing a channel*, never a person. Labels name
the constraint, never an identity. The README addresses the known critique of
disability simulation (it can produce pity rather than understanding) and
offers captions to anyone as a real accessibility setting, separate from the
roles.

## 2. Requirements

### 2.1 Functional requirements

**Lobbies and people**

1. A person is an anonymous device (hashed device token in a cookie) plus a
   nickname chosen per lobby. No accounts, no passwords, no email (ADR 0008).
2. Home offers: Create lobby, Join with a 4-letter code (alphabet excludes I,
   O, L), a live list of open lobbies with seat counts, and a Leaderboard link.
3. A lobby has three seats and any number of spectators. A 4th+ joiner chooses
   Watch or Start a new team. Seat changes reach every open session within
   about a second.
4. The host sets the team name and the lobby settings, and presses Start.
   Start fills empty seats with bots and says how many ("Start (1 bot fills)").
5. Lobby not found, lobby full, server full, and reconnecting each have a
   named state with one next action.

**Real-life mode (host wizard)**

6. The host can open a 3-question wizard: same room? does the Can't-hear
   player have headphones? do the others? Answers set presets, each shown as
   one plain sentence with its own override toggle:
   - Can't-hear player: masking noise in their headphones (the app deafens
     them, as the black screen blinds the Can't-see player).
   - Others: captions on, game sound off (when they lack headphones).
   - In-app voice off (people talk out loud).
7. Speaking restrictions in person are an honour system; the README says so.

**Roles and the heist**

8. A heist is 3 rooms played in order: Loading Dock (tutorial), Cameras and
   lasers, Vault (code and a darkness/alarm environment flip). Each room
   assigns roles afresh so everyone rotates through all three. A role reveal
   precedes each room ("You can't speak · You can send: Sound, Show · You
   hear: everything"); the room starts when all humans press Ready.
9. Roles have **no abilities**. They differ only in what they perceive and
   what they can send. Any player can push any crate, press any button, hold
   any station.
10. Rooms are top-down. Each room contains at least one beat that needs three
    stations held or used at the same time in three places.
11. Environment flips shift the advantage without a rule: darkness/smoke
    removes sight (sighted players lose the map; the Can't-see player is
    unaffected); a loud alarm drowns game audio (the Can't-hear player is
    unaffected).
12. Threats: guard patrols (sight cone), CCTV cameras (sweeping cone), lasers.
    Being caught returns the team to the last checkpoint. Checkpoints sit
    inside rooms.
13. Loot is optional and adds to the score. A room clears when all three
    players reach the exit.
14. Design rule: any safe window that relies on a spoken cue lasts at least
    2 s. Tight timing is left to sighted players acting on what they see.

**Perception (server-enforced, ADR 0007)**

15. Each client receives only what its role can perceive:
    - Can't see: no tiles, hazards, station states, stamps, emoji or other
      players' positions. Receives positional audio cues (stereo-panned
      footsteps, hums when standing on a station, clicks when it activates),
      Say messages and soundboard clips. The screen is black with a dim ring
      for their own avatar, always centred (no world position shown).
    - Can't hear: the full map and all visual events; no audio of any kind.
    - Can't speak: the full map, all visual events and all audio. No secret
      layer: it sees exactly what Can't hear sees.
    - Spectators: the full map; audio follows the player they choose to watch.

**Communication channels**

16. Three channel families, the same rules for humans and bots:

    | Family | Contents | Who can send | Who receives |
    |---|---|---|---|
    | Say | callout grid, free text, voice | Can't see, Can't hear | Can't see, Can't speak |
    | Sound | soundboard (meme clips) | everyone | Can't see, Can't speak |
    | Show | emoji faces, stamps | everyone | Can't hear, Can't speak |

17. Callouts are a 3×3 grid: Push, ↑, Here / ←, Stop, → / Wait, ↓, Go.
18. Free text sent to the Can't-see player is read aloud with the browser's
    speech synthesis. The Can't-speak player reads it as text (and hears it
    when audio is on).
19. Voice is push-to-talk, relayed through the server only to roles that can
    hear (ADR 0010). Frames that arrive late are dropped. Measured latency is
    shown as a "voice lagging" state when it degrades and is logged.
20. Emoji (at most 12 bluemoji faces) pop above the sender for 1.5 s. Stamps
    (four arrows, X, ?, !, door, key) are placed at the sender's feet and fade
    over about 8 s.
21. Cooldowns (tunable constants): soundboard 3 s, emoji 1.5 s, stamps 1 s.
    The server enforces them. A cooldown is shown with a countdown number, not
    colour alone.
22. A Can't-see player may send Show items; nobody they can reach will see
    them. That is intended.
23. A denied microphone hides only voice, with a one-line reason; callouts and
    text remain.

**Bots**

24. With fewer than 3 humans, bots fill the empty seats. Bots are heuristic,
    not LLMs: per-room hint graphs (waypoints, station jobs, hazard timing).
25. Bots communicate only through the channels their role allows, using
    canned callouts and phrases with variation, under the same cooldowns.
26. A Can't-see bot acts on callouts it receives (←, Stop, Go, Here...). It
    does not parse free text.
27. The same bots act as the room solver: three bots must clear every room
    (a `spec/` check).

**Disconnects**

28. When a player's connection drops mid-room, the game pauses for everyone
    with "Waiting for <name> (0:45)". If they reconnect (same device token),
    they take back their seat and the game resumes ("<name> is back").
29. After 45 s, the host chooses: let a bot take over, or back to lobby.
    Others see "Waiting for the host to choose".

**Results and persistence (ADR 0009)**

30. Clearing a room shows time and loot. Finishing the heist shows total time,
    loot, team name, the three nicknames (bots badged) and rank.
31. Heist records (per room and full heist: team name, nicknames, time, loot,
    date) persist in SQLite on `/data` and survive restarts and redeploys.
    Lobbies and live games live in memory only and are lost on restart.
32. The leaderboard has tabs for Full heist and Rooms 1–3, ranked by time,
    shown as numbers (not medal colours).

**Course-fixed**

33. Answers at `/`; README published in full at `/readme/`.
34. Server-side logging of what users do (week 11 crit), with a live view
    (log tail or stats page). What is logged is decided then, under the
    existing `redact` allowlist rule: never chat text, voice or nicknames
    beyond what the leaderboard shows.

### 2.2 Non-functional requirements

- **Real time:** server-authoritative simulation at about 20 ticks per second
  over WebSockets. Lobby and seat changes reach every open session within
  about 1 s. Your own avatar moves immediately (client prediction), reconciled
  by the server.
- **Voice latency:** target under 250 ms end to end on campus Wi-Fi, measured
  from server timestamps.
- **Viewports:** phone portrait (~375px) is the designed layout, with a
  virtual joystick and Act button; landscape works with the tray at the right
  edge. Desktop (~1280px) with keyboard. Both are marking viewports.
- **Keyboard:** WASD/arrows to move, Space to act, 1/2/3 to open Say/Sound/Show,
  then 1–9 to pick, V to hold-to-talk, Enter for text, Esc to close, hold Tab
  for a key cheat sheet. Faces: a hotbar of 6 on keys 1–6 inside the Show
  sheet; the rest by pointer.
- **Accessibility:** never colour alone (role = colour + shape; hazards
  hatched). WCAG AA text contrast. `prefers-reduced-motion`: no shake, no
  flicker, cross-fades instead of morphs. Flashing never exceeds 3 per second
  (WCAG 2.3.1). Captions available to anyone as a setting (off by default for
  Can't see). A high-contrast toggle for bright halls.
- **Resources:** one 256 MB shared-cpu machine. Showcase load target: about 10
  concurrent lobbies (30 players plus spectators).
- **Assets:** shapes drawn in code, no sprite sheets. The only outside assets
  are bluemoji faces and Pixabay clips, each checked and credited in
  `CREDITS.md` and on a credits screen.

### 2.3 Out of scope

Each to be named in the README's "what I chose not to build":

- The driving interlude scene; any theme other than the heist.
- Rooms beyond 3 in v1 (rooms 4+ are designed and parked in the backlog).
- Drawing as a channel.
- Procedural or randomised rooms.
- A level editor or player-made rooms.
- Team-vs-team modes beyond racing on the shared leaderboard.
- Peer-to-peer (WebRTC) voice.
- Role abilities of any kind (revisit only if playtests show the Can't-see
  player coasting).
- A full light theme.
- Accounts, passkeys, email.
- Persisting lobbies or games across restarts.

### 2.4 Assumptions (confirmed)

| Assumption | How confirmed |
| --- | --- |
| Changing the project idea is allowed | User: the convenor allowed it |
| Brief: multi-user, real-time (~1 s), persists, works at both marking viewports; design for the showcase | Read `assessments/final-project` from the course API, 2026-10-08 |
| Week 10 crit needs real-time deployed; week 11 needs server-side logging with a live view | Read crit 09/10 specs from the course API |
| One 256 MB machine, `/data` is the only persistent storage | Read `fly.toml` |
| WebSocket-relayed voice is ~100–200 ms with small WebCodecs Opus frames; the human cue loop is ~1–1.5 s | Reasoned estimate, accepted by user; **to be measured** (logged latency) |
| Pixabay clips may be bundled in a free game | User read the licence; **verify each clip and record it in CREDITS.md before bundling** |
| bluemoji faces are free for non-commercial use with credit | DESIGN.md note; **verify before bundling** |
| Archivo is OFL and has tabular figures | **Verify before locking the font**; otherwise pick another OFL family |

## 3. Existing context

- Repo `comp4020-final-attwelvedev`: Astro 7 on Node (`@astrojs/node`), Preact
  islands, better-sqlite3 + Drizzle, Vitest, Playwright, axe-core, Biome
  (ADR 0001). The pantry app, its specs and plans are archived, not ported.
- What carries over: the harness (`harness/claude-settings.json`, hooks,
  permissions), `pnpm check` / `check:evidence`, request logging in
  `src/middleware.ts` + `src/lib/log.ts` (`redact` allowlist) +
  `src/lib/requestLog.ts`, `/stats`, `/readme/` rendering, the
  brainstorm/plan/execute skills, `PROCESS_LOG.md`, `specs/backlog.md`.
- `CLAUDE.md`'s "Shape of the app", "Live changes" and "Item values" sections
  describe the pantry and must be rewritten for the game.
- ADRs 0002–0006 are pantry decisions; 0007–0010 (this pivot) supersede them.
- `doc/prompts/DESIGN.md` and `doc/prompts/LEVEL_FORMAT.md` were the starting
  drafts. LEVEL_FORMAT was side-on; the game is now top-down, so the format
  keeps its ideas (one text file per room, ASCII grid, metadata block,
  per-object `visible_to`/`audible_to`, beats, a solver bot clears it first)
  but drops gravity and push strength.
- The working tree had uncommitted phase-05a pantry edits on 2026-10-08 (see §6).

## 4. Design

**Shape.** One Node process (ADR 0001) serves the Astro pages (home, lobby,
leaderboard, `/readme/`, `/stats`) and a WebSocket endpoint (`ws`) for lobbies
and games (ADR 0007). The game itself is a single client module drawing to a
canvas; Astro renders the shell.

**Simulation.** The game is a deterministic, headless simulation (state +
inputs → next state) with no rendering or networking inside it. The server
runs one per active room at ~20 Hz. Tests, the room linter and the bots all
drive the same simulation, so "three bots clear the room" is a plain unit test.

**Perception filter.** Each tick, the server builds a per-role view from the
full state, using each object's `visible_to` / `audible_to` and the role
tables in §2.1. Channel messages pass through the same filter. Clients never
receive what their role can't perceive; this is the anti-cheat and the
testable promise (ADR 0007).

**Rooms.** One text file per room (ASCII grid + metadata), top-down, 32px
tiles, linted in `pnpm check` (legend, links, spawns, a station beat present,
cue windows ≥ 2 s, solvable by bots). Beats name their intent per role.

**Voice.** Push-to-talk captures the microphone, encodes Opus frames with
WebCodecs, and sends them on the game socket; the server forwards each frame
only to roles that can hear and drops late frames (ADR 0010).

**Persistence.** SQLite on `/data` holds heist records only (ADR 0009). The
device token is a hashed cookie for rejoining a seat (ADR 0008).

**Alternatives seriously considered**

- Side-on platformer (Pico Park / Fireboy literal): rejected; precise jumps
  are miserable for a Can't-see player and with latency, cones read better
  top-down, and a phone joystick is simpler.
- Soft abilities (Can't see pushes harder; Can't speak sees a secret layer)
  or role-locked objects: rejected for "no rules beyond the senses"; the
  perception graph plus three-station beats already force each role to act.
- Peer-to-peer WebRTC voice: rejected; needs third-party TURN on campus
  networks, and the deaf rule would only be enforced by the client.
- SSE + POST (the pantry's ADR 0004): can't carry ~20 Hz input sensibly.
- Campaign progress or player-made rooms as the persisted thing: weaker
  co-presence payoff / far larger build than a leaderboard.
- Procedural rooms: high replay, but solvability and good design are hard to
  guarantee; rooms are hand-designed and grow over time instead.

### 4.1 UI design

From a frontend-design proposal (first pass), amended by the user: the
channel indicator became an arrow list of receivers (the proposal's
filled/hollow pip row didn't read); the Can't-speak secret layer was removed;
the Can't-see HUD shows no stations/hazards; captions for Can't see are
allowed, off by default.

**Identity.** Two ideas carry the look; everything else is quiet flat
geometry on dark:

1. **Role frame:** the map viewport has a 4px border in the role colour with
   the role's shape notched into the top-left corner, readable from 3 m.
2. **Receiver arrows:** each tray tile shows who receives it, e.g. `→ ● ▲`
   ("goes to Can't see and Can't speak"). Your own shape is highlighted when
   you receive it. A family you can't send on is hatched with a slash and
   "Can't send", never hidden.

**Tokens (changes to DESIGN.md).**

| Token | Value | Change and why |
|---|---|---|
| `bg` | #0B1220 | unchanged |
| `panel` | #141E36 | new: tray and sheets |
| `ink` | #000000 | new: Can't-see viewport |
| role Can't see | #F2A93B, circle | unchanged |
| role Can't hear | #4DB3FF, square | was teal #2EC4B6, too close to `goal` green |
| role Can't speak | #9B7EDE, triangle | unchanged (verify ≥4.5:1) |
| `checkpoint` | `ui` white, flag shape | was sky blue, next to the new deaf blue |
| `camera-light` | #FFD166, hatched cone | hatch, since amber and yellow are close |
| captions | `ui` on `bg` at 85% | was 70%, missed AA over a busy map |
| font | Archivo variable (OFL, self-hosted) | one family: expanded black for the lobby code and titles, condensed for HUD chips, regular for body; tabular figures for timers |
| type scale | 14 / 18 / 28 / 48, code `clamp(72px, 22vw, 160px)` | adds 48 and a code size |
| focus ring | 3px `ui`, 2px `bg` offset | new |

Touch targets ≥ 48px. Sentence case everywhere. Flashing capped at 3/s;
the alarm is a steady border + banner with a ~1 Hz pulse (static under
reduced motion). High-contrast toggle boosts edges, text and fills.

**In-game HUD, phone portrait.** Top bar 44px (role, timer, loot, connection
pill "● Live / ◐ Weak 180 ms / ○ Offline"), crew/objective strip 28px, map,
tray 56px, control zone ~150px (joystick bottom-left, Act bottom-right; the
tray never overlaps them).

```
 Can't hear                     Can't see                      Can't speak
┌─────────────────────────┐   ┌─────────────────────────┐   ┌─────────────────────────┐
│■ Can't hear 1:42 ◆3 Live│   │● Can't see 1:42 ◆3 Live │   │▲ Can't speak 1:42 ◆3    │
│●Ana [■You] ▲Bo bot CP2/3│   │ No map. Listen.  CP 2/3 │   │●Ana ■Bo [▲You]   CP 2/3 │
│╔■══════════════════════╗│   │╔●══════════════════════╗│   │╔▲══════════════════════╗│
│║ stations [A■][B○][C○] ║│   │║                       ║│   │║ stations [A○][B▲][C○] ║│
│║ full top-down map     ║│   │║        ( ○ )          ║│   │║ full map              ║│
│║ hatched camera cone   ║│   │║  dim self, centred    ║│   │║ [■ Left] [steps ←]    ║│
│║ stamp ?  face pop     ║│   │║  [Bo: left] (opt.)    ║│   │║ (captions if on)      ║│
│╚══════════════════════╝ │   │╚══════════════════════╝ │   │╚══════════════════════╝ │
│ Say    Sound   Show     │   │ Say    Sound   Show     │   │ Say░░  Sound   Show     │
│ → ● ▲  → ● ▲   → ■ ▲    │   │ → ● ▲  → ● ▲   → ■ ▲    │   │ Can't  → ● ▲   → ■ ▲    │
│ (joystick)      (Act)   │   │ (joystick)      (Act)   │   │ send                    │
└─────────────────────────┘   └─────────────────────────┘   │ (joystick)      (Act)   │
                                                            └─────────────────────────┘
```

**In-game HUD, desktop.** Map centred, fit to height; crew top-left; tray
bottom-centre with key hints.

```
┌ ■ Can't hear · Loading Dock ───────────── 1:42   ◆ 3   CP 2/3   ● Live ┐
│ Crew:  ●Ana  [■You]  ▲Bo (bot)                                         │
│╔■═════════════════════════════════════════════════════════════════════╗│
││ stations  [A ■ held] [B ○] [C ○]                                     ││
││                    top-down map, hatched camera cone                  ││
│╚══════════════════════════════════════════════════════════════════════╝│
│    ┌1 Say ──────┐ ┌2 Sound ────┐ ┌3 Show ─────┐   V voice  Enter text   │
│    │ → ● ▲      │ │ → ● ▲      │ │ → ■ ▲      │   WASD move  Space act  │
│    └────────────┘ └────────────┘ └────────────┘   Hold Tab: keys        │
└────────────────────────────────────────────────────────────────────────┘
```

Can't see and Can't speak follow the same desktop layout with their phone
content (black map with centred ring; hatched Say with "V and Enter disabled").

**Comms sheets (phone).** Tapping a tile opens a sheet above the tray, over
the lower map, never covering the joystick or Act; movement continues. Header:
family name, receiver arrows, one line ("You hear replies here" / "Can't
send. You can still hear."). Say: the 3×3 callout grid, then hold-to-talk and
a text button (one-line field above the keyboard). Sound: 2×4 grid with a
radial + numeric cooldown. Show: tabs Faces (4×3) and Stamps (3×3). Tapping a
disabled tile shows a one-line toast ("Can't speak: no voice, text or
callouts"). Sending closes the sheet (setting: keep open). While typing,
movement pauses and a "typing" badge shows over the avatar.

**Home** (desktop: create/join left, open lobbies + leaderboard right)

```
┌──────────────────────────────┐
│ <wordmark>                   │
│ [ Create lobby            ]  │
│ Join with a code             │
│ [ _ _ _ _ ]  [ Join ]        │
│ No lobby with code ABCD.     │  inline error
│ Open lobbies                 │
│  ▸ The Vault Kids  1/3  Join │
│  (empty) No open lobbies.    │
│  Create one and share its    │
│  code.                       │
│ [ Leaderboard ]              │
└──────────────────────────────┘
```

**Lobby** (desktop: code fills the left half; seats and settings right)

```
┌──────────────────────────────┐
│ Share this code              │
│   K  7  M  Q    <- huge      │
│ [ Copy ]  [ Show QR ]        │
│ Team name  [Night Owls     ] │  host only
│ Seats                        │
│  ● Ana  (host)     ready     │
│  ■ Bo              ready     │
│  ▲ (empty)  bot fills        │
│ Spectators: Cy, Dee          │
│ [ Settings ] [ Real-life mode ]│
│ [ Start  (1 bot fills) ]     │
└──────────────────────────────┘
```

Seat symbols show the seat, not the role (roles rotate). A 4th joiner sees
Watch / Start a new team.

**Real-life mode wizard** (desktop: questions left, implications right, live)

```
Step 1 of 3  Same room?                ( ) Yes  ( ) No, remote
Step 2  Can't-hear player has headphones?  ( ) Yes  ( ) No
Step 3  Others have headphones?            ( ) Yes  ( ) No
─────────────
What this changes
  [on]  Can't hear: masking noise in headphones
  [on]  Others: captions on, sound off
  [off] In-app voice (people talk out loud)
[ Back ]   [ Apply ]
```

**Role reveal** (shape morphs from the previous role; cross-fade under
reduced motion)

```
┌──────────────────────────────┐
│ Room 2: Cameras and lasers   │
│        ▲                     │
│     You can't speak          │
│ You can send: Sound, Show    │
│ You hear: everything         │
│ Others: ● Ana can't see      │
│         ■ Bo can't hear      │
│ [ Ready ]   2 of 3 ready     │
└──────────────────────────────┘
```

**Disconnect**

```
┌──────────────────────────────┐
│ Waiting for Bo   0:45        │  game paused behind a dim layer
│ Their connection dropped.    │
│ [ Let a bot take over ]      │  host, after 0:45
│ [ Back to lobby       ]      │
│ (others: Waiting for the     │
│  host to choose)             │
└──────────────────────────────┘
```

**Room cleared / heist complete; leaderboard; spectator**

```
┌──────────────────────────────┐   ┌──────────────────────────────────┐
│ Room cleared                 │   │ [Full heist][Room 1][Room 2][Room 3]│
│ Time 1:42   Loot ◆ 3/5       │   │ 1 Night Owls   5:12  ◆11         │
│ [ Next room ]                │   │   Ana · Bo · Cy                  │
├──────────────────────────────┤   │ 2 ...                            │
│ Heist complete               │   │ (empty) No runs yet. Be first.   │
│ Night Owls: Ana, Bo, Cy      │   └──────────────────────────────────┘
│ 5:12   ◆ 11/15   Rank #4     │   Desktop: table (rank, team, names,
│ [ Leaderboard ] [ Play again]│   time, loot)
└──────────────────────────────┘

┌──────────────────────────────┐
│ Watching Night Owls (3 watch)│
│ [ ● Ana ][ ■ Bo ][ ▲ Cy ]    │  follow a player (sets the audio mix)
│ ╔══ grey dashed frame ══════╗ │  no role shape, no tray
│ ║ full map, all layers      ║ │
│ ╚═══════════════════════════╝ │
│ [ Leave ]                     │
└──────────────────────────────┘
```

**Loading / reconnecting / server full / not found**

```
Loading        Reconnecting       Server full        Lobby not found
[ ● ■ ▲ ]      Lost connection.   Server is full.    No lobby ABCD.
 shapes pulse  Retrying in 3 s    Try again in a     [ Try another code ]
 (static if    [ Retry now ]      minute.            [ Create lobby ]
 reduced)
```

## 5. Probes raised and resolved

| # | Type | What was raised | Resolution |
| --- | --- | --- | --- |
| 1 | contradiction | Soft abilities (push strength, mute secret layer) vs "no hard rules apart from sensory limitations" | No abilities at launch; asymmetry from perception, three-station beats and environment flips. Revisit only if playtests show the Can't-see player coasting |
| 2 | gap | The brief requires persistence; a session game persists nothing by default | Heist records leaderboard (per room + full heist) on `/data`; also gives teams something to race at the showcase |
| 3 | gap | Phone is a marking viewport; a platformer is rough on touch | Top-down, virtual joystick + Act, portrait first, landscape works |
| 4 | ambiguity | Side-on (Pico Park/Fireboy) vs top-down | Top-down (Monaco-like); Pico Park shapes the look and co-op feel |
| 5 | gap | Voice is costly; P2P needs TURN on campus networks | Kept in v1 at user's request, relayed through the server (ADR 0010), built last |
| 6 | ambiguity | Will relay latency hurt timing? | ~100–200 ms vs a ~1–1.5 s human cue loop; late frames dropped; design rule: cue-dependent safe windows ≥ 2 s; latency logged and shown |
| 7 | gap | Deafening someone in person is hard | Real-life wizard with presets: masking noise in the Can't-hear player's headphones, captions for others, in-app voice off; every toggle overridable |
| 8 | gap | How can a bot communicate, and how is a Can't-see bot guided? | Canned callouts/phrases with variation and cooldowns under the same rules; Can't-see bots act on callouts, not free text; callout grid added for humans too |
| 9 | gap | Disconnect mid-game | Pause 45 s with seat held for token rejoin; then host chooses bot or back to lobby |
| 10 | gap | More than 3 players | 4th+ joiner watches or starts a new team; teams compete via the leaderboard |
| 11 | gap | Repetition | One heist of 3 rooms, roles rotate per room; more and harder rooms added over time (backlog) |
| 12 | contradiction | Design proposal kept a mute "secret layer" after abilities were dropped | Removed; Can't speak sees exactly what Can't hear sees |
| 13 | gap | The Can't-see player can't read text chat | Text to Can't see is read aloud by browser speech synthesis |
| 14 | gap | Blind HUD could leak stations/hazards/positions | Blind client receives none; audio cues (hum on station, click on activation) instead |
| 15 | ambiguity | Are captions a channel for Can't see? | Captions only show what that player hears, so allowed as an accessibility setting, off by default |
| 16 | ambiguity | The pip row indicator didn't read | Replaced with an arrow list of receivers (`→ ● ▲`) + hatch for can't-send |
| 17 | gap | 100 ms laser flicker = 10 Hz, fails WCAG 2.3.1 | Flashing capped at 3/s; reduced motion is static |
| 18 | gap | Deaf teal close to goal green; amber blind close to camera yellow | Deaf → blue #4DB3FF; camera cones hatched; checkpoint → white flag |
| 19 | gap | Dark UI washes out in bright halls | High-contrast toggle (no light theme) |
| 20 | gap | Framing risk: disability simulation can read as mockery | Roles named by missing channel; README cites and addresses the simulation critique; captions for anyone |
| 21 | gap | Spam abuse of soundboard/emoji/stamps to smuggle information | Server-enforced cooldowns 3 / 1.5 / 1 s, bots included |
| 22 | gap | Who counts as a person | Anonymous hashed device token + nickname per lobby (ADR 0008) |
| 23 | gap | What happens to the pantry | Tag `archive/pantry-2026-10-08`, delete on `main`, ADRs 0002–0006 superseded; README and PROCESS.md link to the tag |
| 24 | assumption | Asset and font licences | Verify each Pixabay clip, bluemoji face and Archivo before bundling; record in CREDITS.md |
| 25 | gap | Uncommitted pantry edits in the working tree on 2026-10-08 | User decides commit or discard before the archive tag (§6) |

Ambitious alternatives raised and rejected: a level editor / player-made rooms
(build cost), procedural rooms (solvability and quality), P2P voice (TURN,
client-side enforcement), team-vs-team live modes (leaderboard covers it),
multiple themes and the driving interlude (time; backlog).

## 6. Handoff notes for planning

- **Before anything else:** the working tree has uncommitted phase-05a pantry
  edits (`src/components/*`, `src/styles/pantry.css`, `spec/items.ts`, a plan
  file). Ask the user to commit or discard them, then tag
  `archive/pantry-2026-10-08` on the last pantry commit, then remove the
  pantry code on `main` in one commit. Never cite pantry SHAs that wouldn't
  resolve; the tag keeps them all reachable.
- **ADRs:** 0007–0010 are written as `proposed`. Once accepted, mark
  0002–0006 `superseded by NNNN` (status line only). 0001 stands.
- **Rewrite CLAUDE.md** project invariants for the game (shape of the app,
  perception filter rule, channel rules table, simulation is headless,
  rooms are linted). Keep the working-method sections.
- **Crit sequencing:** week 10 (All at once) needs real-time deployed and one
  written decision about several people at once (the perception filter /
  disconnect pause are both candidates). Week 11 needs server-side logging
  and a live view. So: lobby + seats live + one room with three players
  moving first; voice last.
- **Harness to build in:** headless simulation; room linter in `pnpm check`
  plus a hook that runs it when a room file is edited; `spec/` check that
  three bots clear every room; per-role perception checks (e.g. a Can't-see
  client never receives tiles; a Can't-hear client never receives Say or
  Sound); channel-rule and cooldown checks; three-context Playwright test for
  live seats; axe at both viewports for the shell pages.
- **Judged claims:** a 3-person, ~10-minute playtest protocol per room,
  noting where communication broke down; log each run in `PROCESS_LOG.md`.
- **Log the pivot** in `PROCESS_LOG.md` as a process moment (why the change
  beat continuing; how the brief's co-presence line drove it).
- **Do not re-litigate:** top-down; no abilities; the channel table; server
  relay voice; heist-records persistence; 3 rooms rotating roles; anonymous
  device + nickname; tag-and-delete archive.
- **Accepted risks:** voice latency on poor Wi-Fi (mitigated, measured);
  speaking rules in person are an honour system; 45 s pause can annoy a team.
