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
