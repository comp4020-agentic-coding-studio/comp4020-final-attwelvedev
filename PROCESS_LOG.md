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
