---
name: plan-feature
description: Locks down requirements through back-and-forth with the user, then writes a rigorous, TDD-driven, self-contained implementation plan for exactly one feature (or bug fix), verifies it against the real codebase, and saves it to plans/YYYY-MM-DD-<feature-slug>.md — or, for a feature too big for one session, as an overview plus per-session phase files (plans/YYYY-MM-DD-<feature-slug>-00-overview.md, -01-<phase>.md, …). Use whenever the user asks to plan, scope, or write an implementation/spec doc for a piece of work before coding starts — not for Claude Code's built-in plan-mode approval flow, which is a different, ephemeral thing.
---

# Plan Feature

Produces a persisted planning document (a file under `plans/`), not an
in-session plan-mode approval. It can be used from inside or outside Claude
Code's built-in plan mode — the two are independent. Follow every phase below
in order; do not skip to drafting because the request "sounds simple."

If this was reached via a hand-off from the
[`brainstorm-feature`](../brainstorm-feature/SKILL.md) skill — inline, or by
being pointed at a `specs/` file it wrote — treat that as the requirements
source for Phase 1: read it fully and only re-open the conversation with the
user if something is still missing or if your own codebase investigation
(Phase 2) turns up something the design didn't anticipate.

## Scope rule: one plan, one feature

A plan covers exactly one feature or one bug fix. If the user's request
actually spans several independent features, say so and produce one plan
per feature, each going through the full process below — never merge
unrelated features into one plan.

A single feature is written either as **one file** or as one **phased set**:
an overview plus per-session phase files (see "Choosing the layout" below).
A phased set is still one plan: one requirements list, one coverage table,
one Definition of Done. The phase files are views onto it sized for
separate conversations, not separate plans. What stays forbidden is an ad-hoc
split — a feature scattered across files with no overview tying the
requirements, interfaces and coverage together.

## Size the plan to the tier

Plans are sized by the tier `brainstorm-feature` assigned (if none was
assigned, classify now in one line and let the user override). A plan that is
longer than the code it describes costs more to read than to write, and
nobody can meaningfully review it — which is how plans get blind-approved.

- **Tweak** — no plan. Do it directly.
- **Slice** — a **slice plan**: one short file, aim for **under ~150 lines**,
  written to be reviewed by a human in two minutes. Format below. Phases 1–2
  still apply but proportionately (read the files you'll touch; don't
  catalogue the repo). Phase 4 reduces to checks 1–3 (below).
- **Architecture** — the full process: single file or phased set, all Phase 4
  checks.

**Slice plan format** (save as `plans/YYYY-MM-DD-<slug>.md`, `Tier: Slice`):

1. **What you'll see** — 3–6 plain-language lines: what the user can do/see
   when this is done. No signatures, no jargon.
2. **Demo script** — numbered steps, each `do X → expect Y`, runnable by a
   human *or* by the agent in a browser. This is the primary acceptance
   artifact; the user reviews this, not the code.
3. **Requirements** and **Out of scope** — short bullets; each requirement
   points at a demo step or a test.
4. **Tasks (2–5)** — each: the behaviour, the files touched, how it's
   verified (logic → name the failing test to write first; UI → which demo
   step it satisfies), and `Depends on:` if any.
5. **Human review** line(s) where a mechanical check can't settle it.
6. **Corrections log** — empty at plan time; execution appends one line per
   user redirect (see `execute-plan`).

No coverage table (the inline pointers are the coverage), no separate
risks/assumptions sections — if there's a genuine open question, it blocks
the plan; resolve it first.

## Choosing the layout: single file or phased set

*(Architecture tier only — a Slice always uses the slice plan above.)*

Decide this once the task breakdown's size is clear (after Phase 2, before
drafting), and confirm it with the user rather than choosing silently:

- **Single file** (`template.md`) — the default when the whole plan can
  reasonably be executed in one conversation: roughly five tasks or fewer,
  one area of the codebase.
- **Phased set** (`overview-template.md` + `phase-template.md`) — propose it
  when the plan runs past roughly five tasks, spans several subsystems, or will
  obviously take more than one sitting. It exists so each implementation session
  loads only the overview and one phase file, which keeps context-window usage
  per conversation small.

Structure of a phased set:

- `plans/YYYY-MM-DD-<slug>-00-overview.md` holds everything every session
  needs and nothing phase-specific:
  - the full requirements (§2)
  - shared conventions and commands
  - shared types and data shapes
  - any cross-phase contract, such as an HTTP API table
  - the phase map, with a checkbox per phase
  - the feature-level Definition of Done
  - the full coverage table
  - risks
- `plans/YYYY-MM-DD-<slug>-NN-<phase-slug>.md`, one per phase, each holding:
  - 2–4 tasks
  - only the codebase context *that phase* needs
  - an **"Interfaces from earlier phases (exact)"** list, with signatures copied
    verbatim from the producing tasks, so a fresh session never has to open
    another phase file
  - phase-specific design (e.g. an algorithm)
  - a phase Definition of Done
  - the phase's slice of the coverage table
