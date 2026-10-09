<!--
Append-only working log of candidate PROCESS.md moments, in the order they
happened. Each entry: a `## <date> — <short title>` heading, then a commit
citation (`resolved by <sha>` or `<sha>..<sha>`), then up to ~300 words on
what the call was, why it beat the obvious one, and how the result was
checked. Never edit or reorder past entries; append new ones at the end.
PROCESS.md is rewritten at each of the week 9–11 crits: draw on the best
entries then, and link ADRs instead of restating them.
-->

## 2026-10-07 — A review rule that could never be satisfied, fixed in the harness

099c444, 8f8d656, 59248b8

Task 7 (the live pantry island) carried a `Human review:` line telling me to
watch two real browsers on the deployed fly.dev URL. Two rules I had written
into my own harness made that impossible: a task with a Human review mustn't be
committed before I accept it, and the deploy hook refuses a dirty tree. So the
review could only happen after the commit it was supposed to gate. The agent
stopped and asked instead of picking a way round it.

The obvious fix was a one-off: commit anyway and tick it later, as phase 01
had quietly done. I chose to resolve it where it came from. I held the review
on a local build, which shows what I actually wanted to judge (live changes
feeling calm, focus staying put) and keeps the tree uncommitted until I accept.
What a local build can't show is whether Fly's proxy buffers the stream. That
moved out of the review and into the phase's Definition of Done, as the
`spec/live.test.ts` run against the deployed app, where its 1000 ms assertion is
the evidence.

I then made the same correction in the harness so it can't recur: the plan's
Task 7 line (099c444), the `execute-plan` skill (8f8d656) and the `plan-feature`
skill and template (59248b8). A review line that demands a deployed copy is now
a plan conflict to raise before work starts.

How I knew it was right: I did the review locally with two browsers, accepted
Task 7 (abb66d5), and the three documents now say the same thing, so a future
phase's plan and executor can't disagree about it again.

## 2026-10-07 — A plan gap caught because a link-preview can burn a single-use token

resolved by 76c33de

My plan said device links open a confirm page and redeem only on POST, because
chat apps and browsers prefetch links and a prefetch would use up a single-use
token. It also said that page reads "Sign in as Sam on this device". But the
only service the plan listed for device links was `redeemDeviceLink`, which
uses the link up. Following the plan literally meant either showing no name or
redeeming on GET, which is the exact failure the design decision exists to
prevent.

The agent noticed while building the page, added `previewDeviceLink` (reads the
link without marking it used) rather than quietly redeeming on GET, and wrote
the new signature back into the phase file so later phases see it. I kept the
decision (no sign-in on GET) and let the interface list give way.

How I knew it was right: a spec opens the link as a fresh client and asserts
`GET /` is still the first-run form, then that a POST accepts it and a second
accept is a 404. A unit test checks the preview works twice and stops working
at expiry and after redemption.

## 2026-10-07 — Two failing specs, both fixed without touching the assertion

resolved by 76c33de, a15219d

My rule is that a failing test is told by fixing the code or stopping, never by
loosening the test. Two failures tested it. In 76c33de, "leave clears the
cookie" failed: the app was right, but the spec's cookie jar only treated
`Max-Age=0` as deletion, while Astro expires the cookie with a past `Expires`.
I checked the real response headers first, then fixed the jar to honour
`Expires` as browsers do, so the assertion stayed exactly as written. In
a15219d, "a new member shows within 1000 ms" failed on a strict-mode locator
clash: "Alex" also matched the screen-reader-only text inside the Remove button.
The member had appeared at about 580 ms. I narrowed the locator to the name
cell and left the 1000 ms bound untouched.

The obvious shortcuts were to drop the cookie check or to widen the timeout
until it passed. Both would have hidden a real behaviour. What made these safe
to fix in the test code is that each time I confirmed the app's behaviour
independently first (response headers; the 580 ms measurement) before touching
anything.

## 2026-10-07 — Publish after the commit, as a rule in CLAUDE.md

resolved by 450f735

Every write now tells the household's open pages about itself. The obvious
design is to publish from inside the service, next to the write. I decided the
other way (D1): services return their change, and the endpoint publishes after
the write has committed. Publishing inside a transaction can announce a change
that then rolls back, and it ties domain code to the live hub, which unit tests
would then need to fake.

