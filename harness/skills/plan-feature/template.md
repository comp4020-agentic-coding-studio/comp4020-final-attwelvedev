<!--
  Skeleton for a single-feature implementation plan. Copy this structure,
  fill in every section, delete this comment block, and delete any
  instructional italics text once the real content replaces it.
  Do not remove a section for being "not applicable" — write "None." instead,
  so a reviewer can tell it was considered rather than skipped.
-->

# <Feature name>

- **Date:** YYYY-MM-DD
- **Status:** Draft
- **Requirements confirmed by user:** yes — YYYY-MM-DD

## 1. Summary

*One paragraph: what this feature is, who/what it's for, and why it's being
built. A reader who has never seen this codebase should understand the goal
after this paragraph alone.*

## 2. Requirements

### 2.1 Functional requirements

*Numbered, testable statements ("The system shall..."). Each one must be
verifiable by a specific test — if you can't say what test would fail
without it, it's not specific enough yet.*

1. ...
2. ...

### 2.2 Non-functional requirements

*Performance, accessibility, security, browser/viewport targets, data
constraints, etc. Write "None beyond project defaults." if genuinely none —
do not delete the section.*

### 2.3 Out of scope

*Explicitly excluded behaviour. This is what stops scope creep mid-task.*

### 2.4 Assumptions

*Anything taken as given because it couldn't be pinned down with the user or
verified in the code. A finalised plan should have as few of these as
possible — most should have been resolved by the requirements conversation.*

## 3. Existing code context

*Everything a reader/agent with zero prior context on this codebase needs to
act on this plan without opening anything else. Every claim here must be
verified by actually reading the referenced file — never guessed or
remembered from a similar project.*

- Relevant files/modules and what they currently do today
- Relevant existing types/functions and their **exact current signatures**
  (verified against the source, not paraphrased)
- Conventions and patterns already established in this codebase that the new
  work must follow (naming, error handling, test layout, etc.)
- Test setup: framework, exact command(s) to run the relevant tests, where
  tests for this area of the code live

## 4. Approach

*The chosen implementation approach and why. Note alternatives seriously
considered and why they were rejected, if any. Include an architecture or
data-flow sketch if the feature is non-trivial.*

## 5. Task breakdown

*Each task is small enough to finish in one sitting, independently
shippable/reviewable, and follows TDD: failing test(s) first, then the
minimum code to pass, then refactor. Titles must be concrete — name the
files, functions, and behaviour, not "handle X" or "improve Y."*

### Task 1: <concrete, specific title>

- **Description:** exactly what changes and why.
- **Files touched:** exact paths, new or existing.
- **Tests first (red):** exact test file(s) and case names to add, and what
  each one asserts, including the exact signature of anything under test.
- **Implementation (green):** the exact functions/types/props/exports to add
  or change, with their final signatures. The minimum needed to pass the
  tests above — nothing extra.
- **Refactor:** cleanup expected once green (or "None expected.").
- **Acceptance criteria:** bullet list, each independently checkable.
- **Human review (if applicable):** what a human must look at and explicitly
  accept because no automated check can settle it — tone, voice, phrasing
  quality, visual/UX feel. Name the exact artifact (a diff, a rendered page,
  the rewritten copy) and what a pass looks like. Omit this line entirely
  when acceptance criteria alone are genuinely sufficient — don't add it as
  boilerplate.
- **Depends on:** other task numbers, or "None."

### Task 2: ...

*(repeat — one task per unit of work, numbered in the order they should be
done; note dependencies explicitly rather than relying on ordering alone)*

## 6. Feature-level Definition of Done

- [ ] Every task in §5 complete and its tests passing
- [ ] `<exact test command for this repo>` passes
- [ ] `<exact full project check command for this repo>` passes
- [ ] Manually verified: `<concrete steps — e.g. loaded in a browser at the
  project's marking viewports, exercised the golden path and the edge cases
  named in §2.1>`
- [ ] Every requirement in §2 is covered — see §7
- [ ] Every task with a `Human review:` line has been shown to the user and
  explicitly accepted — not inferred, not just its acceptance criteria
  passing
- [ ] No item remains in §8

## 7. Requirements coverage check

*Map every requirement in §2.1 and §2.2 to the task(s) that implement it.
Nothing in §2 may be left unmapped when the plan is finalised.*

| Requirement | Covered by |
| --- | --- |
| 2.1.1 | Task 1 |
| ... | ... |

## 8. Risks / open questions

*Anything still uncertain. This section must be empty in a finalised plan —
an open question here means the plan isn't ready and belongs back in the
requirements conversation, not left for whoever implements it to guess.*