- **Task numbers are global** (Task 1…N across all files), so cross-references
  survive the split.
- **Phases are ordered by real dependency**, not just the build narrative. If a
  phase needs even one line from a later-numbered phase (e.g. wiring into a
  module that phase creates), it isn't independent. Reorder the phases or state
  the dependency.
- **Every phase ends green and committed**, with something checkable. Where the
  project has an external milestone (a deploy, a demo, a spec line), put a phase
  boundary right after the task that reaches it.
- **References to sections name their file**: "overview §4.2", "this file's
  §4.1". A bare "§4.3" is ambiguous once the plan is split.

## Phase 1 — Lock the requirements

Do not draft a plan against ambiguous or incomplete requirements.

1. Read what the user has already given you. If it already answers all of
   the questions below unambiguously, don't re-ask — move to Phase 2.
2. Otherwise, work it out with the user, through normal conversation and
   `AskUserQuestion` for discrete/closed decisions, until you can state
   without hedging:
   - The functional requirements, each specific enough that you could name a
     test that would fail without it.
   - Non-functional constraints (performance, accessibility, security,
     supported browsers/viewports, data limits — whatever applies).
   - What's explicitly out of scope.
   - Any real ambiguity or conflicting instruction you found — surface it and
     get a ruling, don't silently pick one side.
3. Restate the requirements back to the user in plain language and get
   explicit confirmation before writing anything to disk. Don't proceed on
   silence or on a vague "sounds good" to a huge dump of requirements — if
   what you restated is long or consequential, make sure the confirmation was
   actually about the substance.
4. Only after confirmation, move to Phase 2.

## Phase 2 — Investigate the real codebase

The plan must be readable and actionable by someone (or some agent) with
*zero* prior context on this codebase — which means every claim about
existing code in the plan must come from actually reading that code this
turn, not from memory, convention, or a similar project.

- Find and read every file the feature will touch or depend on.
- Record the exact current signatures of any type/function/prop the plan
  will reference or change — copy them, don't paraphrase them.
- Note the testing setup for this repo: framework, exact commands, where
  tests for this area live (check `package.json` scripts and existing test
  files rather than assuming).
- Note how the runner parallelises (vitest and jest run a file's tests
  serially and run files in parallel; pytest needs xdist), and the size
  of any test file the plan will add to. If slow tests (browser,
  end-to-end, anything that boots a server) pile into one file, that file
  sets the whole check's time and grows with every plan. Put the plan's
  new slow suites in a file for their area, and name an oversized file
  as a risk (or a split task) rather than planning more tests into it. If
  the repo has a size or time budget check, cite it.
- Note established conventions in the surrounding code (naming, error
  handling, file layout) that the new work should match.

Use `Explore` or `general-purpose` agents for breadth if the codebase is
large enough that reading everything yourself would be wasteful — but the
signatures and file contents that land in the plan must still be verified,
not delegated blindly.

## Phase 3 — Draft the plan

Copy `template.md` (single file), or `overview-template.md` and one copy of
`phase-template.md` per phase (phased set), all next to this file, and fill in
every section. Rules for the task breakdown, non-negotiable:

- **Concrete and final.** Every task names exact files and the exact
  behaviour. No "handle X", "improve Y", "TODO: figure out Z". If you can't
  yet write a task that concretely, that's a sign Phase 1 or 2 wasn't
  finished — go back, don't paper over it with vague language. **Exact
  signatures are required only where a task's output is consumed by another
  task or phase** (the interface contract) — in the Architecture tier, copy
  them verbatim. Inside a single task, the implementer chooses names; pinning
  every private helper makes plans long and brittle without making them more
  correct. Slice plans never need a signature list.
- **Agile-sized.** Each task is small enough to finish and review in one
  sitting, independently valuable or at least independently testable, and
  its dependencies on other tasks are stated explicitly rather than implied
  by ordering (INVEST: independent, negotiable in detail but not in outcome,
  valuable, estimable, small, testable).
- **TDD where it pays.** Any task with logic, data handling, an API, or a
  bug fix lists the failing test(s) to write first (red), the minimum
  implementation to pass them (green), then any refactor — in that order. A
  bug-fix task's first step is a test that reproduces the bug and fails.
  **Pure UI/presentation tasks are verified by the demo script** (run in a
  browser, with a screenshot) plus, at most, a smoke test that the page
  renders; don't invent brittle tests for look-and-feel, which a human or the
  demo run settles.
- **Every task has acceptance criteria** that are independently checkable
  without re-reading the whole plan.
- **Name what only a human can settle.** Acceptance criteria should be
  mechanical wherever a mechanical check can actually settle the question. If
  a task's real correctness can't be — tone, voice, phrasing quality, visual
  or UX feel, anything a linter or test can only approximate — add a
  **Human review:** line naming the exact artifact to look at (a diff, a
  rendered page, the rewritten copy) and what a pass looks like. A banned-word
  list can prove the jargon is gone; it can't prove the rewrite is actually
  funny or on-voice. Don't paper over that gap with an acceptance criterion
  that sounds mechanical but isn't really checkable by anyone but a human.

