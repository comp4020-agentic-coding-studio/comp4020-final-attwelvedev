# Playtest fixes: landing margins, restart freeze, crate shadow, doors, comms wording, soundboard

- **Date:** 2026-11-08
- **Status:** Draft
- **Approved by user:** yes — 2026-11-08 (design, copy table and scope, in conversation)
- **Tier:** a batch of Slices plus one investigation. No Architecture decision, no ADR.
- **Base:** `auto/overnight`, after `fix/los-combined` is merged, which waits for unit `pt01` to finish. Nothing here touches `auto/overnight` before then.

## 1. Problem / intent

From the user's latest playthrough. Seven things, in the user's order:

- Landing page: the headline and feeds sit right against the edge of the gradient.
- In game: after everyone voted to restart a room, the timer paused and nothing could be interacted with (refresh was the workaround; seen once; nobody dropped or reconnected).
- In game: a crate's shadow is circular while the crate is a square box.
- In game: early rooms with several doors animate only the top door.
- Role screen: "Who perceives what" should name the comm for each teammate (A hears you talk, B sees your faces, ...), keeping the structure, the comm headings and the "can't" wording.
- Role screen and room start: the intro animation is sometimes laggy and sometimes freezes.
- Everywhere players read it: "clips" becomes "soundboard".

## 2. Requirements

### 2.1 Functional requirements

- **FR1 Landing margins.** The headline and the feeds have space to the left and top inside the gradient, not against its edge, at desktop and phone width.
- **FR2 Restart after a vote.** After a passed room vote the room restarts, the intro plays, the first tick follows it, and every seat can move and the clock runs. A spec repeats this many times. If the freeze cannot be reproduced, the work adds a log line and a guard and says plainly that the cause was not found.
- **FR3 Crate shadow.** A crate's shadow is a rectangle matching the box, not a circle.
- **FR4 Doors.** In every room, each door that opens plays the opening animation, not only the top one.
- **FR5 Role screen wording.** The comm headings stay (Talk, Faces, Soundboard, Marks). The line after each names the comm for each teammate: `● Ana hears you talk`, `sees your faces`, `hears your sounds`, `sees your marks`. A teammate who cannot perceive it stays `■ Bo can't`.
- **FR6 Wheel wording.** `ReceiverLine` is shared, so the wheel's plate says the same words. The wheel's page tab reads "Soundboard" and fits at phone width. The refusal reads "You can't use the soundboard. Ana and Cy can." (toast and screen reader).
- **FR7 Role line.** Can't speak's line reads "You see and hear everything. Use the soundboard, faces and marks."
- **FR8 Intro.** The room-start intro (cover fades, board tips, camera swoops) plays without long stalls or freezes. The target is set after a measurement on a quiet machine, not before.
- **FR9 DESIGN.md.** Lines 431, 436 and 441 (and the crate shadow, if it names it) match the new wording, in the same commits.

### 2.2 Non-functional requirements

- Browser checks at desktop (1280) and phone (375) width for every visual change, per `CLAUDE.md`.
- A bug fix starts with a failing test. A new guarding test is shown red by a deliberate break first.
- Frame cost does not regress: `pnpm bench:frame --compare` on a quiet machine.
- Screen-reader text matches the visible words.

### 2.3 Out of scope

- Internal names: page id `clips`, method `clip`, `CLIPS`, `clip.ts`, the canvas `clip()`.
- Sound labels ("Air horn", "Truth"), the `/stats` page's raw column headers, the "reads this" verb for text.
- Old specs and accepted ADRs: they say "clips" and stay as written (an accepted record is never edited).
- A new design pass or component.

### 2.4 Assumptions (confirmed)

- "Intro animation" means the room-start intro. Confirmed by the user, 2026-11-08.
- "The box is round" in the crate note means the box is square. Assumed from context; the fix is a rectangle either way.
- The user wants one wording in both the role screen and the wheel. Confirmed.
- Nobody dropped or reconnected during the freeze. Confirmed.

## 3. Existing context

Read in this session, in `wt-comb` (`fix/los-combined`, which is `auto/overnight` plus the line-of-sight fixes):

