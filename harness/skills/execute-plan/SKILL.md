---
name: execute-plan
description: Executes an existing implementation plan — loads it, reviews it critically against the real codebase and raises every question or concern BEFORE touching code, then works through its tasks in dependency order, following each task's TDD steps and verifications exactly, and stops to ask rather than guess whenever it hits a blocker. Use whenever the user asks to implement, execute, build, work through, continue or resume a plan, or points at a plans/*.md file and says go.
---

# Execute Plan

Downstream of [`plan-feature`](../plan-feature/SKILL.md), which is downstream of
[`brainstorm-feature`](../brainstorm-feature/SKILL.md). Those two decide *what*
to build and *how*; this skill builds it. It does not re-open settled design,
and it does not invent work the plan doesn't name.

**Two hard rules, for the whole duration:**

1. **Nothing is implemented until the Phase 1 review is clean.** If the review
   raises anything, it goes to the user first — no "I'll start on the easy tasks
   meanwhile".
2. **Never make a test pass by weakening it.** Not by loosening an assertion,
   relaxing a threshold, adding a skip, deleting a case, casting past a type
   error, or asserting the buggy output. A test that fails is telling you
   something; the only honest responses are fixing the code or stopping to ask.

## Phase 0 — Load the plan and find out where the work already stands

1. **Resolve which plan.** The input may be a path, a feature name, or nothing
   at all. If there are several candidates under `plans/`, or the work spans a
   sequence of plans, ask which one — don't pick.
   - **Phased set.** A plan may be split into an overview
     (`…-00-overview.md`) and per-session phase files (`…-NN-<phase>.md`).
     A session executes **exactly one phase**. If you were pointed at the
     overview or the whole set, read the overview's phase map, propose the
     first unticked phase whose dependencies are all ticked, and confirm it
     with the user. If you were pointed at a phase whose prerequisite phases
     aren't ticked, that's a Phase 1 concern.
2. **Read it in full**, plus anything it points at: the `specs/` file it was
   built from, `CLAUDE.md`, `AGENTS.md`, and any sibling plan it declares a
   dependency on. A plan is written to be self-contained, but its handoff notes
   routinely name constraints that live elsewhere.
   - **Phased set: read only the overview and the one phase file**, plus
     `CLAUDE.md`/`AGENTS.md`. Don't open other phase files or the `specs/`
     file by default; the split exists to keep each session's context small,
     and the phase file's "Interfaces from earlier phases" list stands in for
     them. Open another file only when a specific question can't be answered
     from those two, and say which file and why. If the phase file is missing
     context it needed (a signature, a path, a fact), that's a gap in the plan:
     raise it in Phase 1 so it gets written into the phase file, rather than
     quietly working around it.
3. **Establish what is already done.** Ticked checkboxes, `git log`, and the
   working tree. Never redo completed work, and never trust a ticked box on its
   own — spot-check that the task's acceptance criteria actually still hold.
   A dirty working tree from an earlier, abandoned run is itself a concern for
   Phase 1.
4. **Note the project's commands** — test, typecheck, build, lint, evidence
   gates — from `package.json` or equivalent, not from memory. The first
   time the full check runs, note its wall time as the baseline for this
   run.

## Phase 1 — Review the plan critically, before touching anything

Read the plan as an adversary would, then check it against the code as it is
**now**. Code moves: a plan written last week may reference a signature that has
since changed, and a plan that sends you confidently down a wrong path is worse
than no plan.

**What counts as a real concern:**

- A file path, function, type, prop, signature or line reference that doesn't
  match the current source.
- A dependency the plan assumes is present and isn't, or that would need
  installing without the plan saying so.
- A verification command, script or fixture the plan names that doesn't exist.
- A task whose acceptance criteria can't be checked as written, or can't be
  satisfied at all.
- A contradiction between two tasks, a dependency cycle, or a task depending on
  something no task delivers.
- A requirement in the plan's requirements section that no task implements —
  check the plan's own coverage table if it has one, and don't trust it blindly.
- Anything the plan leaves as an open question. A plan with open questions isn't
  ready to execute.
- **Phased set only:** a prerequisite phase that isn't ticked in the overview.
  A signature in the phase's "Interfaces from earlier phases" list that doesn't
  match what the earlier phase actually built. Check it against the code, not
  against the earlier phase file.

**What does not count:** the plan's settled design decisions. A plan's handoff
notes typically name what must not be re-litigated, and preferring a different
approach is not a concern — it's reopening a closed conversation. If you
genuinely believe a decided call is wrong, say so in a sentence or two, then
follow the plan anyway; don't stall the work on it.

**Raise everything found once, together, before implementing** — a drip of
questions across the run is worse than one round. Then get an actual ruling.
If the review is clean, say so in a line and proceed.

