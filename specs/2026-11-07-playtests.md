# Playtests: a regression run, and a screenshot review

- **Date:** 2026-11-07
- **Status:** Approved
- **Approved by user:** yes, 2026-11-07. Revised the same day: the user chose option B (below) over the
  agent playtest on cost.
- **Tier:** Architecture (ADR 0027 for the autopilot seam; ADR 0028 for the screenshot review and its dev
  dependency, both proposed).

## 1. Problem / intent

Backlog, 2026-11-03: "automate the playtest: an agent that plays a heist in a real browser (three tabs,
1280 and 375) with a checklist of invariants". The bugs a human playtest found in phase 14 lived
between layers, so no unit test of one layer could reach them.

In the brainstorm the user asked how a bot-driven run could be "authentic, like real humans
playtesting". It cannot be, so the work is named for what each part is:

1. **The regression run** (`pnpm playtest`): bots drive real browser seats, and invariants are checked
   every frame. It finds bugs between layers, deterministically and for free.
2. **The screenshot review** (`pnpm playtest:review`): a model looks at what each role perceived at each
   beat of the regression run, as a first-time player would, and says what it could not read, would be
   misled by, or would not know to do next. It finds unreadable clues and misleading labels for about $2
   a heist.

The first version of this spec had three Claude agents play the heist from their own pages. On review of
the plan, its cost (about $55 for one heist on Sonnet, plus six tasks to build) was more than the user
wanted to spend; that budget is better spent on new ideas. The agent loop is parked in the backlog.
Comms gaps (a role never learns what it needs) stay with human playtests, which also still decide
whether the game is fun.

## 2. Requirements

### 2.1 Functional requirements

**Autopilot seam (ADR 0027)**

- **FR1.**
  - With `PLAYTEST_AUTOPILOT=1`, the client message `{ t: "autopilot"; on: boolean }` puts a person's
    seat under a bot memory. Its input and messages come from the bot, its own input is ignored, and it
    still receives its views.
  - Without the flag, the server replies `error` with code `refused`.
  - The server process exits with a clear message if the flag is set and `FLY_APP_NAME` is present.
  - One `logGame` `autopilot` event per toggle.
  - Each new client message is validated in `protocol.ts`.

**Regression run (`pnpm playtest`)**

- **FR2. Setup.**
  - A throwaway server (`PLAYTEST_AUTOPILOT=1`, a temporary DB).
  - Three tabs: two desktop at 1280 and one phone at 375, as `spec/playUi.ts` `playRoom` does.
  - Lobby, join, start and ready through the real UI.
  - Every room in heist order, through the real Next flow. The roles rotate as in the real heist.
- **FR3. Input check, per room, before autopilot.** Each tab:
  - presses each move key for a short step
  - presses Act once
  - opens the comms wheel and sends one callout its role may send
  - opens the menu and uses each action that does not leave or restart (a restart vote is cast and
    then cancelled)

  The phone tab moves by touch. Each action is checked against what the page and the server show next.
  Then all three switch on autopilot.
- **FR4. Frame invariants, sampled every 250 ms per tab once the canvas has settled.**
  - **Nothing unsent is drawn** (sighted tabs). For tiles outside line of sight with no entity in the
    view, the canvas pixel at the tile's projected centre equals a render of the same scene with
    entities removed. This uses a page hook, `window.__playtest`, present only when the server says
    autopilot is enabled.
  - **Every sound plays.** Every cue in a view appears in `window.__cuesPlayed`. Every captioned cue
    appears in the captions region.
  - **Doors.** Every door label chip on screen matches how that door opens (`opens`).
- **FR5. Room-end invariants.** The HUD loot and time, the cleared card and the heist screen equal the
  server's `cleared` message. On the last room, the heist-complete screen's actions all work.
