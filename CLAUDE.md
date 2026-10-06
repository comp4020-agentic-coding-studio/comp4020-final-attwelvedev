# Project invariants

<!-- PLACEHOLDER: fill in once the stack and first ADR are chosen, then delete
     this comment. Concrete rules beat general ones, so name real paths and
     commands. -->

- **Persistence:** only `/data` survives a restart or redeploy (`fly.toml`).
  Nothing important lives anywhere else.
- **Run it:** TBD — the command that starts the app locally on `:8080`.
- **Dependencies:** adding one needs a reason (and an ADR if it shapes the
  app). The machine has 256 MB; check the cost before adding.
- **Shape of the app:** TBD — the core interaction, what counts as a person,
  what a visitor's trace is, and how a change reaches every open session.
- **Naming and layout:** TBD — conventions the code should follow.

# Working method

## Corrections go into the harness

When I correct the agent for something it could get wrong again, fix the
cause, not just the instance: add a rule here, or a check in `spec/` or
`pnpm check`, then log it in `PROCESS_LOG.md`. A repeated mistake is a missing
sensor. A bug fix starts with a failing test that reproduces it.

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