I put the decision in `CLAUDE.md` so it binds future phases (offers will add
many more publish calls): services return their change, endpoints publish after
the commit, and a broken stream must never fail the request that triggered it.

How I knew it held: the hub unit test shows a throwing subscriber doesn't stop
the others or make `publish` throw; a spec aborts a stream mid-session and the
next write still succeeds; and the live specs show a housemate hears an add
within the 1000 ms bound while a third household hears nothing.

## 2026-10-07 — Reviewing the offer flow changed a rule the spec had settled

42655e7

Task 20's plan said the household's first offer opens a note sheet and every
later offer posts in one tap, with the first note kept as the default. It passed
every check I had. Using it, I saw the rule was wrong: a pickup note describes
one item ("left of the green door, after 6"), so a remembered default would be
the wrong text more often than the right one, and a one-tap post would send it
anyway. I also wanted my own offers to show which note each one carries.

The obvious response was to tweak the UI and leave the rules alone. I changed
the rules instead: every Offer opens the sheet prefilled with the last note,
editable before posting; each offered or claimed row has a Note button; the
offering household sees its own note. Two tests then encoded the old rules
(first note becomes the default; the offerer's page never contains the note), so
I had the agent restate them as the new rules, not delete them, and say so in
the plan's corrections log. The privacy spec still fails if a note reaches a
third household or a community channel.

The change also contradicted accepted ADR 0004 ("notes only on the claimer's
stream"). I did not edit it; a superseding record is queued.

How I knew it held: red unit and browser tests for each changed behaviour before
the code, then the full check green (455 tests) and a walk through the offer,
claim and collect flow on a local build with a second browser profile.

## 2026-10-07 — A "flaky" spec was a real race, found by looking at the event order

4748811

`pnpm check` was red on one offers spec while I was part-way through the Enamelware
shell. The obvious move was to commit the shell and call the spec flaky, or to
raise its 1000 ms timeout. I told the agent to fix it first. It checked the clean
previous commit in a throwaway worktree (5 of 6 runs failed there too, so the shell
was not the cause), then logged the claimer page's live events and responses. The
stream delivered claimed, released and the re-post inside one millisecond, and the
claim's own HTTP response was handled after them, so `claim.won` resurrected a
claim the offerer had already released. A real user releasing quickly would have
seen the same stale "Pickup:" row.

The fix is in the reducer, not the test: a claim now stays "unanswered" until the
stream speaks for it, and only an unanswered claim accepts the response. The
failing reducer test came first and failed for that reason; a control test keeps
the stream-silent case working. The one existing test the first attempt broke (an
`offer.taken` before the response) is what showed a "row is busy" rule was too
narrow. How I knew it held: the spec went from about 1 pass in 6 to 6 of 6, then
the full check was green at 657 tests. Not weakened: the 1000 ms waits are unchanged.

## 2026-10-08 — Pivoting from the pantry to the sensory heist

a53b516, 22bbaef, 463b7b6

The brief asks for an app that is more interesting because other people are
using it at the same time, designed for a showcase room full of them. The
pantry answered that weakly: households talk in person and the app stayed out
of the way. It was also my third food-tracking prototype, and the domain kept
producing small, tiring problems. The obvious move was to keep polishing the
pantry (phase 05a was half built). I chose to stop, because more polish would
not have made it any more about co-presence.

The call went through the usual route rather than a rewrite on a whim: a
brainstormed spec (`specs/2026-10-08-sensory-heist.md`), four new ADRs
(0007–0010) that supersede the pantry's, and a phased plan, all committed
before any code moved (22bbaef). The unfinished pantry work was committed as it
stood and tagged `archive/pantry-2026-10-08` (a53b516), so nothing was lost and
every SHA that PROCESS.md already cites still resolves. Then it was deleted from
`main` (463b7b6).

What carried over is the harness: request logging with its redaction allowlist,
`/stats`, `/readme/`, the check scripts, the hooks and the working method. They
were never about food. How I knew the cut was clean: `pnpm check` and
`pnpm check:evidence` stayed green on the stripped app, the grep for any
remaining pantry or household wording in `src` and `spec` came back empty, and
a first page view issues the new `heist_device` cookie.

## 2026-10-08 — Playtesting found three bugs the green suite could not

4d86a17

Task 8 had a Human review, and the full check was green (types, lint, 255
tests, a three-browser layout spec) before I played it. Playing it found four
things in a few minutes: a door that shut behind one player and stranded them,
a crate that only sometimes moved (never "backwards"), a player frozen after
reloading, and no sign when a teammate left. The obvious move was to patch what
I saw. I made each one start as a failing test instead.

The push bug is the example. The sim counted a crate as touched within 2e-5
tiles, but a walking player stops up to 1e-3 short, so success depended on the
starting offset. A test over 20 offsets in all four directions failed in every
direction, passed with a 0.02 tolerance, and failed again with the fix stashed,
so I knew it was the cause and not a coincidence. The freeze needed the test
moved down to the socket: a browser test passed both before and after the fix,
because the page predicts its own movement and so looks fine to itself. Only
another player's view, or the raw socket, shows what the server accepted. I
deleted that weak browser test rather than keep false coverage.

The door fix changed a rule in the plan (§4.2), so the plan was edited and the
change logged in its Corrections log instead of being patched silently.

## 2026-10-08 — A review round became specs, and sharing a room found a bug the isolated tests hid

e242193

The Task 10 review (the comms tray, on a local build with three sessions)
produced about a dozen corrections: faces too small and draggable, captions
inconsistent, a key hint styled unlike its neighbours, a label wrapping
mid-word at 375 px, sound switches offered to a player who can't hear. The
obvious move was to fix each by eye. I had the agent turn each into a check
first, so none can come back: computed styles for the draggable faces and the
key hint (the hint must equal the tray's own), DOM ranges that fail if any
soundboard word breaks across lines on the phone viewport, and a spec that the
deaf player's three settings are disabled and explained. Each one failed before
its fix, which is how I knew it was testing the thing and not passing by default.

Then the full check had crept from 36 s to 76 s. Per-file timing showed one spec
file, the tray, at 71 s because every test built its own three-session room. I
chose to share one room, with a reset after each test, rather than split the
file. That exposed a real bug the isolated tests had hidden: after using
Stamps, Show reopened on the Stamps tab, so "3 then 1" sent a stamp instead of
the first face. I wrote that as a failing test before changing the app. The file
now takes 13 s and the full check 42 s.

Not checked: I haven't long-pressed the touch controls on a physical phone, so
that fix is covered by style and event specs only.

## 2026-10-09 — A checkpoint one player could bank for everyone

9459be1

The phase 05 plan said a checkpoint is reached "when any player's centre enters
it". In the first playtest of the dark corridor I found that one player could
run through blind, reach the next flag, and every player respawned there from
then on: a challenge built for three people was beaten by one lucky runner.

The obvious fix was to patch that corridor (more hazards, a longer run). I
changed the rule instead, because the corridor wasn't the problem: any section
with a flag at the end had the same hole. A checkpoint is now set only when all
three players are within 1.5 tiles of it at once, the same shape as the exit.
Being caught still costs the whole team, so the lone runner gains nothing and
risks everyone.

I had the agent write the tests first: one player, two players, a player 1.6
tiles away, and three players who each visited at different times all fail to
set a flag; three together set it. Four of those failed before the change. A
solve test now also proves the scripted team can set every flag in rooms 2 and 3,
so I can't move a flag somewhere the team can't gather. The flag draws three
small pips so a team that isn't getting it can see who is missing.

Not checked: the 1.5-tile radius is a guess; I haven't seen whether three real
people on a phone find it easy to stand close enough.

## 2026-10-09 — "Everything has a sound" became a test that can fail

9459be1

In review I noticed that most of what a player can touch made no sound: plates,
crates, the checkpoint filling up, the sequence door, hiding, the exit. I said the
game should have a sound and a visual for everything interactable, and that the
parity between what Can't see hears and what Can't hear sees is the promise worth
writing down.

The obvious fix was to add the missing sounds and move on. I had the agent turn
the promise into the harness first: a table with one row per sound, typed against
the list of sounds so a new sound without a row fails to compile, and a test per
row that builds a real situation and checks the sound reaches Can't see, a visible
change reaches Can't hear in the same tick, and a caption exists. It went red for
ten sounds before any was built, which is how I knew it was testing the thing. The
rule also went into `CLAUDE.md`, so the next session is bound by it.

The test only proves the information is sent to each role, not that a person can
tell two sounds apart, so I log that as unchecked until a playtest.

## 2026-10-09 — A camera with a lane along its own wall, caught by walking every line

29c95e1

Playing Room 2, I found I could hug the top wall and walk straight past the
camera while it was watching. The obvious fix was to widen that room's cone. I had
the agent reproduce it first, and the reproduction showed the cause was not the
room: the camera saw from the middle of its tile, so the strip of that tile along
the wall (y 1.4 to 1.5, as near as a body can get) lay behind it and outside its
cone. Room 3's camera had the same hole, which widening one cone would have left.

The fix moves the viewing point to the wall face behind the camera, in the rule and
in the drawn cone, so the picture and the rule still agree. The test is the part I
care about: it walks a player along every line a body can legally take across each
real camera, while it watches, and requires each line to be seen somewhere. Before
the fix it failed on exactly y = 1.4 in both rooms, which matched what I had seen
by hand, so I knew it was testing the thing. A future camera placed with a gap now
fails the build instead of waiting for me to find it.

Not checked: that a lone player is always caught in time on a phone; the test
proves they are seen, not that they can react.

## 2026-10-09 — Rejecting my own alarm design because causality should stay inside one attempt

9459be1

The agent proposed making the alarm bite by having being caught set it off. I said
it felt wrong: being caught teleports the team back, which starts a new attempt,
so an alarm carried over into it is a punishment from the last attempt landing on
this one. The agent agreed, and that exposed a real bug beside the design flaw: an
alarm already ringing when the team was caught kept ringing after the reset.

The obvious fix was to keep my idea and explain it in the tutorial. I chose three
steps instead: only the alarm plate sets it off, being caught clears it so a retry
starts clean, and while it rings every camera watches non-stop and guards walk 1.5
times faster, so it costs something without waiting being free. Cause and effect now
stay inside one attempt: you set it off, you are in trouble for eight seconds.

How I knew it held: red tests for each rule (the alarm clearing on a catch, cameras
watching while it rings, guards covering half as far again in a second), the scripted
Room 3 run lengthening from 31 s to 39 s because it now waits out the alarm, and a
lint rule that rejects an alarm trigger that is not a plate, so the old design
cannot creep back in a room file.

## 2026-10-09 — A contrast check that passed on the bug until it read settled colours

9459be1

On the cleared screen, "Sure? Restart room" went invisible when hovered. The cause
was two of my own styles disagreeing: the asking look is a light fill with dark text,
and an older hover rule repainted the fill dark but left the text. The CSS fix was one
line. The obvious move was to stop there. I asked for a check that loads the app's real
shipped stylesheet in a browser and requires readable contrast for every button look,
resting and hovered, so a new button style cannot repeat it.

The first version passed on the buggy CSS. The buttons ease their background over
150 ms, so it read the colours half-way through the fade and found plenty of
contrast. I only saw that because I wrote the expected failure first and it did not
fail. Switching off transitions in the test and reading the settled colours made it
fail with contrast 1.0 on exactly the reported case, then pass 18 of 18 after the fix.
A check that looks green while measuring nothing is the dangerous kind, and a red run
on the known bug is the only proof it measures the right thing.

## 2026-10-09 — Three flaky specs, each fixed without loosening an assertion

9459be1

Three browser and socket specs failed intermittently once the machine was busy, and
the easy move was to rerun until green or raise a timeout. I held to the rule that a
failing test is told by fixing the code or stopping, and took each one apart.

The joystick spec was a real race in the app: the long-press-menu guard was attached
by an effect, so the control existed for a moment without it. I moved the controls
into a component that carries the handler on the elements themselves and left the
browser spec untouched; it went from failing 4 runs in 6 to passing 8 of 8 under the
same load. The player-count spec compared a global total that other spec files change
at the same time, so it could never be exact. I rewrote it to check what is true
(at least our three while open, and after they close no more than the peak minus
three plus whoever arrived, read from the same snapshot), then proved it still bites
by stopping the server removing closed sockets and watching it fail before restoring
the code. The third was my own driver in the heist spec: it corrected one axis at a
time and a seat stuck 0.2 tiles off the tunnel centre; I steered both axes at once.

How I knew it was fixed and not hidden: a 12-run soak of the whole spec project
passed 12 of 12 with the machine at a load average over 100, against roughly one
failure in four before. Not checked: the same soak against the deployed app.

## 2026-10-09 — A fresh install would have crashed, found by the persistence test Task 18 itself demanded

resolved by 69e35ea

Task 18's own acceptance criterion forced a persistence test against a genuinely
empty database — something nothing before it had done (every prior test ran
against a `.data/app.db` that had already lived through the pivot's migration
history incrementally). That test crashed: migration 0008 (from the
pantry-to-heist pivot) drops `communities` before two tables that still
reference it, which SQLite's foreign-key enforcement only catches on a database
built from scratch in one pass.

The obvious fix the agent reached for was reordering or editing that migration.
I said no: it's already applied to the deployed volume, and editing an
already-applied migration risks the deploy history disagreeing with what
actually ran there. I had it toggle `foreign_keys` off only around the
`migrate()` call in `db.ts` instead, leaving every migration file untouched.

How I knew it was right: the test went from a crash to green, the full suite
stayed green, and since this is exactly the kind of bug that only shows up on
an install nobody's tested, I had it verify again independently on the real
deploy days later: a run saved live, a redeploy, and the volume still had it.

## 2026-10-09 — A re-export leaked node:crypto into the browser bundle, caught by a build warning

resolved by 03799dd

Building the real-life wizard, the agent took the fastest path to share
`presetFor` with the client: re-exporting it as a runtime value through
`protocol.ts`, which already re-exports server types. The next build warned
that `node:crypto` was being externalized for the browser — `presetFor` lives
in `net/lobbies.ts`, which imports `codes.ts` for lobby-code generation, so one
ten-line pure function dragged a whole server module's dependency graph into
the client bundle.

The obvious move was to shrug off a dev-time warning that didn't actually
break anything yet. I didn't let it stand: CLAUDE.md's layering rule exists so
this boundary doesn't depend on someone noticing, and "harmless today" is how
it erodes. I had the agent move `presetFor`/`DEFAULT_SETTINGS` into a small
client-only mirror and revert `protocol.ts` to type-only exports, plus a test
that imports both the client and server copies and asserts they agree across
the whole truth table, since duplicated logic drifts silently otherwise.

How I knew it held: the warning disappeared from a clean build, and the
drift-guard test would fail loudly the day the two copies disagree.

## 2026-10-09 — Wrong twice about Can't-see and captions, caught by insisting on a second check

see corrections log in plans/2026-10-08-sensory-heist-07-results-polish.md

Reviewing the host's "captions instead of game sound" setting, the agent told
me it couldn't work for Can't-see — a role named that surely can't read
captions. That didn't sit right, so I pushed back, and it turned out to be
wrong: the restriction (ADR 0007) is on what the character perceives of the
game world, not on what the player's own screen shows. The agent then made a
narrower version of the same mistake, assuming captions only cover the Say
channel. I didn't accept the correction on faith a second time either — I had
it check the actual code, and `src/client/hud.ts`'s `cueCaptions` already
carries the same left/right/ahead panning every sound cue has, as an enforced
invariant (`src/game/parity.test.ts`).

Nothing in the code changed — `othersSoundOff` applying to both Can't-see and
Can't-speak was already correct as built. What I took from it: don't let a
role's English name stand in for its actual restriction in `src/game/types.ts`
or the relevant ADR, and don't take a correction at face value without making
it check.

## 2026-10-09 — Recognising a redesign instead of patching it in, with a deploy pending

resolved by 642141a

Reviewing the finished real-life wizard, I realised headphone possession is a
property of a seat (a person), but roles rotate every room while the wizard
only ever asks once, before anyone has a role. "Does Can't hear have
headphones?" is really asking about whichever seat lands that role in room 1;
by room 2 a different seat is Can't hear and nothing updates the answer.

With the phase otherwise finished and a deploy next, the obvious move was to
have the agent patch it in quickly: ask the same question per seat instead of
per role. I said no, because the real fix is bigger than that question —
headphones would need tracking per seat and the effective masking-noise and
captions settings recomputed every room from whoever currently holds which
role, which reopens `presetFor`'s truth table and `LobbySettings`'s shape,
both already built and tested this phase. That's a redesign of when and how
the settings get computed, not a wording fix.

I had the agent record it in `specs/backlog.md` instead of building it,
folded into an entry already parked there for an unrelated reason (the wizard
can't express a mixed remote/in-person table either) — the same per-seat
rework fixes both, so one planning pass should cover both reasons rather than
two separate ones landing on the same change.

How I knew holding off was right: nothing about phase 07's own Definition of
Done needed this to ship, `pnpm check` and the deploy stayed green without it,
and the backlog entry names the exact interfaces a future planning pass would
need to reopen, so the reasoning isn't lost by waiting.

