import type { Vec } from "../../game/types.ts";
import { MIST, WORLD } from "../tokens.ts";
import { type Camera, TILT, toScreen } from "./project.ts";

// The tiles in your line of sight, from the view's `seen` ("y:x0-x1,x2-x3", inclusive runs). The
// client may not import src/game/sim/, so this repeats decodeSeen there; render.test.ts holds it
// to the same format.
export interface Seen {
  has(x: number, y: number): boolean;
}

export function decodeSeen(rows: readonly string[]): Seen {
  const tiles = new Set<number>();
  const key = (x: number, y: number) => y * 4096 + x;
  for (const row of rows) {
    const [y, runs = ""] = row.split(":");
    for (const run of runs.split(",")) {
      const [x0, x1] = run.split("-").map(Number) as [number, number];
      for (let x = x0; x <= x1; x++) tiles.add(key(x, Number(y)));
    }
  }
  return { has: (x, y) => tiles.has(key(x, y)) };
}

const decoded = new WeakMap<readonly string[], Seen>();
export function seenOf(rows: readonly string[]): Seen {
  const known = decoded.get(rows);
  if (known) return known;
  const seen = decodeSeen(rows);
  decoded.set(rows, seen);
  return seen;
}

// Whether a point (in tiles) is in a tile you can see.
export const inSight = (seen: Seen | null, at: Vec): boolean =>
  seen === null || seen.has(Math.floor(at.x), Math.floor(at.y));

const STIPPLE_PX = 4;

// The veil over a tile you can't see: its floor, and for a block its whole height. Drawn after
// the tile and what stands on it, so the layout stays readable through it but nothing about the
// room's state does (the server never sent that).
export function veilTile(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  x: number,
  y: number,
  height: number,
) {
  const s = cam.scale;
  const top = toScreen(cam, x, y, height);
  const h = s * TILT.depth + height * s;
  ctx.save();
  ctx.globalAlpha = MIST.alpha;
  ctx.fillStyle = WORLD.mist;
  ctx.fillRect(top.x, top.y, s + 0.5, h + 0.5);
  // a static stipple, so the haze is texture and not only a tint
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = "#ffffff";
  for (let dy = 0; dy < h; dy += STIPPLE_PX * 2)
    for (let dx = ((dy / STIPPLE_PX) % 2) * STIPPLE_PX; dx < s; dx += STIPPLE_PX * 2)
      ctx.fillRect(top.x + dx, top.y + dy, 1.5, 1.5);
  ctx.restore();
}

// A dark zone: night, with a rim along any edge that borders the light.
export function nightTile(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  tiles: string[],
  x: number,
  y: number,
) {
  const p = toScreen(cam, x, y);
  const s = cam.scale;
  const d = s * TILT.depth;
  ctx.fillStyle = WORLD.night;
  ctx.fillRect(p.x, p.y, s + 0.5, d + 0.5);
  ctx.fillStyle = WORLD.nightRim;
  const lit = (tx: number, ty: number) => {
    const ch = tiles[ty]?.[tx];
    return ch !== undefined && ch !== " ";
  };
  if (lit(x, y - 1)) ctx.fillRect(p.x, p.y, s + 0.5, 2);
  if (lit(x, y + 1)) ctx.fillRect(p.x, p.y + d - 2, s + 0.5, 2);
  if (lit(x - 1, y)) ctx.fillRect(p.x, p.y, 2, d + 0.5);
  if (lit(x + 1, y)) ctx.fillRect(p.x + s - 2, p.y, 2, d + 0.5);
}
