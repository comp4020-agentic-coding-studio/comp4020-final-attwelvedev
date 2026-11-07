# First-minute clarity: the goal, three players, Start in reach, a calmer reveal, the room in the HUD, a favicon

- **Date:** 2026-11-07
- **Tier:** Slice
- **Status:** Tasks 1–4 built (overnight fm lane, 2026-11-08), human review pending in `review/QUEUE-fm.md`; Tasks 5–7 approved, queued for the fm2 unit
- **Requirements confirmed by user:** yes, 2026-11-07, in `/brainstorm-feature` (no spec file: a Slice). Tasks 5–7 added 2026-11-08 at the user's request (RICE rows 12, plus a room label and a favicon), with the reveal table folded at first and then remembered as each person leaves it (revised 2026-11-08, see Corrections log), and the three-heads favicon chosen by the user
- **Comes from:** `product/2026-11-07-review.md` §3 (first five minutes), RICE rows 1–5; screenshots in `product/2026-11-07-shots/`
- **Deadline:** Monday 2026-11-09 12:00

## What you'll see

- Every role's reveal says what a room is for: get all three onto the exit.
- The lobby says three play each room and that more people take turns, instead of "Players 1 of 6".
- The host's Start button is on screen at 1280×800 without scrolling.
- A blocked mic reads as optional, not broken. Phones get a one-line controls hint like the desktop's.
- The reveal is calmer: the goal, one sentence for your role, then the sounds and I'm ready. "Who hears what" is folded the first time; after that it opens or stays folded as you last left it.
- The game's top bar says which room you're in ("4 · The Safe", "4/9" on a phone).
- The browser tab shows the three crew heads in their role colours.

## Demo script

Run locally on a port other than 8080 (a dev server of yours holds it): `pnpm build && PORT=8092 pnpm start:check`, then open `http://localhost:8092`.

1. Open the home page → under the join panel: "No code? Start a team and send its code to two friends. Up to six can join and take turns."
2. Start a team at 1280×800 → without scrolling, the left column shows the code, Copy / Show QR, then **Start (2 bots fill)** and "1 of 3 here. Bots take the rest."
3. Same lobby, right column → heading "**1 here · 3 play each room**", then "Up to 6 take turns; the rest watch." and "Bots fill empty seats. With more than three, you take turns: whoever sits out watches and plays a later room."
4. Join as a second tab → the status reads "2 of 3 here. A bot takes the rest." The guest sees "Waiting for the host to start." where the host's Start is.
5. Join as a fourth person → heading "4 here · 3 play each room". The "Bots fill empty seats…" hint is gone, and the rotation table, the rows' "plays N" and "The host can change who plays then." are as before. A seventh joiner still gets "This lobby is full. You can watch…", and a watcher's heading still reads "You are watching".
6. Start → each role's reveal shows "Get all three onto the exit." directly under "You can't see / hear / speak", above "You can send".
7. In room 1, the Can't see seat → "No map. Listen. Get to the exit with the others." With the mic denied: a player sees "Voice off (optional). Callouts and text still work." and a watcher sees "Voice off (optional). Chat still works."
8. On a phone seat (375 px, touch) → under the joystick and Act: "Stick moves · big button acts · hold Wheel to send". It dims when the room is cleared, like the desktop line.
9. Still on the reveal (any role) → under the goal, one sentence in plain words: Can't see "Your teammates guide you. Talk to them; listen for the room."; Can't hear "You see the map but hear nothing. Watch for faces and marks."; Can't speak "You see and hear everything. Send clips, faces and marks." Below it, a folded "Who hears what" button. Pressing it shows today's "You can send / You get" and the per-method receiver lines; pressing again folds them. The first reveal in a fresh browser starts folded. Open it, then reach the next room's reveal (or reload the page) → it starts open. Fold it again → the next reveal starts folded. With storage blocked (a private window), every reveal starts folded and the toggle still works.
10. In a room, desktop → the top bar shows "1 · First Steps" to the left of the timer; in room 4 it shows "4 · The Safe". On the phone seat → "1/9" in the same bar, nothing clipped, and the menu (≡) names the room in full: "Room 1 of 9: First Steps".
11. Look at the browser tab on any page → a dark tile with three overlapping heads, orange, blue and purple. Open `/favicon.svg` at a large size → each head sits on a body bearing its role shape (● ■ ▲).

## Requirements

