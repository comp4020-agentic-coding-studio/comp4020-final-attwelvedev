import type { Vec } from "./types.ts";

// Plain polygon geometry, for cutting a hazard's sight to the part of it that is in the light.
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// The size of a polygon, whichever way round it is wound.
export function area(poly: readonly Vec[]): number {
  let twice = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as Vec;
    const b = poly[(i + 1) % poly.length] as Vec;
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

// Keeps the part of the polygon where `side` is not negative (Sutherland-Hodgman): `side`
// is a line, so this is cutting along it.
function keep(poly: readonly Vec[], side: (p: Vec) => number): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as Vec;
    const b = poly[(i + 1) % poly.length] as Vec;
    const [sa, sb] = [side(a), side(b)];
    if (sa >= 0) out.push(a);
    if (sa >= 0 !== sb >= 0) {
      const t = sa / (sa - sb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

const EPS = 1e-6;
const worth = (poly: Vec[]) => (poly.length >= 3 && area(poly) > EPS ? [poly] : []);

// What is left of the polygon outside the rectangle, as pieces that do not overlap: the
// part to its left, to its right, and above and below it between those.
function subtractRect(poly: readonly Vec[], r: Rect): Vec[][] {
  const left = keep(poly, (p) => r.x0 - p.x);
  const right = keep(poly, (p) => p.x - r.x1);
  const mid = keep(
    keep(poly, (p) => p.x - r.x0),
    (p) => r.x1 - p.x,
  );
  const above = keep(mid, (p) => r.y0 - p.y);
  const below = keep(mid, (p) => p.y - r.y1);
  return [left, right, above, below].flatMap(worth);
}

export function subtractRects(poly: readonly Vec[], rects: readonly Rect[]): Vec[][] {
  let pieces: Vec[][] = worth([...poly]);
  for (const r of rects) pieces = pieces.flatMap((p) => subtractRect(p, r));
  return pieces;
}

// The part of a shape that is in the light. The light is star-shaped round the one who casts it, so it is the
// union of the triangles (`from`, one corner, the next): each is convex, and the shape is cut to each in turn
// (Sutherland-Hodgman). The triangles meet only along the rays from `from`, so the pieces do not overlap.
export function intersectLight(shape: readonly Vec[], light: readonly Vec[], from: Vec): Vec[][] {
  const pieces: Vec[][] = [];
  // a triangle that lies beside the shape's own bounding box cuts nothing out of it: skipped without a clip
  // (a light has hundreds of corners and a camera's cone covers a small patch of them)
  const near = {
    x0: Math.min(...shape.map((p) => p.x)),
    x1: Math.max(...shape.map((p) => p.x)),
    y0: Math.min(...shape.map((p) => p.y)),
    y1: Math.max(...shape.map((p) => p.y)),
  };
  for (let i = 0; i < light.length; i++) {
    const a = light[i] as Vec;
    const b = light[(i + 1) % light.length] as Vec;
    if (
      Math.max(from.x, a.x, b.x) < near.x0 ||
      Math.min(from.x, a.x, b.x) > near.x1 ||
      Math.max(from.y, a.y, b.y) < near.y0 ||
      Math.min(from.y, a.y, b.y) > near.y1
    )
      continue;
    const turn = (b.x - from.x) * (a.y - from.y) - (b.y - from.y) * (a.x - from.x);
    if (Math.abs(turn) < EPS) continue; // a corner in line with the caster: no triangle
    const flip = turn > 0 ? 1 : -1;
    // keep the side of each of the triangle's three edges that the triangle is on
    const edge = (p: Vec, q: Vec) => (r: Vec) =>
      flip * ((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)) * -1;
    let cut: Vec[] = [...shape];
    for (const side of [edge(from, a), edge(a, b), edge(b, from)]) {
      cut = keep(cut, side);
      if (cut.length < 3) break;
    }
    pieces.push(...worth(cut));
  }
  return pieces;
}