**Scale the review to the plan.** For a **Slice plan** (`Tier: Slice`), do a
quick pass instead: do the files it names still exist, does `git status` show
a clean tree, and is the plan newer than the last commits touching those
files? If yes to all, say "review clean" and go. Run the full adversarial
review above only for Architecture plans, or when a Slice plan is stale
(touched files changed since it was written) or the tree is dirty.

## Phase 2 — Build the work list

- Use the harness's todo list if one is available; otherwise the plan's own
  checkboxes **are** the work list, and no parallel list gets invented.
- If items already exist for this plan, reconcile with them rather than
  duplicating.
- One item per plan task, ordered by the tasks' declared **dependencies**, not
  by the order they happen to appear in the file.

## Phase 3 — Execute, one task at a time, exactly as written

For each task, in order:

1. **Red.** Write the test(s) the task names, run them, and confirm they fail —
   *and fail for the stated reason*, not on an import error or typo. A test that
   passes before the implementation exists is either broken or evidence the task
   is already done; investigate which before moving on.
2. **Green.** The minimum implementation the task names, with the signatures it
   names. Nothing extra.
3. **Refactor.** Only what the task names.
4. **Verify.** Run the task's own verification, then the project's full check
   command. **For anything user-visible, run the relevant demo-script steps in
   a real browser** (the Chrome tools, if available) and look at a screenshot
   before reporting the task done — the render is the truth, not the source.
   **Show the user the first visible result as early as the plan allows**
   (after the first UI-affecting task, not after the last), so a wrong
   assumption costs one task to fix instead of the whole slice. Walk the acceptance criteria one at a time and confirm each
   individually — they're written to be independently checkable, so check them
   independently. If the task carries a **Human review:** line, green checks
   are necessary but not sufficient: present the exact named artifact (the
   diff, the rendered page, the rewritten copy) to the user and get an
   explicit accept or reject before treating the task as done — silence or
   moving on to the next task is not acceptance.
   **Do the review on a local build** (the project's build-and-start command),
   not on a deployed copy, unless the task's own **Human review:** line says
   it needs the deployed app. A deploy usually needs a clean, committed tree,
   and a task with a **Human review:** line mustn't be committed until accepted,
   so a deployed review can never happen first. Anything that only the deployed
   app can prove (a proxy, TLS, the real domain) belongs in the phase's
   Definition of Done as a post-deploy check, not in the review. If a plan's
   **Human review:** line demands the deployed app anyway, that's a plan
   conflict: raise it in Phase 1, don't work around it.
5. **Record.** Tick the task in the plan file, and commit according to the
   project's stated convention (in this repo: one commit per task once the check
   command is green, with a message saying what changed and why). If the project
   says nothing about commits, don't commit. **Never push.** Never tick or
   commit a task carrying a **Human review:** line before the user has
   explicitly accepted it — see Phase 4 for what to do when they don't.

**Closing a phase (phased set only).** After the last task in the phase:

1. Walk the phase file's own Definition of Done, one item at a time.
2. Only when every item holds, tick that phase's row in the overview's phase
   map. Commit the tick with the phase's last task, or as its own small commit.
3. In the report, name the next phase file and the command to start it in a
   fresh conversation.
4. Stop there for an Architecture phased set. Don't roll on into the next
   phase in the same session; that defeats the split. (Slice plans are a
   single unit: when one finishes, offer the next planned slice rather than
   stopping, and let the user say go.)

On the final phase, the overview's feature-level Definition of Done is also
part of what must hold.

**While executing:**

- **Watch the check's wall time.** If the full check gets noticeably slower
  than the baseline (say a quarter slower, or past a few minutes),
  measure per file and per test before guessing why: the runner's JSON
  reporter, for example. Report what it shows at the next task boundary.
  The usual cause is one test file that the runner can't parallelise
  internally, and splitting it is outside the current task. So raise it
  rather than living with it or fixing it silently.

- **Follow the steps exactly.** If a step looks wrong, that is a blocker — stop
  and ask. Improving a step on the fly is how execution and plan silently
  diverge.
- **Stay in scope.** Implement only what the current task names. Anything else
  you notice — a real bug, a tempting cleanup, a missing test elsewhere — gets
  written down and reported, not silently fixed.
- **Match the surrounding code**: its naming, error handling, file layout and
  test conventions. Prefer the project's existing patterns over introducing a
  new one.
- **Never fabricate verification.** If a check couldn't be run, say which and
  why. If the plan calls for manual or rendered verification — a browser, a
  running app, specific viewports — that is not optional, and the render is the
  truth, not the source.
- **Leave no debris**: no stray debug logging, commented-out experiments,
  temporary files, or `.only` on a test.
- **Never hand-edit generated or build output.** Fix the source and rebuild.
- **Never commit a secret**, and never widen ignore rules to make one
  committable.

## Phase 4 — Blockers: stop and ask, don't guess

**Stop when:**

