<!--
  Skeleton for the OVERVIEW of a phased plan set (see SKILL.md, "Choosing the
  layout"). It holds everything every implementation session needs and nothing
  phase-specific. Each session reads this file plus exactly one phase file.
  Fill in every section, delete this comment and the instructional italics.
  Write "None." rather than deleting a section.
-->

# <Feature name> — Plan overview

- **Date:** YYYY-MM-DD
- **Status:** Draft
- **Requirements confirmed by user:** yes — YYYY-MM-DD

## 0. How to use these plans

*List the files in the set (this overview and each
`YYYY-MM-DD-<slug>-NN-<phase>.md`). Say that a session reads this overview plus
exactly one phase file, that task numbers are global across files, and that a
phase is ticked in §5 when its phase Definition of Done is met.*

## 1. Summary

*One paragraph: what the feature is, for whom, and why. Understandable with no
codebase knowledge.*

## 2. Requirements

*The single, complete requirements list for the whole feature. Phase files
refer to these numbers and don't restate them.*

### 2.1 Functional requirements

1. ...

### 2.2 Non-functional requirements

### 2.3 Out of scope

### 2.4 Assumptions

## 3. Shared context & conventions

*Only what every phase needs: stack and versions, exact test and check
commands, code conventions, layering rules (e.g. which modules must stay pure),
test layout, commit rules, and which actions need the user's go-ahead.
File-level context belongs in the phase that touches the file.*

## 4. Shared design

*Things more than one phase depends on: architecture sketch, shared types
(verbatim), shared data shapes, and cross-phase contracts (e.g. an HTTP API
table with methods, bodies, statuses, and the task that introduces each).
Phase-specific design (an algorithm, a data table used by one phase) goes in
that phase's file.*

## 5. Phases

| Phase | File | Tasks | Needs | Ends with | Done |
| --- | --- | --- | --- | --- | --- |
| 01 | `…-01-<phase>.md` | 1–N | — | *checkable end state; flag human reviews and milestones* | [ ] |

## 6. Feature-level Definition of Done

- [ ] Every phase in §5 is ticked, and every task is complete with tests passing
- [ ] `<exact test command>` passes
- [ ] `<exact full check command>` passes
- [ ] Manually verified: `<concrete end-to-end steps>`
- [ ] Every requirement in §2 is covered — see §7
- [ ] Every `Human review:` task explicitly accepted by the user
- [ ] No item remains in §8

## 7. Requirements coverage check

| Requirement | Covered by |
| --- | --- |
| 2.1.1 | Task N |

## 8. Risks / open questions

*Must be empty in a finalised plan.*
