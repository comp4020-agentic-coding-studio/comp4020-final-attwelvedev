# Menu sounds and masking-noise choices

- **Date:** 2026-11-07
- **Status:** Approved
- **Tier:** Slice (client only; no ADR). Approved in `/brainstorm-feature` on 2026-11-07.
- **Comes after:** `plans/2026-11-07-team-wide-doors.md` (Tasks 88 to 91). Task numbers continue from 91.

## What you'll see

- Buttons and toggles across the home page, lobby, preferences, role reveal and HUD menu tick softly
  when pressed. An error (a bad code, a bad nickname) blips low.
- In a lobby, someone joining or leaving plays a chime, and their row glows for a moment.
- On the role reveal: a sting when your role appears, a soft chime and a pulse on the row when a
  teammate is ready, and a brighter sting when all three are ready.
- A "Menu sounds" switch, on by default, in both settings places.
- Can't hear's masking noise offers three sounds: Brown, Rain and Café.

## Demo script

Run on a local build (`pnpm build && pnpm start`), with sound on.

1. Home: press "Start a new team" → a tick. On the preferences page, flip "Captions" → a rising
   two-note tick. Flip it back → a falling one.
2. Home: join with code `ZZZZ` → a low blip, and the existing error text.
3. Lobby in tab A. Tab B joins → in A, a rising chime and B's row glows for about 1 s. B leaves → a
   falling chime.
4. Start with bots. Your role shows → a sting. A teammate presses I'm ready → a soft chime, and their
   ready mark pulses once. All are ready → a brighter sting as the game rises.
5. In settings, turn off "Menu sounds" → steps 1 to 4 make no sound. Game sounds still play.
6. Play as Can't hear with headphones set. In settings, under Masking noise, pick Rain → the noise
   changes at once. Pick Café, then reload → Café is still chosen.
7. Turn on reduced motion in the OS → the row glow is a still outline for 1 s, with no pulse.

## Requirements

- R1. Menu sounds:
  - a press tick, and a toggle tick that rises for on and falls for off
  - an error blip
  - join and leave chimes
  - a reveal sting, a ready chime, and an all-ready sting

  All are synthesised in `src/client/audio.ts` (demo 1 to 4; Task 92 tests).
- R2. `Settings.menuSounds: boolean`, default `true`. All menu sounds are gated on it, and are
  independent of `sound` (demo 5; Task 92 tests).
- R3. The lobby row glow on join, and the ready pulse on the reveal row. These use the `--ui` token
  for about 1 s, at most once per change, and become a still outline under reduced motion (demo 3, 4
  and 7; Task 94 layout spec).
- R4. `Settings.maskNoise: "brown" | "rain" | "cafe"`, default `"brown"`. It is picked in both
  settings places, applies at once, and persists. Old saved settings still load (demo 6; Task 92 tests).
- R5. DESIGN.md records each menu sound with its picture twin (the press itself, the error text, the
  row glow, the ready mark, the rise) and the three masking beds (Task 95; `spec/design.test.ts`).

## Out of scope

- Ambience and music (overhaul Task 26, never built).
- Bundled recordings. If E's beds fail review, that is a new brainstorm.
- Sounds on in-game action keys (Act, G, the comms wheel), which already have game cues.
- `parity.test.ts`: these are UI feedback, not `SoundCue`s.

## Context (verified 2026-11-07)

- **`src/client/settings.ts`:**
  - `interface Settings { captions; sound; speech; voiceMode; quick; highContrast; maskNoiseOn: boolean | null; volume; labels }`
  - `defaultsFor(role)`
  - `loadSettings(role, store?)` validates each field and falls back to `base`
  - `saveSettings`
- **`src/client/audio.ts`:**
  - `createAudio(): GameAudio` with `setMaskNoise(on: boolean, volume: number)`
  - `brownNoiseBuffer(c)` is a 3 s looped buffer
  - the private helpers `tone(c, cue, type, from, to, secs, level)` and `burst(...)` exist
  - `createAudio` is called only in `Game.tsx` (line ~447) and `Spectator.tsx`