Also fill in the non-functional-requirements, out-of-scope, assumptions, and
existing-code-context sections seriously — these are what make the plan
self-contained. Don't leave a section out because it feels obvious; write
"None." explicitly instead so a reader can tell it was considered.

### Human-reviewed tasks are not done until the user says so

A `Human review:` line changes what "done" means for that task: green tests
and satisfied acceptance criteria are necessary but not sufficient. The task
is only accepted once the user has actually looked at the named artifact and
said so explicitly — not on silence, not on "looks fine", not inferred from
the user moving on to the next thing.

If the user rejects it, that is new information, not a bug to patch quietly:
route it back through this skill rather than letting whoever is executing
freelance a fix. A wording tweak that stays inside the task's existing
approach can be redrafted in place (back to Phase 3 for that task); a
rejection that reveals the approach or the requirement itself was wrong goes
back to Phase 1. Either way, update the plan file in place — never leave the
file claiming a task is done that the user just rejected.

## Phase 4 — Verify and fix before finalising

Before this plan is considered done, check it against itself:

1. **Coverage.** Walk every requirement listed in §2 and confirm it maps to
   at least one task in §5 (fill in §7, the coverage table, as you do this).
   If anything is unmapped, add or fix a task — do not finalise with a gap.
2. **Correctness.** Re-check every type, signature, function name, prop
   name, and file path mentioned anywhere in the plan against the actual
   source you read in Phase 2. Fix any mismatch you find. A plan with a wrong
   signature is worse than no plan, because it will send whoever implements
   it down the wrong path with false confidence.
3. **No loose ends.** §8 (risks/open questions) must end up empty. If it
   isn't, that's unresolved ambiguity — take it back to the user (Phase 1),
   don't ship a plan with known gaps.
4. **Human-review coverage.** For every requirement whose correctness can't
   be fully pinned down by an automated check — tone, voice, subjective
   quality, and the like — confirm at least one task carries a
   `Human review:` line for it. Don't let these hide behind acceptance
   criteria that only look mechanical.

For a **Slice plan**, checks 1–3 are the whole of Phase 4, done lightly: every
requirement points at a demo step or test, every file path named exists (or
is explicitly new), and nothing is left open. Skip the rest.

For a **phased set**, also run these cross-file checks:

5. **Interface continuity.** Every signature in a phase's "Interfaces from
   earlier phases" list must be produced, identically, by a task in an
   earlier phase. Every function a later task imports must be *exported* by
   the task that creates it. Every field a later phase reads must be *wired*
   by some task, not just defined: a helper created in one task and never
   plugged in anywhere is a gap. Fix the producing task, not just the
   consumer's list.
6. **Placement.** Each task appears in exactly one phase file. The coverage
   table in the overview and the phase slices agree. The phase map's
   dependencies match the tasks' `Depends on:` lines.
7. **Cold read.** Read each phase file as a fresh session would: overview plus
   that phase file only. Every path, signature and section reference it relies
   on must resolve without opening another phase file or the conversation.

Only once all checks pass does the plan's `Status` become `Approved` in the
document header (in every file of a phased set).

## Phase 5 — Save and report

1. Determine today's date (`YYYY-MM-DD`) and a kebab-case slug for the
   feature name.
2. Save the finished plan to `plans/YYYY-MM-DD-<feature-slug>.md`, or, for a
   phased set, to `plans/YYYY-MM-DD-<feature-slug>-00-overview.md` plus
   `-01-<phase-slug>.md`, `-02-…`, creating the `plans/` directory if it
   doesn't exist yet.
3. Tell the user where it landed and give a one- or two-sentence summary of
   the approach and the number of tasks — don't paste the whole plan back
   into the chat if it's long; they can open the file. For a phased set, add
   a short table of phases (file, tasks, what each ends with) and the command
   to start the first phase in a fresh conversation. If any task carries a
   `Human review:` line, say so explicitly: those tasks need the user's
   explicit sign-off during execution, not just green tests.
4. Do not commit the file to git unless the user explicitly asks you to.

## A living checklist, not a one-shot artifact

The saved plan uses GitHub-style task checkboxes so it can be checked off as
work proceeds. If the user later asks to update, re-scope, or continue a
plan, re-open the same file, re-run the Phase 4 verification against the
current state of the code (code moves; a plan written last week may now
reference a signature that changed), and edit it in place rather than
creating a second file for the same feature.

For a phased set:

- Tick a phase in the overview's phase map only once its phase Definition of
  Done is met.
- When re-scoping, edit the affected phase files in place.
- If a change alters a signature or data shape, re-run the interface-continuity
  check (Phase 4, check 5) on **every later phase**. Their "Interfaces from
  earlier phases" lists must be updated with it.
- Converting an existing single-file plan into a phased set is a re-layout of
  the same plan. Move the task blocks verbatim (with their global numbers),
  run all seven Phase 4 checks, then delete the single file so there's one
  source of truth. Ask first if the user might want it kept.
