# Project invariants

- **Persistence:** only `/data` survives a restart or redeploy (`fly.toml`).
  Only heist records persist (ADR 0009); lobbies and games live in memory and
  die with the process.
- **Run it:** `pnpm install && pnpm build && pnpm start` serves on `:8080`
  (DB at `./.data/app.db`; set `DATABASE_PATH` to move it). One Node process
  (`server.ts`) serves the Astro handler and a WebSocket endpoint at `/ws`.
  `pnpm dev` is for hot reload.
- **Dependencies:** adding one needs a reason (and an ADR if it shapes the
  app). The machine has 256 MB; check the cost before adding.
- **Shape of the app:** a three-player browser co-op heist where each player is
  missing a channel (Can't see, Can't hear, Can't speak) and they coordinate by
  sending messages by *method* (callout, text, voice, clip, face, mark). Who may
  send and who receives each is the `SENDS`/`RECEIVES` table in
  `src/game/types.ts` (ADR 0011); the sender never gets its own message back.
  A person is an anonymous device cookie plus a nickname (ADR 0008); the server
  runs a headless simulation per room over WebSockets (ADR 0007). See
  `specs/2026-10-08-sensory-heist.md` and
  `plans/2026-10-08-sensory-heist-00-overview.md`.
- **Layering:** `src/game/` (pure, headless) <- `src/net/` (socket server) and
  `src/client/` (browser); client reaches net only via `net/protocol.ts`; pages
  never import `src/net/` (separate module instance), so state both sides share
  lives on `globalThis` behind one accessor (`sharedStats()`). The client may
  also import the pure `src/game/crew.ts` (the lobby's rotation table calls
  `pickCrew`).
  `src/layering.test.ts` enforces the import rules.
- **Perception:** the server sends each client only what its role perceives
  (ADR 0007). Never add a field to a view or message without checking it
  against the role tables in `src/game/types.ts`.
- **Sensory parity:** team-wide events (loot, checkpoint, caught, alarm, cleared,
  flag, exit, sequence results) reach every role in the same tick. Local events
  reach the roles that can perceive them from where they stand: the sighted see
  what is in their line of sight (`visibleFrom`; walls, vents and closed doors
  block it, glass does not), the hearing hear what the sound reaches (walls and
  glass stop it, vents do not; ADR 0012). Every sound has a row in
  `src/game/parity.test.ts`; the typecheck and test fail without one. The alarm
  and the `clue` chime are the two deliberate exceptions (a `clue` has no
  picture, by design). A new effect or state for the sighted goes in `detectFx`
  (`src/client/fx.ts`) or the view, with its sound.
- **Rooms:** `rooms/NN-slug.room` (format in the phase 02 plan §4.1). Never
  hand-write one without running `pnpm lint:rooms` and `spec/rooms.test.ts`
  (bots must clear it in every role rotation).
- **Naming and layout:** domain services in `src/lib/` take `db` first and
  never touch requests. Unit tests sit beside the code; promises to users get
  `spec/<area>.test.ts`; browser checks get one `spec/layout/<area>.test.ts`
  per area.

# Working method

## Corrections go into the harness

When I correct the agent for something it could get wrong again, fix the
cause, not just the instance: add a rule here, or a check in `spec/` or
`pnpm check`, then log it in `PROCESS_LOG.md`. A repeated mistake is a missing
sensor. A bug fix starts with a failing test that reproduces it.

## Ideas mid-phase go to the backlog

When a new feature idea or spec-level issue comes up partway through a phase,
don't act on it. Add one dated line to `specs/backlog.md` and finish the
current phase first. At each phase boundary, I sort the backlog with
`/brainstorm-feature`. Plain bugs skip the backlog: fix them now, starting with
a failing test.

## Before pushing

- `pnpm check` (types, lint/format, `spec/` tests) must be green. It runs
  against the live app, so start it first (`APP_URL`, default
  `http://localhost:8080`). `pnpm format` auto-fixes style.
- A visual change is verified by running the app and looking at a screenshot at
  desktop and phone width: the render is the truth, not the source. A layout
  spec measures the promise, not a stand-in for it (slot boxes that never
  touch, not "centres are far apart"; a target at least 48 px, not "the scale
  is 1"; text not clipped via `scrollHeight`), for every role and viewport.
  When a component is reused outside the parent its styles were written for,
  or is given a longer name, title or number than the test used, look at a
  screenshot at that place and with that input before reporting done.

## Tests

vitest runs a file's tests serially and files in parallel, so the slowest file
sets `pnpm check`'s time. Put slow (browser, server-booting) tests in a file per
area, and measure per file (`vitest run --reporter=json`) before guessing at a
fix.

## Flaky tests

A red run that goes green on a retry is a flaky test, and a retry hides it.
Never retry to get green. Run `pnpm check:flaky` (give it a number for more
runs): a test that fails in **every** run is a bug, one that fails in **some**
is flaky. Then fix the cause:

- A picture of the canvas is a moving image: compare `settledHash(page)`
  (`spec/playUi.ts`), never one `canvasHash` frame, and never one taken right
  after a game starts.
- Wait for the thing, not a time: `expect.poll` or `waitFor`, not
  `waitForTimeout` followed by an assertion. A count read earlier is stale
  while other spec files add and drop lobbies on the same server.
- A gesture whose speed matters (a flick under 200 ms) is dispatched inside the
  page in one task: each step from the test runner is a round trip.
- A rate is events over the time they took, not events in a window whose edge
  the runner decides.
- Do not raise a timeout to make a failure go away. Raise it when the work is
  genuinely slower under load, and say why beside the number (see
  `vitest.config.ts`).

`spec/flaky-patterns.test.ts` fails on the two shapes precise enough to grep
for. Add a rule there when a new shape can be matched without false alarms;
otherwise it belongs in this list. Restart the server between runs: leftovers
fill its 40-lobby cap and time out unrelated specs.

## Editing files

Replace a named block, not "from here to the end of the file": slicing to the
end silently drops whatever follows. Formatters rewrite files under you, so
match on a short unique string, and re-read before a large edit.

## Hygiene

Never hand-edit build output or generated files; fix the source and rebuild.
Never commit a key, and never widen `.gitignore` (`.env*`, `mise.local.toml`,
`.claude/`) to make one committable. One commit per unit of work once
`pnpm check` passes, with a message that says what changed and why.

## Harness config

`harness/claude-settings.json` is the project's Claude Code config
(`.claude/settings.json` is a gitignored symlink to it). It holds the hooks
(course-fixed files are blocked from edits, deploys from a dirty tree are
blocked) and permissions. If a block is wrong for a legitimate change, ask me;
don't route around it.

## Logging

`src/middleware.ts` writes one JSON line per request to stdout (`flyctl logs`),
and socket events are `game` lines too. A log line is the app's account of what
users did, so:

- Never log a field that is not in `redact`'s allowlist (`src/lib/log.ts`).
  Add to it on purpose, with a reason.
- Never log a raw path, nickname, team name, chat text, voice, token or cookie.
  Never put chat text, callout or clip choices, face or stamp ids, nicknames,
  team names or lobby codes in a game `detail`: log the *kind* of thing
  (`method`, `role`, `kind`), not its content.
- A new POST endpoint needs an `ACTIONS` entry (`src/lib/requestLog.ts`). A new
  socket event goes through `logGame` (`src/lib/gameLog.ts`), one line per
  discrete event and never per tick, with its name added to `GameEvent`.

## Decisions (ADRs)

Decisions that are expensive to reverse, or that someone will ask about later
(the stack, what counts as a person, what persists, how a change reaches every
open session), get an ADR in `doc/adr/NNNN-short-slug.md` in Nygard's format.
Status starts `proposed` and becomes `accepted` once I approve it. An accepted
record is never edited: a changed mind is a new record, and the old one's status
becomes `superseded by NNNN`. Commit the ADR with the work it governs.

## PROCESS.md and PROCESS_LOG.md

`PROCESS.md` is the graded account of **my** decisions, rewritten (not appended
to) at each crit and citing commits that actually resolve (`pnpm check:evidence`;
never cite before committing). A moment only counts if it says why the call beat
the obvious one and how I knew the result was right. The strongest land the
correction in the harness itself. Log every qualifying moment to
`PROCESS_LOG.md` (append-only, format in its header comment) as it happens,
especially corrections I make after seeing a result. Link ADRs rather than
restating them.