- R1 Home line (demo 1) → Task 1.
- R2 Blocked-mic copy for players and watchers (demo 7) → Task 1.
- R3 Can't see's HUD line (demo 7) → Task 1.
- R4 Goal line on every role's reveal, between the role heading and the facts (demo 6) → Task 2.
- R5 Lobby heading "{here} here · 3 play each room" plus "Up to 6 take turns; the rest watch." for people; "You are watching" unchanged for watchers (demo 3, 5) → Task 3.
- R6 The "Bots fill empty seats…" hint shows only while fewer than 4 people are here, and replaces "Share the code to fill seats; bots fill the rest." (demo 3, 5) → Task 3.
- R7 Host's Start and its status line in the left column under the code's actions, fully inside a 1280×800 viewport with 1 and with 6 people; the guest's "Waiting for the host to start." in the same place (demo 2, 4) → Task 3.
- R8 Status copy: "{here} of 3 here. Bots take the rest." / "A bot takes the rest." while bots fill; "{here} people are here." at 3+ (unchanged) (demo 2, 4) → Task 3.
- R9 Phone controls hint under the touch controls, dimmed when cleared; none on desktop, where the WASD line stays (demo 8) → Task 4.
- R11 Reveal: one role sentence under the goal line, in people's words (DESIGN.md §7: no family words, methods named as the wheel does) (demo 9) → Task 5.
- R12 Reveal: "You can send / You get" and the receiver lines live behind a "Who hears what" toggle, folded the first time and thereafter in whatever state the person last left it (remembered in the browser, per device; folded if storage is unavailable), operable by keyboard, with `aria-expanded`; Can't see's dark-screen line, the real-life rules, the sound briefing and I'm ready stay outside it (demo 9) → Task 5.
- R13 HUD: the room's number and name in the top bar on desktop, the number of the total on a phone, the full "Room N of M: Name" in the menu; the sr-only `<h1>` unchanged (demo 10) → Task 6.
- R14 Favicon: an SVG of three overlapping heads in `--role-blind`, `--role-deaf` and `--role-mute` on `--bg`, with role-shape bodies that show from 32 px up, plus a 32 px PNG fallback, linked from `Base.astro` so every page has it (demo 11) → Task 7.
- R10 DESIGN.md updated in the same commits: §7 Copy gains the goal line and "take turns" vs "watch"; the lobby layout notes Start under the code (Tasks 1–3).

## Out of scope

- An exit chip from room 1's first frame (it would send each player where an exit they can't see is, against ADR 0007/0012 and DESIGN.md §4.6).
- Goals that differ by room, a tutorial room, the short heist preset, the signal card.
- Syncing the "Who hears what" state across devices, or a control for it on `/preferences`. Longer caption holds: cue captions already hold 3.5 s since `7800505` (playtest 1); revisit only on new playtest evidence.
- An Apple touch icon or web manifest.
- The full-lobby "This lobby is full. You can watch…" screen and the watcher flow (ADR 0013).

## Tasks

Each new or changed promise-guarding assertion is shown red first, with a break script that asserts the text it replaces (CLAUDE.md), and the commit says what was broken. `pnpm check` must be green against `PORT=8092 pnpm start:check` with `APP_URL=http://localhost:8092`.

- [x] **Task 1: Copy — home line, mic lines, Can't see's HUD line**
  - Files: `src/components/Home.tsx` (line 221), `src/components/TalkBar.tsx` (`blocked`, line 6), `src/components/Spectator.tsx` (line 254), `src/components/Game.tsx` (line 1084, `.hud-hint`), `DESIGN.md` §7.
  - Tests to update first (red, then green): `spec/layout/voice.test.ts:151` (the player's mic line), `src/components/SpectatorChat.test.ts:117–119` (it matches `/Microphone blocked/`; it becomes `/Voice off \(optional\)/`), `spec/layout/braille.test.ts:66` (waits on `.hud-hint` "No map. Listen."; match the new line). Add to `spec/layout/home.test.ts` an assertion that the join panel says "Up to six can join and take turns".
  - Acceptance: demo steps 1 and 7 pass. `grep -r "Microphone blocked" src spec` is empty.

- [x] **Task 2: The goal line on every role's reveal**
  - Files: `src/components/RoleReveal.tsx`: a `<p class="reveal-goal">Get all three onto the exit.</p>` after the `<h1 id="reveal-title">` block and before `<dl class="reveal-facts">`. The same for every role and room. Style it in the reveal's existing CSS using existing tokens only (it's a sentence, not a heading). Add a DESIGN.md §7 bullet: the goal line, its words and where it sits.
  - Test first: in `spec/layout/reveal.test.ts` under "each role's reveal card", a new `it` checks that for each of the three roles the card contains "Get all three onto the exit.", and that its box lies below `#reveal-title` and above `.reveal-facts`, at 1280 and 375. Red by removing the line through the break script.
  - Acceptance: demo step 6. The existing "no overflow and no axe violations for each role" test (`reveal.test.ts:638`) stays green.
  - Depends on: none.

