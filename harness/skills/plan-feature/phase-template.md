<!--
  Skeleton for ONE PHASE of a phased plan set (see SKILL.md, "Choosing the
  layout"). A fresh session reads only the overview plus this file, so this
  file must carry every file path, signature and piece of context the phase
  needs, and reference nothing else in the set except the overview.
  Fill in every section, delete this comment and the instructional italics.
  Write "None." rather than deleting a section.
-->

# <Feature name> — Phase NN: <phase name>

- **Date:** YYYY-MM-DD
- **Status:** Draft
- **Requirements confirmed by user:** yes — YYYY-MM-DD
- **Part of:** `plans/YYYY-MM-DD-<slug>-00-overview.md`. Read it first; name
  the overview sections this phase leans on.
- **Depends on phases:** *NN, NN, or "none"*.

## 1. Summary

*What this phase delivers and what state the repo is in when it ends.*

## 2. Requirements (this phase)

### 2.1 Functional

*The overview requirement numbers this phase implements, fully or in part.
Say which part ("FR17: the server-side refusal"). Don't restate their text.*

### 2.2 Non-functional

### 2.3 Out of scope for this phase

*Including work deferred to named later phases.*

### 2.4 Assumptions

*"See overview §2.4", plus anything phase-specific.*

## 3. Existing code context (verified YYYY-MM-DD)

*Only the files, exact signatures, data facts and gotchas this phase touches,
copied verbatim from the source.*

### Interfaces from earlier phases (exact)

*Every type, function, export, endpoint and data file this phase uses that an
earlier phase creates, with signatures copied verbatim from the producing
task. A fresh session must never need to open another phase file. Write
"None." for the first phase.*

## 4. Approach

*Phase-specific design and rationale. Refer to shared design as "overview
§X", and to this file's sections as "this file's §X".*

## 5. Task breakdown

### Task N: <concrete, specific title>

*Global task number. The same fields as the single-file template:
Description, Files touched, Tests first (red), Implementation (green),
Refactor, Acceptance criteria, Human review (if applicable), Depends on.*

## 6. Phase Definition of Done

- [ ] Every task in §5 is complete and its tests pass
- [ ] `<exact test command>` passes
- [ ] `<exact full check command>` passes
- [ ] *Phase-specific checkable end state, including any milestone or human review*
- [ ] Tick this phase in overview §5 and commit

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |

## 8. Risks / open questions

*Must be empty in a finalised plan.*
