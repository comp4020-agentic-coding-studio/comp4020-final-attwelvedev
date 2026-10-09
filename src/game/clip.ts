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
