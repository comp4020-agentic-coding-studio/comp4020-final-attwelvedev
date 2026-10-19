# 12. Sighted roles perceive only what is in their line of sight

## Status

proposed

## Context

ADR 0007 sends each client only what its role perceives, but sight was
global: Can't hear and Can't speak saw the whole room, while sound was
already local. So Can't speak, who sees and hears, perceived everything
everywhere and never needed anyone ("does their own thing" in both
playtests). Can't see perceived a strict subset of that, so had nothing to
give ("deadweight").

I weighed:

- **Balancing with channels and map design alone:** cheaper, but it leaves the
  omniscient role in place.
- **Layout plus teammates out of sight:** gentler, but teammates' positions
  would still be free information.
- **Remembered fog (last-seen state):** richer, but misleading and more client
  state.

## Decision

- A sighted role receives hazards, puzzle state and teammates only within its
  line of sight. Solid walls and closed doors block it; there's no range
  limit. Outside it, the client draws the layout only.
- New tiles: glass (passes sight, not sound or movement) and vents (pass
  sound, not sight or movement). Sound cues stop at walls and glass.
- Faces and marks stay visible in dark zones. A face or mark from an unseen
  sender shows as an edge pill pointing toward them.
- Team-wide events (loot, checkpoint, caught, alarm, room cleared) still reach
  every role. Local events reach only the roles that perceive them from where
  they stand. This amends the CLAUDE.md sensory-parity invariant.
- Spectators see the whole room by default.

## Consequences

- Each player has exclusive knowledge of where they stand, which makes room
  design able to give every role a lead beat.
- Bots need line of sight and new hand-off behaviour; the solvability spec
  gains "with a lead role's sending switched off, bots fail its lead beat".
- Raycasting per seat per tick costs CPU on the 256 MB machine; it has to be
  measured at showcase load.
- `parity.test.ts` is rewritten for the amended rule.