- [x] **Task 3: The lobby — heading, turn-taking hint, Start under the code**
  - Files: `src/components/Lobby.tsx`:
    - the heading at line 485 becomes `` `${here} here · 3 play each room` `` (the watcher branch is unchanged), followed by `<p class="muted">Up to 6 take turns; the rest watch.</p>` when `!watching`
    - the `here === 1` hint at line 505 becomes `here < 4 && !watching` with the new sentence
    - move the `{!watching && (<div class="start">…</div>)}` block (lines 543–571) to the left column, directly after the `.actions` / QR block (after line 420) and before the private note and team name
    - status copy per R8
    - `src/styles/pages.css` (`.start` at line 401, `.lobby-code` at 737–755) adjusted so it sits there at both widths
    - DESIGN.md: the lobby layout line
  - Update the five helpers that wait on the old heading `/^Players \d of 6/` to `/^\d here · 3 play each room/`: `spec/playUi.ts:34`, `spec/layout/braille.test.ts:61`, `spec/layout/cache.test.ts:37`, `spec/layout/cache-chip.test.ts:51,269`, `spec/layout/chamber.test.ts:56`.
  - Tests first, in `spec/layout/lobby.test.ts`:
    - (a) at 1280×800 the host's Start button box lies fully within the viewport with no scrolling, with 1 person and with 6, and is at least 48 px tall
    - (b) the hint shows with 1–3 people and is gone at 4
    - (c) the guest sees "Waiting for the host to start." and no Start
    - Red by moving Start back below the setup (break script), and by changing `< 4` to `< 7`.
  - Acceptance: demo steps 2–5. The existing lobby tests (overflow, axe, the widest code, the seventh joiner) stay green at 1280 and 375.
  - Depends on: none (Task 1's DESIGN.md edit is in a different section).

- [x] **Task 4: The phone controls hint**
  - Files: `src/components/Game.tsx` (lines 1275–1284): in the `touch` branch, render `<p class={cleared ? "keys is-off" : "keys"}>Stick moves · big button acts · hold Wheel to send</p>` after `<TouchControls …/>`. Reuse the `.keys` style (`src/styles/game.css:651`). Check that it fits under `.touch-zone` (150 px) at 375×812 without pushing the frame.
  - Test first: in `spec/layout/game.test.ts`, extend "puts the joystick and Act on touch…" (line 105). It is retitled, since it currently promises "no key hints there". The phone seat shows the touch hint below `[data-act]`, it is not clipped (`scrollHeight <= clientHeight`), and it never mentions WASD or Space. The desktop seats keep "WASD or arrows move · Space acts" (`wheel.test.ts:334` already checks this). Red by removing the line.
  - Acceptance: demo step 8. "No overflow and no axe violations on the HUD at phone and desktop widths" (`game.test.ts:94`) stays green.
  - Depends on: none.

- [x] **Task 5: A calmer reveal: one sentence, and "Who hears what" folded**
  - Files: `src/components/RoleReveal.tsx`:
    - add a `ROLE_LINE: Record<Role, string>` beside `YOU` (line 22) with the three sentences in demo 9, rendered as `<p class="reveal-role-line">` right after Task 2's `.reveal-goal`
    - wrap `<dl class="reveal-facts">` (line 112) and `<ul class="reveal-lines">` (line 134) in a disclosure: a `<button type="button" class="btn reveal-more" aria-expanded={open} aria-controls="reveal-more">Who hears what</button>` and a `<div id="reveal-more" hidden={!open}>`, with `open` initialised from `loadRevealOpen()` and every press calling `saveRevealOpen(next)`. These are two new never-throwing helpers in a new `src/client/revealPrefs.ts`, under their own `localStorage` key `heist.reveal` (`{"open": boolean}`; missing, unreadable or blocked means `false`). They take an optional store argument like `loadSettings`/`saveSettings` in `src/client/settings.ts`. They are deliberately **not** a field of `heist.settings`: `Game.tsx` holds a copy of `Settings` loaded at mount (line 750) and writes the whole object back on any in-game change (line 796), which would overwrite a reveal toggled after mount
    - the cache side-job block (between them today) stays outside, above the toggle
    - `src/styles/game.css`: style `.reveal-role-line` and `.reveal-more` with existing tokens only
    - DESIGN.md: the reveal's order (goal, role line, side job, toggle, dark line, real-life rules, sounds, ready) under Components, and the three sentences in §7
  - Tests first, in `spec/layout/reveal.test.ts`:
    - (a) for each role, the role sentence is visible and the receiver names are not visible until "Who hears what" is pressed, then visible; `aria-expanded` follows
    - (b) open it in room 1, and the room-2 reveal starts open. Fold it, and the room-3 reveal starts folded. After a reload it keeps the last state
    - (c) unit test `src/client/revealPrefs.test.ts`: the default is `false`; a save then a load round-trips; a store whose `getItem`/`setItem` throw gives `false` and no exception; junk JSON gives `false`
    - Update "names who hears what they send, by name…" (line 48) to press the toggle first. Its promise (names, never Say/Sound/Show) still holds inside it.
    - Red by rendering the div without `hidden`, by removing the role line, and by not calling `saveRevealOpen` (break script).
  - Acceptance: demo 9. "No overflow and no axe violations for each role, host and guest" (line 638) stays green, both folded and open.
  - Depends on: Task 2 (the role line sits under its goal line).

- [x] **Task 6: The room in the HUD**
  - Files: `src/components/Game.tsx`: in `<header class="hud-top">` (line 1015), before `<span class="hud-clock">` (line 1040), add `<span class="hud-room">` with "{reveal.index + 1} · {reveal.name}" in a span shown at 720 px and up, and "{reveal.index + 1}/{reveal.rooms}" in a span shown below it, using `aria-hidden` on the visible text plus an `sr-only` "Room N of M: Name". Pass "Room {reveal.index + 1} of {reveal.rooms}: {reveal.name}" to `HudMenu` as a new optional `title?: string` prop, rendered as the open menu's first line (`src/components/HudMenu.tsx`, props at lines 7–19). `src/styles/game.css`: `.hud-room` beside `.hud-clock` (line 381), `--t-14`, muted, ellipsis on overflow. The class name is unique in the game; `Spectator.tsx` already uses `hud-room` for "Watching {roomName}", so check first whether it shares the style, and reuse it if it does.
  - Tests first, in `spec/layout/hud.test.ts`:
    - (a) at 1280 every role's top bar contains "1 · First Steps"
    - (b) at 375 the phone seat's bar shows "1/9", and no element of `.hud-top` overflows or clips (`scrollWidth <= clientWidth` on the bar, and each child's box inside it)
    - (c) the menu, once opened, shows "Room 1 of 9: First Steps"
    - Red by removing the span (break script).
  - Acceptance: demo 10. `game.test.ts:94` (no overflow or axe on the HUD at both widths) stays green.
  - Depends on: none.

