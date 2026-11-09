# 23. Braille plates carry a number only Can't see can read

## Status

proposed

The design is `specs/2026-11-05-blind-purpose-and-riddles.md`. Builds on 0007 (per-role
perception), 0012 (line-of-sight perception), 0017 (balance by presence) and 0018 (perception-only
bots).

## Context

After phase 14's playtest, Can't see still had little to do. Their screen is black, they follow the
others' directions, and nothing in a room depends on something only they know. The other two roles
each hold information nobody else perceives (sight of the map, hearing of the room's sounds), so the
team must talk. Can't see contributes hearing, which Can't speak shares. I wanted braille that only
Can't see gets, carrying a hint the team cannot do without.

We weighed these.

- **Audio taps or phone vibration.** The dots as pitched taps, or as buzzes. These fit the role's
  fiction best. Rejected: vibration works only on phones, and taps are slow and hard to decode by
  ear. I chose dots on screen.
- **Plates with words or phrases.** Uncontracted braille makes even short phrases 10 or more cells,
  and a key limited to the letters used leaks the answer. Rejected for numbers only.
- **A new braille station type** with its own puzzle. It needs its own bot decoder, linter rules and
  drawing. Rejected for the same reason ADR 0020 rejected a new cache station: a plate that carries
  part of an existing station's answer reuses all of that.
- **An optional plate in room 4 (a cache hint)** to teach braille gently. Rejected: braille should
  be required from its first room, so room 4's plate gives a dial digit.

## Decision

Rooms 4 to 9 each have exactly one **braille plate**. It is a room object that holds one number
taken from one station's seeded answer: a dial digit, a keypad digit, a radio's real band, or which
wire to cut. That number is not given anywhere else in plain form, so the room cannot be cleared
without Can't see.

- Every sighted role sees the plate as an object, so they can guide Can't see to it.
- Only a Can't see seat's own view carries the content: the dot cells, while that seat stands at the
  plate after pressing Act. The content is cleared when they step off, and no other role, message
  or log line ever carries it.
- Can't see's screen shows the cells and a fixed key (0 to 9 and the number sign). Decoding is the
  player's work, and the screen-reader text gives dot numbers, never the number.
- Reading plays a soft tap heard under the ordinary sound rules, with a parity row and a sight.
- Bots read the cells from their own view and decode them (ADR 0018). The room linter fails a room 4
  to 9 without exactly one plate, or whose carried number is reachable without Can't see.

Radios with a plate get three tuned bands, two of them decoys. The plate names the real one.

## Consequences

- Can't see has a job in every room from 4 on that only they can do, and the team must relay what
  they read. This is the balance-by-presence principle of 0017, applied to the role that had the
  least.
- The view gains an own-seat field like the cache riddle, and the perception rule in CLAUDE.md must
  name it.
- Each room 4 to 9 is re-authored so one of its station answers moves onto the plate. Bot pass rates
  and room budgets must be re-checked, and the room-id snapshot test guards the edits.
- Sighted people playing Can't see could read the card as easily as a blind person reads braille.
  That is accepted: the game already trusts people to play their role.
- A later plate with words (for cache hints) would need contracted braille or a larger card. That
  would be a new decision.