- **Role copy:** `src/components/RoleReveal.tsx` (the `Who perceives what` disclosure, `ROLE_LINE`) and `src/components/ReceiverLine.tsx`, which writes `● Ana hears this · ■ Bo can't` from `receiversOf` and `verbFor` (`src/client/wheel.ts:225-238`). `ReceiverLine` is also used by `src/components/CommsWheel.tsx:678`.
- **Wheel words:** `PAGE_LABEL.clips = "Clips"` (`wheel.ts:26`), `NOUN.clip = "clips"` (`CommsWheel.tsx:52`) used in the refusal toast, plate and screen-reader text.
- **Crate shadow:** `paintCrateShadow` (`src/client/render/materials.ts:217`) draws an `ellipse` from the box's half-width and half-depth. Called from `blocks.ts:414`.
- **Doors:** an opening is an fx of kind `door`, drawn by `drawDoorOpening` (`blocks.ts:359`, `index.ts:699`). `fx.ts:147-155` makes one per door and "a door of several tiles is one entity per tile with one id: it counts once". Rooms 1 to 3 have eight `D` cells each. Cause unknown.
- **Restart and intro:** `endVote` (`src/net/attach.ts:~505`) clears the timers, sends reveal views and calls `runIfReady`, which returns early if `ready.size < 3`, a timer is set, or the world is not `playing`. `restartGame` (`src/net/game.ts:360`) keeps `ready`. The client starts its hold on the `intro` message (`Game.tsx:595`) and `restarted()` (`Game.tsx:1070`) only resets `lastSent` and the summary. All of this is a hypothesis, not a finding.
- **Landing:** `.home` and `.home h1` in `src/styles/pages.css:96-135`, with the gradient on `.home`.
- **Specs that pin the old words:** `spec/layout/wheel.test.ts` (107, 307-314, 398-400), `spec/layout/reveal.test.ts` (72, 110-114), `src/client/wheel.test.ts` (225-228).

## 4. Design

Copy table (final):

| Where | Today | New |
|---|---|---|
| Role screen and wheel plate, line under each heading | `● Ana hears this · ■ Bo can't` | Talk `hears you talk`; Faces `sees your faces`; Soundboard `hears your sounds`; Marks `sees your marks`; `can't` unchanged |
| `ROLE_LINE.mute` | "...Send clips, faces and marks." | "You see and hear everything. Use the soundboard, faces and marks." |
| Wheel page tab | Clips | Soundboard |
| Wheel refusal | "You can't send clips. Ana and Cy can." | "You can't use the soundboard. Ana and Cy can." |

`ReceiverLine` takes the comm into its wording instead of `verbFor`'s "this". `NOUN` carries the whole phrase for clips, because "send soundboard" does not parse.

Alternatives weighed:
- A `ReceiverLine` prop so the wheel stays terse: rejected, the user wants one wording in both places.
- "hears your soundboard": rejected for "hears your sounds", which reads naturally.
- Editing old specs and ADRs for the rename: rejected, the repo forbids editing accepted records.

Doors, the restart freeze and the intro lag are investigations: the plan starts by reproducing each, and picks the fix from what is found.

### 4.1 UI design

Design pass skipped: no new screen or component. The existing role reveal, wheel and gradient are reused. Every visual change needs a 1280 and a 375 screenshot, and the wheel's "Soundboard" tab needs a phone-width check, because the label is twice as long.

## 5. Probes raised and resolved

| # | Type | What was raised | Resolution |
| --- | --- | --- | --- |
| 1 | ambiguity | "Round box" in the crate note | Read as a square box; the shadow becomes a rectangle |
| 2 | gap | `ReceiverLine` is shared with the wheel | User: name the comm in the wheel too; one wording |
| 3 | gap | Browser specs and DESIGN.md pin the old words | Listed in section 3; they change with the copy |
| 4 | ambiguity | "Soundboard" in "hears your ..." | User chose "hears your sounds" |
| 5 | ambiguity | Which intro lags | Room start, confirmed |
| 6 | assumption | Restart freeze may involve a drop or reconnect | Confirmed no |
| 7 | gap | Intro lag has no pass/fail number | Set after a quiet-machine measurement; load from `pt01` makes it unreliable now |
| 8 | assumption | Doors are an id-grouping or camera problem | Unconfirmed hypothesis, tested first |
| 9 | gap | Rename scope | Live copy and DESIGN.md only; old specs and accepted ADRs stay |

## 6. Handoff notes for planning

- Sequence: landing margins and crate shadow first (small, known cause), then the copy and rename together (one pass over the pinned specs), then the three investigations (doors, restart freeze, intro lag).
- The restart freeze and the intro lag may share a cause (the intro hold). Reproduce the freeze first, since a fix there may change what the lag measurement shows.
- The intro target needs a quiet machine. If the lag is only load, change no code and say so.
- Do not re-litigate: one wording in both places, "sounds" not "soundboard" in the receiver line, rename scope, reproduce-then-fix for the freeze.
- Nothing lands on `auto/overnight` until `pt01` ends and `fix/los-combined` is merged.