- **FR6. Evidence.** One set per beat, under `review/playtest/<run>/<room>/`:
  - `<role>-<width>-<beat>.png`: the screenshot
  - `<role>-<width>-<beat>.txt`: what that player perceives as text: the page's accessible text, and
    the captions with their direction words. This is what the review reads (FR9).

  Once per run, each seat's prior knowledge is saved as text: the home page, and per room the role
  reveal and (Can't see) the sound briefing.
- **FR7. Failures.** Each is recorded with:
  - the frame's screenshot
  - the view JSON
  - the role, room, tick and the invariant's name

  Play continues. The command exits non-zero at the end if any failed. `report.html` lists every finding
  and links the evidence.
- **FR8. Flags.** `--room NN`, `--width 1280|375`, `--rotations all`. The default is every room, one
  rotation and both widths.

**Screenshot review (`pnpm playtest:review <run>`, ADR 0028)**

- **FR9. Perception.** The review reads a finished run's evidence, offline (no browser, no server).
  Per role per beat it gives the model only what that player perceived:
  - **Sighted:** the screenshot, plus the `.txt` (page text and captions).
  - **Can't see:** the `.txt` only. No screenshot (their screen is black).

  No `RoleView` JSON, no decoders, no source, no README, and no room design data (beats' intents,
  hints, answers).
- **FR10. Prior knowledge.** Each call carries that seat's saved prior knowledge (FR6) as text. The
  system prompt says only that the model is a first-time player of a browser game, with its role, and
  that its team's goal is to clear rooms.
- **FR11. The question.** One call per role per beat. It asks what that player could not read or make
  out, what would mislead them, what they would not know to do next, and what they would do next. The
  answer is structured: a list of findings (`unreadable`, `misleading`, `missing`, `unclear-next`, each
  with what and where) and one `next` line.
- **FR12. Report and cost.**
  - `review/playtest/<run>/review.html`: per room, per beat, per role. It shows the screenshot (or
    "screen dark" for Can't see), the findings, and the model's `next` beside the beat's designed
    intent for that role (taken from the room file for the reader; never sent to the model), so a
    mismatch shows at a glance.
  - Before any call, the command prints the call count and an estimated cost, and needs `--yes`.
  - `--room NN` reviews one room. The model is configurable (default: the environment's
    `ANTHROPIC_MODEL`). The report gives the calls made and the tallied cost.

### 2.2 Non-functional requirements

- Neither command is in `pnpm check`. The regression run has its own node script, and its browser use
  stays within the 3-at-once cap. The review uses no browser.
- `review/playtest/` is added to `.gitignore`. That narrows what is ignored; it never widens it to keys.
- `@anthropic-ai/sdk` is a **devDependency** only. Nothing in `src/` imports it (`layering.test.ts`
  extended), and the production image is unchanged.
- No key in the repo. The SDK reads its key (`ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY`) and
  `ANTHROPIC_BASE_URL` from the environment.
- The page hook and `__cuesPlayed` exist only when the server reports autopilot enabled, so production
  pages carry neither.
- The regression run's frame checks wait for a settled canvas (`settledHash`) and follow
  `spec/flaky-patterns.test.ts`.
- A full heist's review costs about $2 on Sonnet (about 130 calls); one room about $0.25.

### 2.3 Out of scope

- Agents that play the heist (the earlier agent playtest): parked in the backlog.
- Comms gaps: left to human playtests.
- A scripted player that solves puzzles.
- Running either command against the deployed app.
- Judging fun.
- An agent hearing real audio.
- Making either command a release gate.

### 2.4 Assumptions (confirmed)

- The user chose the regression run plus a screenshot review (option B) over the agent playtest, on
  cost.
- The user chose: Can't see from captions plus page text; prior knowledge only from what players see;
  record and continue; default coverage of 9 rooms × 1 rotation × both widths; the env flag with a
  refusal on Fly.
- **To prove first (the plan's first task):** the course proxy accepts image input. If it does not,
  stop and return to the user.

## 3. Existing context

- **Playwright** is already a devDependency. `spec/browser.ts` has `launch`, `openPage`, `PHONE` (375 ×
  812) and `DESKTOP` (1280 × 800). `spec/playUi.ts` has `playRoom` (three tabs, one phone) and
  `settledHash`. `spec/heistPlay.ts` plays room 1 over sockets.
- **Bots.** `createBotMemory(seat, humans, roles)` and `botsAct` (`src/game/bots/crew.ts`).
  `seatBots(game, botSeats)` in `src/net/game.ts` marks bot seats ready.
- **Server test seams.** `ROOMS_DIR`, `PAUSE_MS` and `VOTE_MS` in `src/net/attach.ts`. `runIfReady`
  starts the tick. `pnpm start:check` runs a throwaway DB.
- **Hooks.** `window.__cuesPlayed` is pushed in `src/client/audio.ts` `play`, and read by
  `spec/layout/spectator.test.ts`.
- **API.** `ANTHROPIC_BASE_URL` and `ANTHROPIC_MODEL` are set in this environment (the course proxy).
  There is no SDK in `package.json`.
- **Rooms** carry `beats` with an `intent` per role (e.g. room 01's "is told where the plate is and
  stands on it"). Nine rooms, 35 beats in all.

## 4. Design

```
pnpm playtest                                 pnpm playtest:review <run> --yes
  server (PLAYTEST_AUTOPILOT=1)                 reads review/playtest/<run>/
  3 tabs ── UI to the reveal                    per room, per beat, per role:
  per room:                                       screenshot (sighted) + .txt + prior knowledge
    input check (keys, wheel, menu)               -> one model call -> findings + next
    autopilot on (server bots drive)            review.html: findings, next vs designed intent,
    every 250 ms: frame invariants                calls and cost
    each beat: screenshot + perceived text
    room end: screen invariants
  report.html + exit code
```

### 4.1 UI design

None in the game. The two reports are plain HTML pages in `review/`, for the user only.

## 5. Probes raised and resolved

| # | Type | What was raised | Resolution |
| --- | --- | --- | --- |
| 1 | contradiction | "Playtest" vs bots that read data and know every puzzle | Named for what each part is (user) |
| 2 | gap | Bots bypass the input path | A scripted input check per room (user) |
| 3 | gap | A seam in production | The env flag plus a refusal on Fly, with a spec (user) |
| 4 | ambiguity | Can't see for a model that cannot hear | Captions plus page text (user) |
| 5 | gap | The model could see what a player cannot | Perceived text and screenshots only; no view data or room design data in a prompt |
| 6 | gap | Cost | The agent loop (~$55 a heist) replaced by one review call per role per beat (~$2), an estimate plus `--yes` (user) |
| 7 | gap | No SDK, and the proxy's support is unproven | A dev dependency (ADR 0028); proved first |
| 8 | gap | Flaky frame sampling | Wait for a settled canvas; flaky patterns |
| 9 | gap | Run length in `pnpm check` | Own commands, not in check (user) |

## 6. Handoff notes for planning

- **Order:**
  1. The proxy proof (one image call).
  2. The autopilot seam, with its refusal spec, test first.
  3. The regression run: setup, the input check, autopilot, frame invariants, room-end invariants,
     evidence (with perceived text), report.
  4. The review: prompt, structured answer, cost guard, report.
  5. One reviewed room, then docs.
- **Do not re-litigate:** neither command is in check; no agent loop; no scripted puzzle-solver; the
  model sees only what a player perceives.
- **Risks:**
  - the proxy refusing images
  - a model reading screenshots differently from people (findings are leads, checked by a person)