- A verification, test or check fails and the fix isn't plainly inside the
  current task's scope. *(The Phase 3 red step failing is the expected state,
  not a blocker.)*
- A dependency is missing, unavailable, or would need installing beyond what the
  plan authorises.
- A step or acceptance criterion is ambiguous, or two readings of it lead to
  materially different work.
- The code no longer matches what the plan describes.
- A task's acceptance criteria can't be met as written.
- The next action is destructive or hard to reverse and the plan didn't
  explicitly authorise it — deleting data, rewriting history, touching anything
  outward-facing.
- Credentials, permissions or access are needed that you don't have.
- A task carrying a **Human review:** line comes back rejected from the user.

**How to stop:**

- Stop at a task boundary where you can. If you're mid-task, say exactly what is
  half-done and what state the tree is in.
- **Don't retry the same failing thing more than twice**, and don't route around
  a blocker by guessing at intent.
- Do finish any remaining work that doesn't depend on the answer, then stop and
  report both parts.
- Report it like this:

  ```
  BLOCKED — Task <n>: <one-line title>

  What failed:   <the command, and the actual output — not a paraphrase>
  Expected:      <what the plan says should happen>
  Why I stopped: <which blocker condition this is>
  What I tried:  <briefly, and why it didn't resolve it>
  What I need:   <the specific decision or information — a question, not a menu
                 of vague options>
  Tree state:    <clean at Task n-1 / files changed but uncommitted / etc.>
  ```

Reserve this for genuine blockers. A choice with an obvious default and no
material consequence is a routine judgement call: make it, note it in the
report, and keep going. A skill that stops at every small fork is as useless as
one that guesses at every large one.

### Log every correction

Whenever the user redirects, rejects, or tweaks something after seeing it
(including routine "make it feel more like X" tinkering), append one line to
the plan's **Corrections log**: what was expected, what the user wanted, and
why the first attempt missed. Don't treat tinkering as plan failure — a plan
can't know what feels right until it's run, and the log is the honest record
of directing and correcting the work. At the end of the run, if any entry
reveals a repeated pattern (the same kind of miss twice), propose a
prevention (a test, a lint rule, a line in `CLAUDE.md`), and copy the entries
worth keeping into the project's process log if its `CLAUDE.md` names one.
If a correction contradicts an *accepted* ADR, never edit the ADR: stop and
hand back to `brainstorm-feature` to write a superseding record.

### When a human-reviewed task is rejected

A rejection here isn't the same shape as other blockers — asking already
happened; the answer was no. Read the user's findings and decide which of two
things happened:

- **The wording/artifact was off, the approach wasn't.** Redraft the specific
  thing and re-present it. No need to leave this skill for that.
- **The task's approach, or the plan itself, was wrong.** Don't freelance a
  new approach to route around the rejection. Hand back to `plan-feature`
  with the user's specific findings so the task (or plan) gets amended there,
  then resume execution against the updated plan (Phase 5).

## Phase 5 — Re-review whenever the plan or the approach changes

Trigger a fresh Phase 1 review — against the **changed** plan, not the one you
remember — whenever:

- The user updates the plan or gives feedback that changes it.
- Resolving a blocker changes the approach.
- Execution reveals the plan was wrong about the code, the design, or the
  sequencing.
- A `Human review:` rejection reveals the task's approach needs to change,
  per the previous section.

Then:

- **Update the plan file in place** rather than diverging from it silently. A
  plan that no longer describes what's being built has stopped being a record of
  anything. Edit the same file — never fork a second plan for the same feature.
  In a phased set, edit the affected phase file, or the overview if the change is
  shared. If a change alters a signature or data shape that a later phase lists
  under "Interfaces from earlier phases", update those later phase files too, or
  hand back to `plan-feature` if the ripple is large.
- If the plan carries its own verification section (coverage mapped, references
  correct, no open questions), re-run it after editing.
- If the change is big enough that the task breakdown no longer holds, say so
  and hand back to `plan-feature` rather than improvising a new breakdown here.
  Re-planning is that skill's job; this one executes.

## Phase 6 — Report honestly

- What completed, which tasks are ticked, which commits were made.
- What was **skipped or left undone, and why** — explicitly, never by omission.
- Which verifications actually ran, and which didn't.
- Anything found out of scope: listed, not fixed.
- Any routine judgement calls made along the way.

Report completion only when every task's acceptance criteria have actually been
checked. If tests fail, say so and show the output. If a step was skipped, say
that. Don't hedge work that is genuinely done, and don't round work that isn't
up to done.

## The plan is a shared record, not a private script

Two people should be able to read the plan afterwards — one who watched the
execution and one who didn't — and agree on what was built. That only holds if
the file keeps pace with reality: ticked as work lands, edited when the approach
changes, and never quietly departed from. When execution and plan disagree, one
of them is wrong, and finding out which is the work.