- **Settings panels:**
  - `src/components/Settings.tsx` (in game): `toggle(key: keyof SettingsState)`, with the mask-noise
    checkbox and volume shown when `deaf`
  - `src/components/Preferences.tsx` (`/preferences` and the lobby's `PreferencesSheet`):
    `toggle(key: "captions" | "sound" | "speech" | "highContrast")` and a "Masking noise volume" range
- **Lobby:**
  - `src/components/Lobby.tsx` sets `lobby` from `socket.on("lobby", ...)`
  - `LobbyState.people: Person[]`, where `Person { who; nickname; connected; setup; played }`
    (`src/net/lobbies.ts`), and `who` is stable
  - rows are `PlayerRow`
- **Join errors:** `src/components/Home.tsx` `socket.on("error", ...)`, which calls `setErrors`.
- **Reveal:**
  - `RoleReveal` is mounted in `Game.tsx` (~551) with `readySeats`
  - `socket.on("ready", ...)` is at ~488
  - the rise starts in `start(sawReveal)` (~450)
- **Layout specs:** `spec/layout/lobby-people.test.ts`, `spec/layout/reveal.test.ts`,
  `spec/layout/setup.test.ts`.

## Tasks

### Task 92: Settings fields and a menu-sound player (R1, R2, R4) ✅

- **Behaviour:**
  - `Settings` gains `menuSounds` (default true) and `maskNoise` (default "brown"), and `loadSettings`
    validates both.
  - New `src/client/uiSound.ts` has a lazily created shared `AudioContext`, unlocked on the first
    pointer or key event, and exports `uiSound(kind, settings)`, where
    `kind: "press" | "toggle-on" | "toggle-off" | "error" | "join" | "leave" | "reveal" | "ready" | "all-ready"`.
    It does nothing when `!settings.menuSounds` or there is no audio, and never throws.
  - Each kind's synth recipe is a pure data plan (notes, wave, durations), as `chimeSound.ts` does, so
    it can be unit tested.
- **Files:** `src/client/settings.ts`, `src/client/settings.test.ts`, `src/client/uiSound.ts` (new),
  `src/client/uiSound.test.ts` (new).
- **Tests first:**
  - "old saved settings load with menuSounds true and maskNoise brown"
  - "an unknown maskNoise falls back to brown"
  - "uiSound plays nothing when menuSounds is off" (a fake context counts the nodes started)
  - "each kind's plan is distinct: toggle-on rises, toggle-off falls, error is low"
- **Break check:** drop the `menuSounds` guard with a script, and watch the test go red.

### Task 93: Three masking beds and the picker (R4) ✅ (review queued)

- **Behaviour:**
  - `setMaskNoise(on, volume, bed: "brown" | "rain" | "cafe" = "brown")`. A changed bed cross-fades
    over about 300 ms.
  - The beds are built in a new `src/client/maskBeds.ts`, as pure functions returning sample data for a
    given sample rate and seed:
    - Rain: band-passed noise, with sparse short decaying droplet clicks at random pitch
    - Café: pink noise, with a low-pass murmur and a faint high clink every few seconds
  - Each buffer is 6 s, and its ends are cross-faded so it loops without a seam.
  - Both settings panels show a "Masking noise sound" select (Brown, Rain, Café) beside the volume,
    disabled when masking noise is unavailable or off, as the volume is.
  - `Game.tsx` passes `settings.maskNoise`.
- **Files:** `src/client/audio.ts`, `src/client/maskBeds.ts` (new), `src/client/maskBeds.test.ts`
  (new), `src/components/Settings.tsx`, `src/components/Preferences.tsx`, `src/components/Game.tsx`.
- **Tests first:**
  - `maskBeds.test.ts`: "each bed's first and last 10 ms differ by less than a seam threshold"
  - "rain and cafe differ from brown in spectral centroid"
  - "a seed gives the same buffer"
- **Verified by:** demo 6.
- **Human review:** listen to Rain and Café for a minute each, at the default volume, with headphones.
  A pass is that each is pleasant enough to keep on for a heist, with no click at the loop. If either
  fails, stop: the user picks recordings (a new brainstorm).
- **Depends on:** Task 92.

### Task 94: Wire menu sounds, the row glow and the ready pulse (R1, R2, R3)

- **Behaviour:**
  - **Presses.** One delegated listener on `document` (in a small `installUiSounds(getSettings)`,
    called from each island's mount: Home, Lobby, Preferences, Game) plays:
    - `press` on a `button` click
    - `toggle-on` or `toggle-off` on a checkbox change
    - nothing for elements inside the game canvas or the comms wheel
  - **Errors.** `Home.tsx` plays `error` where it calls `setErrors`.
  - **Lobby.** `Lobby.tsx` diffs `people` by `who` on each `lobby` message, ignoring the first message:
    `join`/`leave`, plus a `glow` class on the joined row for 1 s (CSS animation on `--ui`; a still
    outline under `prefers-reduced-motion`). `PlayerRow` takes `glow?: boolean`.
  - **Reveal.** `Game.tsx` plays:
    - `reveal` when `RoleReveal` first shows
    - `ready` when `readySeats` grows by a seat that is not yours (that row's mark gets a one-shot
      `pulse` class)
    - `all-ready` in `start(true)`
  - Settings panels gain the "Menu sounds" checkbox, in both places.
- **Files:** `src/client/uiSound.ts`, `src/components/Home.tsx`, `src/components/Lobby.tsx`,
  `src/components/PlayerRow.tsx`, `src/components/RoleReveal.tsx`, `src/components/Game.tsx`,
  `src/components/Settings.tsx`, `src/components/Preferences.tsx`, `src/styles/pages.css` (where `.player-row` is styled), and `spec/layout/lobby-people.test.ts`.
- **Tests first:**
  - `spec/layout/lobby-people.test.ts`: "a person joining makes their row glow in the others' lobby,
    and it is gone after 1.5 s". It names its neighbour rows, and measures that the glow outline does
    not overlap the row below. It runs at 1280 and 375.
  - "with reduced motion, the glow has no animation".
  - A unit test of the `people` diff (join, leave, reorder is neither).
  - A spec sets `window.__uiSounds = []` (as `__cuesPlayed` does) to assert the kinds played in
    demo 3.
- **Break check:** skip the glow class and watch the layout case go red. Skip the guard on `menuSounds`
  and watch the `__uiSounds` case go red.
- **Human review:** with three tabs on a local build, demo steps 1 to 5. A pass is that the sounds
  feel light and are not tiring after a whole lobby wait, and nothing ticks during play.
- **Depends on:** Task 92.

### Task 95: DESIGN.md, process log, backlog, check

- **Behaviour:**
  - DESIGN.md gets a "Menu sounds" paragraph (each kind, its recipe and its picture twin), the three
    masking beds, the row glow, and the ready pulse.
  - The backlog's two Parked lines (menu sounds, masking noise) move to Decided, pointing here.
  - `PROCESS_LOG.md` records the user's rulings: a separate toggle, a highlight twin, and synthesised
    beds first with recordings as the fallback.
  - `pnpm check` is green, then commit.
- **Files:** `DESIGN.md`, `specs/backlog.md`, `PROCESS_LOG.md`.
- **Verified by:** `spec/design.test.ts` and `pnpm check`.
- **Depends on:** Tasks 93 and 94.

## Human review

- Task 93: the masking beds (listening).
- Task 94: menu sounds across a lobby wait (listening, three tabs).

## Corrections log

<!-- one line per user redirect during execution -->
