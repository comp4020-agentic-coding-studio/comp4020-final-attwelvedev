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
