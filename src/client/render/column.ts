import type { Vec } from "../../game/types.ts";
import { type Camera, toScreen } from "./project.ts";

// What stands is cut by the exact light, and the cut goes straight up: a point on a thing is drawn only
// if the ground directly under it is lit. So each thing gets its own clip: the lit part of its footprint
// (the light polygon cut to the footprint's box), swept straight up by `height` and drawn as ONE convex
// shape, with no gaps inside it and nothing lit "through" it from floor in front (the global sweep
// leaked both). A footprint the light only grazes leaves a thin sliver, which is the true cut.

export interface Foot {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// The light polygon cut to a box (Sutherland-Hodgman against each side).
export function cutToBox(light: readonly Vec[], b: Foot): Vec[] {
  let poly = [...light];
  const sides: ((p: Vec) => number)[] = [
    (p) => p.x - b.x0,
    (p) => b.x1 - p.x,
    (p) => p.y - b.y0,
    (p) => b.y1 - p.y,
  ];
  for (const inside of sides) {
    const next: Vec[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i] as Vec;
      const c = poly[(i + 1) % poly.length] as Vec;
      const da = inside(a);
      const dc = inside(c);
      if (da >= 0) next.push(a);
      if (da >= 0 !== dc >= 0) {
        const t = da / (da - dc);
        next.push({ x: a.x + (c.x - a.x) * t, y: a.y + (c.y - a.y) * t });
      }
    }
    poly = next;
    if (poly.length === 0) break;
  }
  return poly;
}

type S = { x: number; y: number };

const area = (pts: readonly S[]) =>
  pts.reduce((sum, a, i) => {
    const b = pts[(i + 1) % pts.length] as S;
    return sum + (a.x * b.y - b.x * a.y);
  }, 0);
// Every piece wound the same way, so under the non-zero rule they add up to their union.
const wound = (pts: S[]) => (area(pts) < 0 ? [...pts].reverse() : pts);

// The slice of ground along a box's south edge, as thin as makes no difference.
const EDGE = 0.03;

// A thing is one of two shapes. A BOX (a safe, a crate) has a front face and a top, and each is cut by
// the ground directly under it: the front by the lit stretch of the south edge, the top by the lit
// footprint lifted to `body`. A BILLBOARD (a figure, a lamp, a bell, a wire on a wall) stands on one line
// of ground: its `foot` is a thin slice of that ground, and the whole thing is cut by the lit stretch of
// it, straight up. Sweeping a whole footprint upward instead let floor behind the front edge light up
// front-face pixels whose own ground was in shadow.
export interface Part {
  foot: Foot;
  body?: number; // a box's own height; absent for a billboard
}

export interface Columns {
  clip: S[][]; // what may be drawn: the tall column, so nothing of the thing is cut
  hole: S[][]; // what the thing really covers
}

export function columnsOf(
  cam: Camera,
  light: readonly Vec[],
  parts: readonly Part[],
  height: number,
): Columns {
  const clip: S[][] = [];
  const hole: S[][] = [];
  const litOf = (f: Foot): Vec[] => cutToBox(light, f);
  const strip = (slice: Foot, y: number, up: number): S[] | null => {
    const lit = litOf(slice);
    if (lit.length < 3) return null;
    const xs = lit.map((p) => p.x);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    if (x1 - x0 < 1e-6) return null;
    return wound([
      toScreen(cam, x0, y),
      toScreen(cam, x1, y),
      toScreen(cam, x1, y, up),
      toScreen(cam, x0, y, up),
    ]);
  };
  for (const { foot: f, body } of parts) {
    if (body === undefined) {
      const tall = strip(f, (f.y0 + f.y1) / 2, height);
      if (tall) {
        clip.push(tall);
        hole.push(tall);
      }
      continue;
    }
    // a box shows only its top and its front: the ground under it is hidden by it, and a strip taller
    // than the body would let the top's pixels through where the ground behind the front edge is dark
    const lit = litOf(f);
    if (lit.length < 3) continue;
    const top = wound(lit.map((p) => toScreen(cam, p.x, p.y, body)));
    const front = strip({ x0: f.x0, x1: f.x1, y0: f.y1 - EDGE, y1: f.y1 }, f.y1, body);
    clip.push(top);
    hole.push(top);
    if (front) {
      clip.push(front);
      hole.push(front);
    }
  }
  return { clip, hole };
}

function tracePieces(ctx: CanvasRenderingContext2D, shapes: readonly S[][]) {
  for (const shape of shapes) {
    for (const [i, q] of shape.entries()) {
      if (i === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    }
    ctx.closePath();
  }
}

// Draws a thing cut exactly by the light: each point of it is drawn if and only if the ground directly
// under it is lit, so the cut is the cone's own edge carried straight up. Nothing outside the light is
// drawn, and a thing with no lit ground is not drawn at all.
export function drawCut(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  light: readonly Vec[],
  parts: readonly Part[],
  height: number,
  draw: (c: CanvasRenderingContext2D) => void,
): void {
  const whole = columnsOf(cam, light, parts, height).clip;
  if (whole.length === 0) return;
  ctx.save();
  ctx.beginPath();
  tracePieces(ctx, whole);
  ctx.clip();
  draw(ctx);
  ctx.restore();
}

// Clips to the tall column; a thing with no lit ground gets an empty clip, so nothing of it
// is drawn.
export function clipToColumns(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  light: readonly Vec[],
  parts: readonly Part[],
  height: number,
): void {
  const { clip } = columnsOf(cam, light, parts, height);
  ctx.beginPath();
  tracePieces(ctx, clip);
  if (clip.length === 0) ctx.rect(0, 0, 0, 0);
  ctx.clip();
}

// The thin slice of ground a billboard stands on, around (x, y), or, for a wall tile (a wire, a vault
// socket, a panel on the wall), along the wall's south face, which is where the ground under what hangs
// on that face is (the light ends on the face, and never fills the wall tile itself).
export function groundSlice(tiles: readonly string[], x: number, y: number, half = 0.5): Foot {
  const ch = tiles[Math.floor(y)]?.[Math.floor(x)];
  const wall = ch === "#" || ch === "%";
  const cy = wall ? Math.floor(y) + 1.02 : y;
  return { x0: x - half, x1: x + half, y0: cy - EDGE, y1: cy + EDGE };
}

// The full footprint of a tile, for a box that fills it.
export function tileFoot(tx: number, ty: number): Foot {
  return { x0: tx, y0: ty, x1: tx + 1, y1: ty + 1 };
}

// How tall each kind of standing thing is, in tiles above its foot, with a margin. Tight on purpose:
// the mist leaves a column out, so a column taller than its thing would show an unveiled patch above it.
// A test measures the real draw routines against this table.
export const HEIGHT: Record<string, number> = {
  player: 1.56,
  crate: 1.1,
  checkpoint: 1.2,
  loot: 0.7,
  camera: 3.22,
  laser: 1.3,
  guard: 1.9,
  gear: 0.34,
  bell: 2.9,
  lamp: 1.14,
  lever: 0.6,
  keepsake: 0.9,
  card: 1.3,
  order: 1.3,
  stamp: 1.6,
  link: 1.3, // a wire along a wall's top and down to its ends
  station: 1.7,
  plate: 2.0, // a name over a wall piece, the tallest
  dial: 1.15,
  bells: 3.0,
};
