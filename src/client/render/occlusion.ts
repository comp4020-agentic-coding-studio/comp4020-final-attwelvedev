import type { Vec } from "../../game/types.ts";
import { type Camera, LIVE } from "./project.ts";

// A wall in front of a figure lets you see through it (DESIGN.md "The 3/4 recipe"). The wall
// is more see-through the nearer the figure is behind it, fading with distance, so walking along
// a wall moves a soft window with you and no tile ever flips.
export const SEE_THROUGH = 0.35; // a wall right over the figure
const RADIUS_TILES = 1.6; // how far the window reaches, in tiles on screen
const BODY_H = 0.95; // tiles, the figure's height (figures.ts)

// How opaque the wall tile (wx, wy) is to someone viewing the figures at `figures`: 1 far from any,
// SEE_THROUGH where it is right over one, smoothly between. A wall north of a figure covers
// nothing of it, so it is not touched. Nothing is see-through while the world is still flat.
export function wallAlpha(cam: Camera, wx: number, wy: number, figures: readonly Vec[]): number {
  if (LIVE.wall < 0.05) return 1;
  let nearest = Number.POSITIVE_INFINITY;
  for (const f of figures) {
    if (f.y >= wy) continue; // the figure is not behind this wall
    // the wall's front face covers the screen from its foot up by `LIVE.wall`; the figure is behind
    // it if it stands within that many floor tiles north of it
    const depthBehind = (wy - f.y) * LIVE.depth; // in tiles on screen
    if (depthBehind > LIVE.wall + RADIUS_TILES) continue;
    const dx = Math.abs(f.x - (wx + 0.5));
    // the figure's torso sits about half its height up; how far that is from the wall's face
    const dy = Math.max(0, depthBehind - LIVE.wall * 0.5);
    nearest = Math.min(nearest, Math.hypot(dx, dy));
  }
  void cam;
  if (nearest >= RADIUS_TILES) return 1;
  const t = Math.max(0, nearest / RADIUS_TILES);
  const eased = t * t * (3 - 2 * t); // smoothstep: no kink where the window ends
  return SEE_THROUGH + (1 - SEE_THROUGH) * eased;
}

// How much of a figure is hidden by the walls in front of it, 0 (all of it shows) to 1 (none of it
// does). The outline of a hidden figure is drawn at this strength, so it fades in as they go behind.
export function figureCover(cam: Camera, at: Vec, tiles: readonly string[]): number {
  if (LIVE.wall < 0.05) return 0;
  const reach = Math.ceil(LIVE.wall / LIVE.depth) + 1;
  let hidden = 0;
  // sample the figure across its width and up its height: how many of those points a wall covers
  const samples = 5;
  const half = 0.31; // half the figure's width, in tiles
  let total = 0;
  for (let i = 0; i < samples; i++) {
    const x = at.x - half + (2 * half * i) / (samples - 1);
    for (let j = 0; j < samples; j++) {
      const h = (BODY_H * j) / (samples - 1); // height up the figure, in tiles
      total++;
      // a point at height h on a figure at depth y sits on screen where a wall tile `ry` south of it
      // covers it iff the wall's top reaches that high: the wall at row ry hides heights up to
      // LIVE.wall - (ry - at.y) * LIVE.depth
      for (let ry = Math.floor(at.y) + 1; ry <= Math.floor(at.y) + reach; ry++) {
        const ch = tiles[ry]?.[Math.floor(x)];
        if (ch !== "#" && ch !== "%") continue;
        const covers = LIVE.wall - (ry - at.y) * LIVE.depth;
        if (h <= covers) {
          hidden++;
          break;
        }
      }
    }
  }
  void cam;
  return total === 0 ? 0 : hidden / total;
}
