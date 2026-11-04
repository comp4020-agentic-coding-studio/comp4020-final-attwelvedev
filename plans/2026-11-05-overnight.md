# Overnight run 2026-11-05: decisions made without the user
- bp01/task67: the plan says the cleared room "keeps ticking" until Next, but the server stops its
  interval on clear (`src/net/attach.ts` `tick`), so the stale view is only the cleared room's last
  one; and the bug is a race (it passes unless the new tick-0 view lands after Game re-mounts) → the
  spec waits for `cleared` instead of 500 ms of cleared ticks, and delays the new room's tick-0 view
  by 1.5 s with Playwright `routeWebSocket` to make the race deterministic, on its own app with two
  one-step fixture rooms (`spec/fixtures/rooms-next`) rather than room 1, because it reproduces the
  real failure in seconds instead of a 90 s route. Reversible by rewriting the spec to the plan's
  room-1 recipe (it would then pass on the old code most runs).
- bp01/task69: `pnpm format` rewrote the generated `__ids__/*.json` snapshots (Biome collapses and
  re-indents them), so they stopped matching the test's output → added `!src/game/rooms/__ids__` to
  biome.json's `files.includes`, the way `src/data/*.json` is excluded, because CLAUDE.md says never
  to format generated files and the snapshot must be byte-for-byte what the test writes. Reversible
  by removing that line and emitting Biome's layout from the test.
- bp01/task70: at 375 the feed strip clips the top of Can't see's hat, because `drawOwnBlind` draws at
  the game's fixed size → left as the plan specifies (reuse `drawOwnBlind` unchanged, no DESIGN.md
  edit) and queued for the morning review, because scaling it would change a shared figure function
  outside the task. Also set `nowMs` only on the blind feed so the sighted feeds' look is unchanged.
  Reversible by adding a size option to `drawOwnBlind` and passing it from Feeds.
- bp02/task71: the plan says to log the jam "in `src/net/attach.ts` beside the station `wrong`", but
  station lines are built in `gameLinesFor` (`src/lib/gameLog.ts`), which attach.ts loops over → added
  the `jam` result there (kind only, with a unit test), because that is where a `wrong` is logged
  today. Also added `src/client/render/jammed.test.ts` (not in the plan's list) so the jammed look
  has a test that was shown red. Reversible by moving the line, or deleting that test file.
- bp02/task81: the "long nickname wraps without clipping" check → screenshotted with a 16-character
  name (the server's cap), which stays on one line beside "Not ready" at 375, because no longer name
  can exist. Reversible by queuing a narrower viewport check.
- bp03/task72: the plan has `src/net/game.ts` pass roles to `createWorld`, but `game.roles` changes
  after the world is made (a swap at a reveal, a crew re-pick) → the net sets `game.world.roles` from
  `game.roles` just before each `step`, and `solve.ts`/`attract.ts` pass roles to `createWorld`;
  `forecast.ts`, `brain.ts`'s collision model and `mockup.ts` keep no roles, because they never step
  an Act (the mockup's view shows the read hint from its `role` argument). Reversible by threading
  roles through `freshWorld` and re-setting them in `setCrew`.
- bp03/task72: the plan's (b) says a sighted seat's act hint at the plate is undefined, but beside
  other seats the hint is "Hold hands" or "Let go" → the test runs each sighted seat in its own world
  with the others parked away, and also asserts `world.reading` stays empty. Reversible by editing
  the test.
- bp03/task73: the plan asks for one faulty fixture per rule in `spec/fixtures/clue-faults/`, but that
  folder holds one room whose exact message list is asserted, and a plate in it would trip the
  rooms-1-to-3 rule → each rule has a small inline room in `lint.test.ts` (the plan's "Tests first"
  shape), and no fixture file was added. Reversible by adding `spec/fixtures/plate-faults/`.
- bp03/task73: "a radio's pips naming the band" can never hold (pips carry the digit, never the band)
  → the radio rule only checks `part === 0`; the decoy rule waits for Task 78. Also, the dial
  tumbler guard (Task 74's step 4) landed here with its perception test, because the lint's dial
  rule asks exactly that question. Reversible by moving the guard commit.
- bp03/task74: `claimJobs` gives a seat one job per beat, and Can't see's beat-3 job is the listen →
  the read job is in beat 2 and the plate at (18,3), beside the K1 flag where the team gathers,
  because a beat-3 read would have taken the listen job off Can't see. The plate entity also shows
  `state: "on"` while a hand is on it, because the one-tick `flash` was missed by a guide looking
  elsewhere, which left the blind bot waiting forever. Reversible by moving the plate and job.
- bp03/task74: PARKED. `pacing.test.ts` (at most two new kinds of thing per room) fails, because room 4
  introduces station, gear and braille → parked on `auto/blind-purpose-parked-03-task74` rather than
  exempting braille myself, because exempting it would loosen a guarded promise. Recommended ruling:
  count a plate as part of its station. Reversible by merging that branch once ruled.
