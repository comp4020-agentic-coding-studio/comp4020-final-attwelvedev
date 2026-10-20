import { MAP } from "../tokens.ts";
import type { Scene } from "./index.ts";

// The 3/4 projection (ADR 0016, DESIGN.md "The 3/4 recipe"). The grid stays axis-aligned with
// north up; depth is squashed by TILT.depth and height lifts a point straight up the screen.
// All three are fractions of a tile.
export const TILT = { depth: 0.82, wall: 1.1, block: 0.7 } as const;

export interface Camera {
  scale: number; // pixels per tile across
  ox: number; // pixel position of tile (0, 0) on the floor
  oy: number;
}

export function toScreen(cam: Camera, x: number, y: number, z = 0): { x: number; y: number } {
  return { x: cam.ox + x * cam.scale, y: cam.oy + y * cam.scale * TILT.depth - z * cam.scale };
}

// The floor point under a screen point, for turning a tap into a tile.
export function fromScreen(cam: Camera, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - cam.ox) / cam.scale, y: (sy - cam.oy) / (cam.scale * TILT.depth) };
}

// Tiles across the window while following: about 18 on desktop, about 7 on a phone.
export const VIEW_TILES = { desktop: 18, phone: 7 } as const;
const DESKTOP_MIN_PX = 720;
// The room's slab runs this far below its south edge before the cliff meets the water; fit
// keeps a little of it in frame, follow lets the rest run off the bottom.
const CLIFF_RESERVE = 0.5;

// Where the window sits along one axis: centred on `want`, but never so far
// from `self` that it would leave them closer than `margin` to the edge, and
// never past the room's edges (a room smaller than the window is centred).
function windowStart(
  want: number,
  self: number,
  view: number,
  room: number,
  margin: number,
): number {
  if (room <= view) return (room - view) / 2;
  const reach = Math.max(0, view / 2 - margin);
  const centre = Math.max(self - reach, Math.min(self + reach, want));
  return Math.max(0, Math.min(room - view, centre - view / 2));
}

// "fit" shows the whole room (the home feeds, the reveal); "follow" is the game camera, which
// tracks the team and keeps your own avatar in frame.
export function camera(scene: Scene): Camera {
  const roomW = scene.tiles?.[0]?.length ?? 1;
  const roomH = scene.tiles?.length ?? 1;
  const projected = roomH * TILT.depth + TILT.wall; // the room's height on screen, in tiles
  if (scene.layout === "fit" || !scene.tiles) {
    const scale = Math.max(Math.min(scene.w / roomW, scene.h / (projected + CLIFF_RESERVE)), 1);
    return {
      scale,
      ox: (scene.w - roomW * scale) / 2,
      oy: (scene.h - (projected + CLIFF_RESERVE) * scale) / 2 + TILT.wall * scale,
    };
  }
  const scale = scene.w / (scene.w >= DESKTOP_MIN_PX ? VIEW_TILES.desktop : VIEW_TILES.phone);
  const players = scene.entities.filter((e) => e.kind === "player");
  const centroid =
    players.length === 0
      ? (scene.self ?? { x: roomW / 2, y: roomH / 2 })
      : {
          x: players.reduce((sum, p) => sum + p.pos.x, 0) / players.length,
          y: players.reduce((sum, p) => sum + p.pos.y, 0) / players.length,
        };
  const self = scene.self ?? centroid;
  const left = windowStart(centroid.x, self.x, scene.w / scale, roomW, MAP.edgeMarginTiles);
  // vertically in screen tiles from the top of the north wall, since depth is squashed
  const q = (y: number) => y * TILT.depth + TILT.wall;
  const top = windowStart(
    q(centroid.y),
    q(self.y),
    scene.h / scale,
    projected,
    MAP.edgeMarginTiles,
  );
  return { scale, ox: -left * scale, oy: (TILT.wall - top) * scale };
}

// The tiles that can touch the canvas, with a tile's slack, so a big room costs what a window costs.
export function tileWindow(cam: Camera, w: number, h: number, cols: number, rows: number) {
  const s = cam.scale;
  const d = s * TILT.depth;
  return {
    x0: Math.max(0, Math.floor(-cam.ox / s) - 1),
    x1: Math.min(cols - 1, Math.ceil((w - cam.ox) / s) + 1),
    y0: Math.max(0, Math.floor(-cam.oy / d) - 1),
    y1: Math.min(rows - 1, Math.ceil((h - cam.oy + TILT.wall * s) / d) + 1),
  };
}
