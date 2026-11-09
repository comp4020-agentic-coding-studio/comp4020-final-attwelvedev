# CI failures on PR 3 (draft): handoff

Rewritten 2026-11-10 as a handoff. The per-failure evidence (numbers, probes, what was shown red) is in the commit
messages named below; `git log --grep "PR 3 CI"` lists them. PR 3 is `auto/overnight`, still a draft. Do not merge it
while CI is red or flaky: the `deploy` job runs on `main` for this public repo.

## Where it stands

- Remote head is `5ed2beb`. Five commits are local and **not pushed**: `10fa998` (labels stall report), `6590134`
  and `8664741` (earlier versions of this file), `ca007d9` (labels replaced by a unit test), and the commit that holds
  this version.
  `pnpm check` was green on all of them against an app started the way CI starts it (see "Verifying").
- CI record, nearly the same code throughout: 42579267291 attempt 1 pass, attempt 2 fail (door-pill, game); 42586723384
  fail (labels, door-pill); 42595732106 fail (same, a `workflow_dispatch`); 42605097983 fail (spectator, game);
  42611330796 attempt 1 pass, attempt 2 pass, attempt 3 fail (labels room 05). The last commit alone, `5ed2beb`,
  passed twice and failed once. Passing runs took 13 to 17 minutes of the 20 minute cap.
- Nothing after `5ed2beb` has been through CI. Every earlier push passed local checks and then exposed a new
  failure on the runner, so expect more.
- The `pull_request` trigger did not fire for two pushes (a81c081, 1c936f2), cause unknown. If a push starts no run
  after a few minutes: `gh workflow run checks.yml --ref auto/overnight` (dispatch; the deploy job needs `main`, so it
  cannot deploy). Find a run by its ID: `headSha` is the full 40 characters.

## What was wrong, and what was done (one line each)

| test | cause | change | commit |
|---|---|---|---|
| labels rooms 3, 5, 7 | the walk, in ten shapes: room 3's camera sends the team back to the spawn; a held key; taps | **replaced** by a unit test over every floor tile; the browser test is one check at room 5's spawn | `ca007d9` |
| door-pill | figures overshot the 1-tile plate on a late key-up, so the door never opened | wall on the tile after each plate in `spec/fixtures/rooms-door` | `3c03d5d` |
| escape-hud | walk overshot the gear on a late key-up | hold short of it, then nudge (`nudgeTo`) | `4796880`, `ba9538c` |
| game "back at spawn" | picture compared after a "settle"; then my replacement moved during the restart's 2.4 s hold | position (`data-self`) plus the server's tick in `data-net` | `a2400a3`, `0f65cf1` |
| spectator "receives the msgs" | one callout sent before the server handled `spectate` | resend every 200 ms until received | `0f65cf1` |
| reveal "joins late" | `expect.poll` default of 1 s vs a 0.5 s draw | spec project default 8 s (`vitest.config.ts`) | `56f4397` |
| standing (unit, 20 s limit) | one test doing ten tests' work | split into ten, and one into two | `f746849` |

## Unexplained, with reports in place

None of these has failed in CI. Each failed once in a local full check and then passed 3 of 3 alone and in 4 of 4
`pnpm check:flaky`; their failure messages now say what happened (`eb904dd`, `5d49130`, `10fa998`):

- **reveal "lets a person take I'm ready back".** Hypothesis, not shown: `send` in `src/client/socket.ts` drops a
  message while the socket is not open, and the page flips its own button first.
- **home "holds still with reduced motion".** Two screenshots 400 ms apart differed; no cause found in 120 tries.
- **labels room 05 (run 42611330796 attempt 3).** The figure stuck at (9.5, 4.6), one run with `conn` Offline. Never
  reproduced. The walk it came from no longer exists.

## Still the same shape, not touched

Browser specs that hold a key or compare canvas pictures and have not failed: `game.test.ts`'s other two restart
tests ("leaves everyone where they are when one person says No", "lets a player move again after a restart", the
latter a raw `canvasHash` in an 800 ms loop), `hud.test.ts`'s four-restart test, `wheel`, `braille`, `voice`, `sight`,
`intro`. `escape-hud` and `door-pill` are fixed in place but were never replaced by something that cannot walk-flake.
Replace one only after it fails, or if you accept losing its coverage; check what else covers it first.

## Verifying (the trap that cost the most time)

- **Run the app the way CI does.** `pnpm start:check` sets `INTRO_MS=0`, so the room's 2.4 s start hold is over at
  once and a spec that moves a seat right after a start or restart passes locally and fails in CI (`game` did, 3 of 3
  when reproduced). Start it yourself: `PORT=8091 DATABASE_PATH="$(mktemp -d)/app.db" node server.ts`, then
  `APP_URL=http://localhost:8091 pnpm check`. Another process may hold :8080 (a stale `astro dev` did, and the suite
  then ran against it).
- A fix is shown red-to-green by injecting the fault: a late key-up, a blur, a follow or restart delayed in the
  server, a CPU throttle (`SPEC_CPU_THROTTLE=n`). A failure that no local condition reproduced (labels' camera, room
  05) is inferred, not shown; say so in the commit.
- A scratch break goes through a script that asserts the text it replaces, never a bare `sed` (macOS `sed -i` needs
  an argument and one silently did not apply). Restore and `grep -c BREAK` afterwards.

## Open decisions for the user

- **CLAUDE.md note about `INTRO_MS=0`** (proposed, not applied): a spec that moves a seat right after a start or
  restart is also run once against an app started without it; wait for the restart's own signal (`tick` in `data-net`
  down, then at least 1), not `data-intro`, which still reads the old room's `done` for a moment.
- **A `PROCESS_LOG.md` entry** (CLAUDE.md asks for one; a draft was given in the conversation, not written to the
  file, because it records the user's decisions). The best moments: a fix dropped before it was written because the
  test would have passed on the unfixed code; the evidence-first `data-net` that showed the app was fine; the replacement
  of `game`'s test that was itself wrong and hidden by `INTRO_MS=0`.
- **Push the five local commits**, and whether to re-run a green commit a few times (`gh run rerun <id>`) before
  trusting it.

## Found along the way, not fixed

- `game.test.ts` "shows each role's frame, and only the sighted roles' canvas has walls" cannot fail for its main
  claim: with the blind page handed the whole map and the renderer's blind check removed, it still passes.
- Shuffling `hud.test.ts` is not a valid check: the unmodified file fails under the same seeds.
- The runner is about 2.5 times slower per file than a 12-core laptop (reveal.test.ts is 131 s here, 324 s in CI).
- Docker `--cpus=2` was dropped: `labels` and `escape-hud` start their own `node server.ts` and never use the
  container CI starts.

## Do not

- Raise a timeout to make a failing test pass (CLAUDE.md, "Flaky tests"). The 8 s poll default is a default for waits
  that named no bound, chosen against measured times, not a bump to one failing wait.
- Retry until green, or call a branch fixed on one pass. Five of eight attempts failed with nearly the same code.
- Trust "passes under throttle" or "passes under shuffle" as proof a failure is gone: the walks that failed in CI
  never failed locally under 24 busy loops or 8x throttle.
