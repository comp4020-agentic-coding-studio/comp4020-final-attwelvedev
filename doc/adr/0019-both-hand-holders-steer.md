# 19. Both hand-holders steer

## Status

proposed

Changes spec FR22 (`specs/2026-10-28-escape-room-heist.md`, "Hold hands: … the leader tows"). The
spec's own sentence stands; this record changes what "tows" means in the simulation.

## Context

Holding hands is how Can't see crosses a room it cannot see: a sighted player takes their hand and
leads. Until now only the one who pressed Act steered. The towed seat's own movement was thrown
away, and `tow()` placed them behind the leader each tick, so a person who was led could do nothing
but stand there and be walked. The human review of phases 02 to 10 found that this reads as being
held captive, not as being helped: a person who can see the danger and wants to turn back has no way
to say so with their own body, only by letting go.

We weighed three rules.

- **Leader only (today).** Simple, and a bot can never fight a person. But the led person has no
  say, and "one leads another" is a lesson room 2 teaches that a person can feel is unfair.
- **Both steer, the step is the sum, clamped to one.** Pushing the same way is one step, not two;
  one seat idle means the other leads at full speed; opposite pushes cancel and the pair stalls.
  It needs no second body to move (the towed seat is still placed behind the leader), and a seat
  that sends nothing adds nothing.
- **An elastic leash**, where each walks and the pair is pulled together. More physical, but it
  moves two bodies against walls and crates, and every collision rule would have to hold twice.
  Rejected, and listed out of scope in the plan.

## Decision

Both hand-holders steer. In `step`, the leader's step is the sum of both seats' moves, clamped to
length 1; the towed seat's own body is never moved by its input, and `tow()` still places it behind
the leader. Each seat's own input, and its `seq` (what is acknowledged to its client), is left
alone: only the move the leader walks is combined.

When both seats push and the pushes cancel, the pair stalls, and that is told: a `pull` world event,
once when the tug starts (never per tick), a short low sound sent to the two holders only, both
figures drawn straining (`pulling` on their entities), and a caption. It is logged as a kind only
(`pull`, detail `tug`), never which seats.

A bot never fights a person. A Can't-see bot led by the hand sends no move of its own while it
holds one (it keeps the heading it was last told, for after); a sighted bot led by someone else's
hand likewise walks nowhere (its presses still work). A bot only ever takes a hand in a `tow` job,
as the leader, so "led" is always a person's doing.

## Consequences

- A person who is led can steer, and can pull against a leader they disagree with. The stall is a
  feature: it is audible and visible, and either can let go with Act.
- The old test "the towed seat's input is ignored" is rewritten, not deleted: what it also checked
  (the towed seat follows within reach and is never put in a wall) still holds.
- The bots needed a change that the plan did not name: before it, a bot told "left" and then taken
  by the hand would hold a person still. This was found by a test on the real bot code and is
  covered by `brain.test.ts`.
- A tug is a new sound with a picture, so it has a parity row, a caption and a synth, like every
  other sound (`src/game/parity.test.ts`).
- It changes the feel of room 2's lesson ("one leads another"): the human review at the end of
  phase 12 plays it with a person as the towed seat.
