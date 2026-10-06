---
name: brainstorm-feature
description: Collaborative ideation pass that runs BEFORE plan-feature — explores intent, requirements and design for one feature or fix through back-and-forth dialogue with the user, constantly probing for assumptions, ambiguities, contradictions and gaps, and never writes or changes application code. Only once the user has explicitly approved the resulting spec does it hand off to plan-feature. Use whenever the user has a rough idea, wants to brainstorm, explore, or flesh out a design/spec, or says something is "just an idea" before committing to build it — even for something that sounds simple.
---

# Brainstorm Feature

Upstream of [`plan-feature`](../plan-feature/SKILL.md). This skill turns a
rough idea into an approved, unambiguous, self-contained description of
*what* to build and *why* — it never decides task breakdown, and it never
touches application code. `plan-feature` is the only place implementation
tasks get written; this skill's job ends at approval + handoff.

**Hard rule:** no code, no edits to application files, no implementation
plan, for the entire duration of this skill. The only artifact it may
produce is a design/spec file under `specs/`, plus an ADR under `doc/adr/`
for an Architecture-tier decision (only after approval) — nothing else on
disk changes.
This binds the UI design pass (Phase 3a) too: its output is a proposal in
text, never code or files.

## Size the work first: three tiers

Before Phase 1, classify the request in one line, out loud, and let the user
override it. The process scales with the risk of being wrong, not with how
much there is to say.

- **Tweak** — copy, styling, a small bug fix, wiring with an obvious shape
  (roughly under 30 minutes). **Don't run this skill.** Say so and just do
  it. If the agent got it wrong and the user redirected, note the correction
  in the project's process log, if its `CLAUDE.md` names one.
- **Slice** — one user-visible behaviour on the existing architecture,
  roughly an hour. Run the **lite pass**: Phase 1 (context + restatement),
  then Phases 2–3 as one short round (at most 3 sharp questions, asked
  together), skip Phase 3a unless the slice adds a genuinely new
  screen/component, Phase 4 *is* the approval, Phase 5 is a one-line sweep,
  no spec file (Phase 6).
- **Architecture** — data model/schema, stack, auth, the real-time layer,
  anything hard to reverse or that later slices build on. Run the **full
  process** below, and record each decision as an ADR (see below) — this is
  the one place the full ceremony pays for itself.

**ADRs (Architecture tier).** Follow Michael Nygard's format ("Documenting
Architecture Decisions", 2011):

- One file per decision, numbered, in the repo the decision applies to so it
  is versioned with the code: `doc/adr/NNNN-short-slug.md`
  (e.g. `0001-htmx-for-active-web-pages.md`).
- Fields: **Title** (`# NNNN. <decision as a noun phrase>`), **Status**,
  **Context**, **Decision**, **Consequences**. Put the alternatives that were
  weighed in Context or Decision ("chose X over Y because…") — no extra
  heading. Keep it to a page; write it in the user's voice, not boilerplate.
- Status starts `proposed` and becomes `accepted` once the user approves.
  **An accepted record is never edited.** A changed mind is a new record that
  supersedes the old one: mark the old one `superseded by NNNN` (status is
  the only edit allowed) and have the new one say `supersedes NNNN`.
- Write one only for decisions that are expensive to reverse or that someone
  will ask about later — for a multi-user app: the stack, what counts as a
  person, what persists, how a change reaches every open session. Not every
  library pick or UI tweak.
- The ADR file is the one thing besides a spec file this skill may write, and
  only after the user approves the design (Phase 4); it needs no `specs/`
  duplicate.

When torn between two tiers, pick the lower one: escalating mid-way is cheap,
and over-processing is the failure this skill is most prone to. In a
multi-week project most work is Slices; Architecture is a handful of
decisions made early. The hard rule (no code, no plan) still holds in every
tier that runs this skill.

## Phase 1 — Understand the context

Before asking the user anything, ground yourself in what already exists:

- Read the relevant parts of the codebase, `CLAUDE.md`, and any existing
  `specs/` or `plans/` files that bear on this idea. Use `Explore` or
  `general-purpose` agents for breadth if the area is large.
- If the idea touches UI, also note where the existing design system lives
  (tokens, global styles, shared components) — Phase 3a needs those paths.
- Restate the request back in your own words *before* diving into
  questions — this alone surfaces a lot of misunderstanding early, cheaply.

## Phase 2 — Probe continuously

Keep a running watch, throughout the whole conversation, for:

- **Assumptions** — anything being taken for granted about scope, users,
  environment, data, or how the existing system behaves.
- **Ambiguities** — any word or requirement that could reasonably mean more
  than one thing.
- **Contradictions** — between two things the user said, or between the
  request and how the code actually works (verified in Phase 1, not
  assumed).
- **Gaps** — things a complete design would need but nobody's mentioned
  yet: error states, empty/loading states, edge cases, who or what triggers
  it, what happens on failure, non-functional constraints, backward
  compatibility, out-of-scope boundaries.

Surface these as they come up rather than stockpiling them silently for the
end. Use `AskUserQuestion` for a concrete decision with enumerable options;
use open conversation for anything more exploratory. Ask a handful of sharp
questions at a time, not a giant simultaneous questionnaire — but don't
rubber-stamp an idea just because asking feels like friction, either.

## Phase 3 — Converge on a design

Iterate with the user: propose an approach, get their reaction, refine.
Where a real alternative exists, present it with its trade-off rather than
silently picking one and presenting it as the only option. Keep returning to
Phase 2's watch-list as the design solidifies — resolving one ambiguity
routinely surfaces another, and that's expected, not a sign of doing it
wrong.

