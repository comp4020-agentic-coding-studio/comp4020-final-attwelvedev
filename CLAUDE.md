# Project invariants

- **Persistence:** only `/data` survives a restart or redeploy (`fly.toml`).
  Nothing important lives anywhere else. Only heist records persist (ADR 0009);
  lobbies and games live in memory and die with the process.
- **Run it:** `pnpm install && pnpm build && pnpm start` serves on `:8080`
  (DB at `./.data/app.db`; set `DATABASE_PATH` to move it). `pnpm start` is
  `node server.ts`: one Node process serving the Astro handler
  and a WebSocket endpoint at `/ws`. `pnpm dev` is for hot reload.
- **Dependencies:** adding one needs a reason (and an ADR if it shapes the
  app). The machine has 256 MB; check the cost before adding.
- **Shape of the app:** a three-player browser co-op heist where each player is
  missing a channel (Can't see, Can't hear, Can't speak) and they coordinate
  through role-gated channels (Say, Sound, Show). A person is an anonymous
  device cookie plus a nickname (ADR 0008). The server runs a headless
  simulation per room over WebSockets (ADR 0007). See
  `specs/2026-10-08-sensory-heist.md` and `plans/2026-10-08-sensory-heist-00-overview.md`.
  The pantry this repo started as is archived at tag `archive/pantry-2026-10-08`.
- **Layering:**
  - `src/game/` is pure: no DOM, no `ws`, no `node:` imports except in
    `src/game/rooms/load.ts`. Simulation, perception, channel rules, bots and
    rooms live here and run headless.
  - `src/net/` is the server side of the socket: lobby registry, game loop,
    routing. It imports `src/game/` and `src/lib/`, never Astro.
  - `src/client/` is browser-only: canvas renderer, input, audio, socket
    client. It imports `src/game/types.ts` and `src/net/protocol.ts` only.
  - Astro pages in `src/pages/` stay thin and never import `src/net/`: the
    socket server runs as a separate module instance. Anything both sides
    share lives on `globalThis` behind one accessor (`sharedStats()`).
- **Perception:** the server sends each client only what its role perceives
  (ADR 0007). Never add a field to a view or message without checking it
  against the role tables in `src/game/types.ts`.
- **Sensory parity:** whatever happens in a room reaches every role through
  something that role can perceive: Can't see and Can't speak hear it (and it
  is captioned), Can't hear sees it, in the same tick. Every sound the game can
  make has a row in `src/game/parity.test.ts`; a new `SoundCue` kind with no row
  or no caption fails the typecheck, and a row that cannot show both halves
  fails the test. The alarm is the one deliberate exception (it silences the
  other cues for those who hear). New effect or state for the sighted: add it
  to `detectFx` (`src/client/fx.ts`) or to the view, and add the sound with it.
- **Rooms:** one file per room, `rooms/NN-slug.room` (JSON metadata, a `---`
  line, then a text grid; format in the phase 02 plan §4.1). Rooms are linted
  by `pnpm lint:rooms` (part of `pnpm check`, and run by a hook on every room
  edit) and must be cleared by bots. Never hand-write a room without running
  the linter; a room needs a three-plate beat and a reachable exit.
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
`/brainstorm-feature` and record where each idea went. Plain bugs skip the
backlog: fix them now, starting with a failing test (above). The full rules
are in §5.2 of `plans/2026-10-06-shared-pantry-00-overview.md`.

## Before pushing

- `pnpm check` (types, lint/format and `spec/` tests) must be green. It runs
  against the live app, so start it first (`APP_URL`, default
  `http://localhost:8080`). `pnpm format` auto-fixes style.
- Verify visual changes by running the app and checking a desktop width and a
  phone width — the render is the truth, not the source.

## Test speed

vitest runs a file's tests serially and files in parallel, so the slowest
file sets `pnpm check`'s time. Put slow (browser, server-booting) tests in a
file per area rather than one growing file. If the check gets noticeably
slower, measure per file (`vitest run --reporter=json`) before guessing at a
fix.

## Generated files

Never hand-edit build output or generated files; fix the source and rebuild.

## Secrets

Never commit a key. `.env*`, `mise.local.toml` and `.claude/` stay in
`.gitignore`; never widen the ignore rules to make one committable.

## Commits

One commit per unit of work once `pnpm check` passes — no mega-commits, no
bundling unrelated changes. Messages say what changed and why, not "fixed
things".

## Enforced by the harness, not just asked

`harness/claude-settings.json` is the project's Claude Code config
(`.claude/settings.json` is a gitignored symlink to it, so it is versioned
while the rest of `.claude/` stays out of the repo).

- **Hooks** (`harness/hooks/`): edits to the files the course fixes
  (`fly.toml`, `spec/invariants.test.ts`, `spec/global-setup.ts`,
  `.github/workflows/`, `.githooks/`) are blocked; `flyctl deploy` is blocked
  from a dirty tree; edited files are auto-formatted with Biome.
- **Permissions:** `pnpm`, read-only `git` and `flyctl status/logs` run
  freely; `git push` and `flyctl deploy` ask first; force-push, hard reset,
  `rm -rf`, destroying Fly apps/volumes and reading secrets files are denied.
- If a block is wrong for a legitimate change, ask me — don't route around it.

## Logging

`src/middleware.ts` writes one JSON line per request to stdout (read it with
`flyctl logs`): who (a hashed device), what (`ACTIONS` in
`src/lib/requestLog.ts`), when. `/stats` shows the same activity as counts.
A log line is the app's account of what users did, so:

- Never log a field that is not in `redact`'s allowlist (`src/lib/log.ts`).
  Add to it on purpose, with a reason.
- Never log a raw path, nickname, team name, chat text, voice, token or cookie.
  The line carries the route *pattern*; lobby codes sit in the path.
- A new POST endpoint needs an `ACTIONS` entry; a test fails without one.
  Add detail from anywhere in a request with `logDetail({ via: "code" })`.
- Everything players do over the socket is a `game` line too
  (`src/lib/gameLog.ts`): `{ ts, kind: "game", event, who, lobby, detail? }`.
  `lobby` is a hash of the code and creation time, never the code. Log a new
  event with `logGame`, one line per discrete event and never per tick; its
  `GameEvent` name is added to the union. Never put chat text, callout or clip
  choices, face or stamp ids, nicknames, team names or codes in `detail`: log
  the *kind* of thing (`family`, `role`, `kind`), not its content. `/stats`
  shows the same events as counts, plus lobbies, games, players and memory now.

## Decisions (ADRs)

Decisions that are expensive to reverse, or that someone will ask about
later, get an ADR in `doc/adr/NNNN-short-slug.md`, in Michael Nygard's format
(2011): title, status, context, decision, consequences. Weighed alternatives
go in context or decision. For this app that means the stack, what counts as
a person, what persists, and how a change reaches every open session — not
every library pick or UI tweak.

- Status starts `proposed` and becomes `accepted` once I approve it.
- An accepted record is never edited. A changed mind is a new record that
  supersedes the old one; the old one's status is the only thing that changes
  (`superseded by NNNN`).
- Commit the ADR with the work it governs.

## PROCESS.md and PROCESS_LOG.md

`PROCESS.md` is the graded account of **my** decisions: 900–1100 words,
rewritten (not appended to) at each of the week 9–11 crits so it describes the
project as it stands. It explains the stack and agent workflow I chose and the
trade-offs I weighed, citing commits that actually resolve
(`pnpm check:evidence` checks this — never cite before committing). A moment
only counts if it says why the call beat the obvious one and how I knew the
result was right — not just "it worked". The strongest moments land the
correction in the harness itself (a rule here, a check added to `spec/`) rather
than a one-off fix.

Log every qualifying moment to `PROCESS_LOG.md` (append-only, repo root) as it
happens, in the format its header comment shows. Corrections I make after
seeing a result are the raw material — record them while they're fresh, then
draw on the log when rewriting `PROCESS.md`. Link ADRs from `PROCESS.md`
rather than restating them.