- [ ] **Task 7: The favicon: three crew heads**
  - Files (new): `public/favicon.svg`, hand-written. Three overlapping circles in a row (`#f2a93b`, `#4db3ff`, `#9b7ee0`, the `--role-*` values in `src/styles/tokens.css:33–35`) on a rounded `#0b1220` (`--bg`) tile. Bodies under them carry ● ■ ▲ in a darker tint, drawn so they read from 32 px and fall to a blur under the heads at 16 px. Also `public/favicon-32.png`, rendered from the SVG once with the repo's Playwright (`page.setContent` + `screenshot` at 32×32; a throwaway script kept outside the repo, not a new dependency). `src/layouts/Base.astro`: after the `<title>` (line 21), add `<link rel="icon" href="/favicon.svg" type="image/svg+xml" />` and `<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png" />`. DESIGN.md: one line under Tokens or Components naming the favicon and its colours. `CREDITS.md`: none needed (own work).
  - Test first: a `spec/favicon.test.ts` (HTTP only, no browser): `GET /` contains both `<link rel="icon"`; `GET /favicon.svg` is 200 with an SVG body containing the three role colours; `GET /favicon-32.png` is 200 `image/png`. Red by removing the links from `Base.astro` (break script).
  - Acceptance: demo 11, at 16 px in a real tab and at 32 px.
  - Depends on: none.

## Human review

- **Tasks 2, 3, 5, 6 and 7, on a local build** (`PORT=8092 pnpm start:check`). Check screenshots at 1280×800 and 375×812:
  - the host lobby with 1 and with 4 people
  - each role's reveal
  - the phone seat in room 1
  - the reveal folded and open, and that your choice carries to the next room's reveal
  - the HUD's room label at both widths
  - the favicon in a real tab at 16 px and at 32 px

  A pass means: you'd read the goal line before the methods table, Start is the first thing your eye finds after the code, and nothing reads as an error. The folded reveal feels calm (one sentence, not a table). The room label is legible without crowding the timer. In a tab strip, the favicon reads as three people. Your sign-off is needed. Green tests aren't enough.

## Corrections log

<!-- one line per user redirect during execution: date — what changed and why -->

- 2026-11-08 — Task 5 (not started; the fm lane runs Tasks 1–4 only): "Who hears what" was "always folded"; the user revised it to folded at first, then remembered as each person last left it. It is stored under its own `heist.reveal` key, not in `heist.settings`, because Game.tsx writes its mount-time Settings back whole.