## Phase 3a — UI design pass (only when the feature needs one)

Once the behaviour has converged enough to design against — and before
Phase 4, so approval covers the UI too — decide whether a design pass is
warranted.

**Offer it when** the feature adds a new screen, panel, dialog or component,
or noticeably changes layout or visual hierarchy. **Skip it when** the work
is wiring, copy tweaks, or fully expressible with existing components — say
so in one line and move on.

**Ask first.** Never dispatch without the user's yes. Use `AskUserQuestion`
with the concrete reason, e.g. "This adds a new comparison panel with no
existing component to reuse — want a design proposal from the
frontend-design skill before we lock the spec?" Options: run it / skip it.
If `frontend-design` isn't in this session's skill list, don't offer the
pass — tell the user it isn't installed here and design in conversation.

**Dispatch** a `Plan` subagent (read-only: it cannot edit or write files)
with a prompt that is self-contained, since it has none of this
conversation:

- Invoke the `frontend-design` skill first and follow its **first pass
  only**: the design plan (colour, type, layout with ASCII wireframes,
  principles) and its review of that plan against the brief. **Stop there**
  — write no code and no files, whatever the skill says about building.
- The brief: the feature's intent, requirements, and the states it must
  render (empty, loading, error, overflow, phone and desktop).
- The existing design system is the brief's visual direction: give the
  paths from Phase 1, and tell it to reuse existing tokens and components,
  proposing new visual language only where the feature genuinely needs it —
  and to flag each such addition and why.
- Return a proposal: wireframes per state/viewport, which existing
  components and tokens it uses, any new ones with justification, and open
  design questions it could not settle from the brief.

**Bring it back through the normal process.** The proposal is input, not a
decision. Present it to the user (wireframes inline), run the Phase 2 watch-
list over it — a design routinely exposes gaps the requirements missed —
and let the user accept, amend or reject parts.

**Iterate** by sending the user's feedback to the same subagent
(`SendMessage`) so it revises with its context intact, rather than starting
fresh. If three rounds haven't converged, stop dispatching and ask the user
whether to settle the remaining points directly in conversation.

The agreed UI lands in the spec's "UI design" subsection (template §4.1), or
in the Phase 4 summary if no spec file is written.

## Phase 4 — Present and get explicit approval

Summarize the finalized intent, requirements, and design back to the user
as a clear, complete statement — not a question — and ask directly for
approval to proceed.

**Lead with a plain-language demo script**: 3–8 numbered steps of
`do X → expect Y`, written so someone who hasn't read the code can say "yes,
that's what I want" or "no, I'd expect something else". This is what the user
is really approving; the technical detail below it is supporting material,
kept short. If you can't write the demo script, the design isn't finished.
Jargon the user hasn't used themselves gets a half-sentence explanation or
gets cut.

- Don't treat silence, a vague "ok", or assumed consent to something long or
  consequential as approval. Get an actual yes.
- If the user changes or challenges something at this point, that's a normal
  part of the process, not a failure of it — loop back to Phase 2/3 and
  re-present once it's resolved.

## Phase 5 — Final probe sweep

Immediately before finishing, explicitly re-run the Phase 2 checklist
against the *final* agreed design, out loud in your response — don't just
trust that earlier passes covered it:

- [ ] Every assumption made during the conversation is stated and either
  confirmed or removed
- [ ] No ambiguous term or requirement remains unresolved
- [ ] No contradiction between any two things said during the conversation
- [ ] No obvious gap (error handling, edge cases, non-functional
  requirements, out-of-scope boundary) left unaddressed
- [ ] If the feature has UI: the Phase 3a decision (run or skipped, and why)
  is recorded, and every state named in the requirements has an agreed look

If this sweep finds anything, resolve it with the user before finishing —
never let a known loose end ride into the handoff.

## Phase 6 — Write a spec file (only when it earns its keep)

- **Slices never get a spec file.** The approved Phase 4 summary (demo
  script included) is the handoff.
- If the design is small enough to state fully in the Phase 4 summary, no
  file is needed — just carry that finalized description forward into the
  handoff.
- If the design needs extensive architecting — multiple components or
  subsystems, a non-trivial data model, real trade-offs worth recording, or
  work that will span more than one sitting — write it to
  `specs/YYYY-MM-DD-<feature-slug>.md` using `template.md` (next to this
  file). When genuinely unsure which case you're in, write it down: the cost
  is low and it gives `plan-feature` (and any future reader) a durable,
  self-contained reference instead of a conversation that scrolled away.
- Do not commit the file to git unless the user explicitly asks you to.

## Phase 7 — Hand off to plan-feature

Once the user has approved the design (Phase 4) and the Phase 5 sweep is
clean:

- Invoke the `plan-feature` skill in the same conversation, carrying the
  finalized requirements/design forward — either inline in the invocation,
  or by pointing it at the `specs/` file just written. State the tier
  (Slice or Architecture) so `plan-feature` sizes the plan accordingly.
- `plan-feature`'s own requirements-locking phase should treat this as
  already-settled input: point it straight at what was agreed here rather
  than re-running the requirements conversation from scratch, unless
  `plan-feature`'s codebase investigation surfaces something genuinely new.
- This skill's job ends here. Do not write implementation code, and do not
  start drafting task breakdowns yourself — that's `plan-feature`'s work.
