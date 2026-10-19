# 16. The world is drawn in a tilted three-quarter view, not isometric

## Status

proposed

## Context

The overhaul takes Monument Valley as its main visual reference, which is
isometric. But the game depends on a shared sense of direction: Can't hear
says "left" from what they see, and Can't see turns left on their keyboard.
Arrow captions and callouts assume screen-up is north for everyone.

I weighed:

- **True isometric:** most faithful to Monument Valley, but the grid's axes
  become screen diagonals. Callouts, controls and captions would have to be
  remapped, and the long room strips fit badly.
- **Isometric with real heights:** stairs and levels in play; rewrites the
  simulation, perception, bots and linter.

## Decision

Keep the axis-aligned grid with north up and tilt the camera about 55°. Each
tile draws its top and south face, walls extrude, and figures stand upright.
Monument Valley supplies the palette, flat-shaded blocks, islands over water
and small hatted figures. The shell stays dark, and the pastel world is the
only light surface. Everything is drawn in code on a 2D canvas.

## Consequences

- The simulation is untouched; only the client renderer changes.
- Walls in front of a figure must fade to keep it visible.
- The diamond silhouette of true isometric is given up.
