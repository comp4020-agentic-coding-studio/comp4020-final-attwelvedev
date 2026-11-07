# First-minute clarity: the goal, three players, Start in reach

- **Date:** 2026-11-07
- **Tier:** Slice
- **Status:** Built (Tasks 1–4 ticked, 2026-11-08 overnight fm lane); human review pending, queued in `review/QUEUE-fm.md`
- **Requirements confirmed by user:** yes, 2026-11-07, in `/brainstorm-feature` (no spec file: a Slice)
- **Comes from:** `product/2026-11-07-review.md` §3 (first five minutes), RICE rows 1–5; screenshots in `product/2026-11-07-shots/`
- **Deadline:** Monday 2026-11-09 12:00

## What you'll see

- Every role's reveal says what a room is for: get all three onto the exit.
- The lobby says three play each room and that more people take turns, instead of "Players 1 of 6".
- The host's Start button is on screen at 1280×800 without scrolling.
- A blocked mic reads as optional, not broken. Phones get a one-line controls hint like the desktop's.

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
- R10 DESIGN.md updated in the same commits: §7 Copy gains the goal line and "take turns" vs "watch"; the lobby layout notes Start under the code (Tasks 1–3).

## Out of scope

- An exit chip from room 1's first frame (it would send each player where an exit they can't see is, against ADR 0007/0012 and DESIGN.md §4.6).
- Goals that differ by room, a tutorial room, the short heist preset, the signal card.
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

## Human review

- **Task 2 and Task 3, on a local build** (`PORT=8092 pnpm start:check`). Check screenshots at 1280×800 and 375×812:
  - the host lobby with 1 and with 4 people
  - each role's reveal
  - the phone seat in room 1

  A pass means: you'd read the goal line before the methods table, Start is the first thing your eye finds after the code, and nothing reads as an error. Your sign-off is needed. Green tests aren't enough.

## Corrections log

<!-- one line per user redirect during execution: date — what changed and why -->
