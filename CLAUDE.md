# Project invariants

- **Persistence:** only `/data` survives a restart or redeploy (`fly.toml`). Only heist
  records persist (ADR 0009); lobbies and games live in memory.
- **Run it:** `pnpm install && pnpm build && pnpm start` serves on `:8080` (DB at
  `./.data/app.db`; `DATABASE_PATH` moves it). One Node process (`server.ts`) serves Astro
  and a WebSocket at `/ws`. `pnpm dev` is for hot reload.
- **Dependencies:** adding one needs a reason (and an ADR if it shapes the app). The machine
  has 256 MB; check the cost first.
- **The app:** a three-player co-op heist where each player lacks a channel (Can't see, Can't
  hear, Can't speak) and they coordinate by *method*; `SENDS`/`RECEIVES` in
  `src/game/types.ts` say who may send and receive each (ADR 0011). See
  `specs/2026-10-08-sensory-heist.md` and the ADRs.
- **Layering:** `src/game/` (pure) <- `src/net/` (socket server) and `src/client/`
  (browser). The client reaches net only through `net/protocol.ts`; pages never import
  `src/net/` (a separate module instance), so state both sides share lives on `globalThis`
  behind one accessor (`sharedStats()`). The client may import the pure `src/game/crew.ts`.
  `src/layering.test.ts` enforces this.
- **Perception:** the server sends each client only what its role perceives (ADR 0007).
  Check any new view or message field against the role tables in `src/game/types.ts`.
- **Sensory parity:** team-wide events (loot, checkpoint, caught, alarm, cleared, flag,
  exit, sequence results, door (an ordinary door's unlock), a cache's `uncover` and `stash`) reach every role in the same
  tick. Local events reach the roles that can perceive them from where they stand: the
  sighted see their line of sight (`visibleFrom`; walls, vents and closed doors block it,
  glass does not), the hearing hear what the sound reaches (walls and glass stop it, vents
  do not; ADR 0012). Every sound has a row in `src/game/parity.test.ts` (typecheck and test
  fail without one); the alarm, the `clue` and `rest` chimes and gear are the deliberate exceptions,
  each with its reason in its row. A new effect or state for the sighted goes in `detectFx`
  (`src/client/fx.ts`) or the view, with its sound. A cache's riddle and a braille plate's
  cells are own-seat-only view fields for Can't see only (the `tap`, `jam` and `rest`
  sounds have parity rows; `rest` joins the no-picture exceptions); a hidden chamber and its secret doors read as wall
  on every sighted map until they open, with no `door` event.
- **Rooms:** `rooms/NN-slug.room`, linted by `pnpm lint:rooms`, at most two new things per
  room (`pacing.test.ts`), cleared by perception-only bots (ADR 0018): a bot solves only
  from what it perceives and what teammates send, so never hand it the simulation's state,
  and a station type needs its decoder in `src/game/bots/decode.ts`. A cache's chamber is
  Rooms 4 to 9 have exactly one `o` braille plate (`PLATE_ROOMS`); its carried part is
  given nowhere else and it never names a teaching station or cache. From room 4 a wire
  plaque is a seeded riddle (`WIRE_RULES[].riddles`, `NUMBER_RIDDLES`) that bots read
  through `ruleOfText`/`numberOfText`. A cache's bot jobs carry `"cache"`; prove them in
  `spec/bots-caches.test.ts`. A cache's chamber is
  appended **below** the room's rows. **Ids are numbered in reading order**, so a letter
  placed before an existing one of its kind renumbers it: append new ones after, and
  confirm nothing moved (`src/game/rooms/ids.test.ts`). Run `pnpm lint:rooms` and
  `spec/rooms.test.ts` after any room edit. `pnpm mockup:room` shows what each role
  perceives on a tile; it does not replace the three-tab playtest.
- **Naming and layout:** services in `src/lib/` take `db` first and never touch requests.
  Unit tests sit beside the code; promises to users get `spec/<area>.test.ts`; browser
  checks get one `spec/layout/<area>.test.ts` per area.

# Working method

## Corrections go into the harness

When I correct the agent for something it could get wrong again, fix the cause: add a rule
here, or a check in `spec/` or `pnpm check`, then log it in `PROCESS_LOG.md`. A repeated
mistake is a missing sensor. A bug fix starts with a failing test that reproduces it.

Every new test that guards a promise is shown to fail first: break the code it guards on
purpose, watch it go red, restore the code, and say in the commit what was broken. A test
that cannot be made to fail is deleted. Break checks go through a script that asserts the
text it replaces, never a bare `sed` (one silently did not apply).

A render bug that will not reproduce from the model is reproduced by drawing the real scene
on a real canvas and looking, before any fix. Measure the op that carries the symptom (a
figure's body, not its shadow).

## Visual changes read DESIGN.md first

Before changing the look, read `DESIGN.md`. A change to the look, a token, a component's job
or the copy rules updates it in the same commit; `spec/design.test.ts` fails on a name that
doesn't exist.

## Ideas mid-phase go to the backlog

A new idea or spec-level issue partway through a phase is not acted on: add one dated line
to `specs/backlog.md` and finish the phase. I sort the backlog with `/brainstorm-feature`
at each phase boundary. Plain bugs skip the backlog: fix them now, test first.

## Before pushing

- `pnpm check` (types, lint/format, `spec/` tests) must be green, not only the tests near
  the change. It runs against the live app: start it first (`APP_URL`, default
  `http://localhost:8080`) with `pnpm start:check`, a throwaway database and `INTRO_MS=0` (no
  hold before a room's first tick). CI starts the app without it, so the real 2.4 s hold runs there:
  a spec waits for the first tick with `nextTick`'s default (it covers the hold), never a short
  timeout of its own. A spec that needs
  an empty board runs its own app (`spec/leaderboard.test.ts`). `pnpm format` fixes style.
- A visual change is verified by running the app and looking at a screenshot at desktop and
  phone width: the render is the truth, not the source. A layout spec measures the promise,
  not a stand-in (slot boxes that never touch, not "centres are far apart"; a target at
  least 48 px; text not clipped via `scrollHeight`), for every role and viewport. A new
  overlay that shares a corner of the frame with another names that neighbour in its spec.
  When a component is reused outside its parent, or given a longer name or number than the
  test used, screenshot that place with that input before reporting done.

## Tests

vitest runs a file's tests serially and files in parallel, so the slowest file sets
`pnpm check`'s time. Browser specs run at most 3 files at once (`maxWorkers` in
`vitest.config.ts`): uncapped, they starved the machine. Don't raise it without timing a full
check twice. Put slow tests in a file per area, and measure per file
(`vitest run --reporter=json`) before guessing at a fix.

## Flaky tests

A red run that goes green on a retry is a flaky test, and a retry hides it. Never retry to
get green. Run `pnpm check:flaky` (a number for more runs): a test that fails in **every**
run is a bug, one that fails in **some** is flaky. Fix the cause, never a timeout. The shapes
that have caused flakes, with their rules, are in `spec/flaky-patterns.test.ts`; add a rule
there when a shape can be matched without false alarms.

## Editing files

Replace a named block, not "from here to the end of the file": slicing to the end silently
drops what follows. Formatters rewrite files under you, so match on a short unique string
and re-read before a large edit.

## Hygiene

Format only with `pnpm format` (Biome); never run `prettier` (a stray run rewrote 60
files). Run `git status` after any formatter. Never hand-edit build output or generated
files. Never commit a key, and never widen `.gitignore` (`.env*`, `mise.local.toml`,
`.claude/`) to make one committable. One commit per unit of work once `pnpm check` passes,
saying what changed and why.

## Harness config

`harness/claude-settings.json` is the Claude Code config (`.claude/settings.json` is a
gitignored symlink to it): hooks (course-fixed files are blocked from edits, deploys from a
dirty tree are blocked) and permissions. If a block is wrong for a legitimate change, ask
me; don't route around it.

## Logging

`src/middleware.ts` writes one JSON line per request to stdout (`flyctl logs`); socket events
are `game` lines too. A log line is the app's account of what users did:

- Never log a field not in `redact`'s allowlist (`src/lib/log.ts`); add to it on purpose,
  with a reason.
- Never log a raw path, nickname, team name, chat text, voice, token or cookie. A game
  `detail` holds the *kind* of thing (`method`, `role`, `kind`), never callout or clip
  choices, face or stamp ids, nicknames, team names or lobby codes.
- A new POST endpoint needs an `ACTIONS` entry (`src/lib/requestLog.ts`). A new socket event
  goes through `logGame` (`src/lib/gameLog.ts`): one line per discrete event, never per
  tick, its name added to `GameEvent`.

## Decisions (ADRs)

Decisions that are expensive to reverse, or that someone will ask about later, get an ADR in
`doc/adr/NNNN-short-slug.md` (Nygard's format). Status starts `proposed` and becomes
`accepted` once I approve it. An accepted record is never edited: a changed mind is a new
record, and the old one becomes `superseded by NNNN`. Commit the ADR with the work it
governs.

## PROCESS.md and PROCESS_LOG.md

`PROCESS.md` is the graded account of **my** decisions, rewritten (not appended to) at each
crit, citing commits that resolve (`pnpm check:evidence`; never cite before committing). A
moment counts only if it says why the call beat the obvious one and how I knew the result
was right; the strongest land the correction in the harness itself. Log every qualifying
moment to `PROCESS_LOG.md` (append-only, format in its header comment) as it happens,
especially corrections I make after seeing a result. Link ADRs rather than restating them.
