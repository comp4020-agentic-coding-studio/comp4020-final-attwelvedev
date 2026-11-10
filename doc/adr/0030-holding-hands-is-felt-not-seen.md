# 30. Holding hands is felt, not seen

## Status

accepted (2026-11-10)

## Context

Holding hands is how Can't see moves with the team, and it is the only physical contact in the game. In playtest 3 (2026-11-08) Hanna, playing Can't see, "didn't know when hand is held". The sighted see a link between the two figures (`drawHold`). Can't see's view sends no entities (ADR 0007), and holding hands has no sound, so Can't see got nothing.

We weighed four options:

- **A caption.** Captions are for sounds, and they're easy to miss.
- **A blurred figure of the teammate.** Hanna's idea. It tells Can't see *who* is holding them, which touch does not: you feel a hand, not a name.
- **A new hand or arm drawing.** A second picture for the same thing the sighted already know as the link.
- **Phone vibration.** Not supported on iOS.

## Decision

Holding hands is perceived as touch.

- **Can't see is sent the touch, not the person.** While their hand is held, their view carries one own-seat field: the hand's direction (one tile), whether they lead or are towed, and whether the pair is pulling against each other. It carries no seat, id, colour or name of the other person.
- **Can't see sees the same link the sighted see.** Their frame draws `drawHold` from their own figure to one tile in that direction, with the same join, unjoin and tremor motion.
- **Grip and release are heard only by the two in the pair,** whatever their roles. They are local, private sounds, like the earpiece, with exception rows in `parity.test.ts`: touch is felt only by the two holding hands.
- **Who is holding the hand is found only by communicating.**

## Consequences

- Can't see gets a constant sign that they're held, and a sound for the moment it starts and ends. The sighted's experience is unchanged.
- The rule "Can't see is sent no entities" gains one exception, which is position-free beyond one tile and identity-free. `spec/perception.test.ts` guards that no id leaks.
- Touch could later carry messages (squeezing patterns). That's parked in `specs/backlog.md` and not decided here.
