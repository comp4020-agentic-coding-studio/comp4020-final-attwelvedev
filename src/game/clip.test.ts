import { describe, expect, it } from "vitest";
import { area, intersectLight, subtractRects } from "./clip.ts";

const square = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
const total = (pieces: { x: number; y: number }[][]) => pieces.reduce((n, p) => n + area(p), 0);

describe("area", () => {
  it("is the size of the shape, whichever way round it is wound", () => {
    expect(area(square(0, 0, 4, 3))).toBeCloseTo(12);
    expect(area([...square(0, 0, 4, 3)].reverse())).toBeCloseTo(12);
  });
});

describe("subtractRects", () => {
  const rect = { x0: 4, y0: 2, x1: 8, y1: 6 };

  it("leaves a shape that misses the rectangle as it was", () => {
    const pieces = subtractRects(square(0, 0, 3, 3), [rect]);
    expect(total(pieces)).toBeCloseTo(9);
  });

  it("removes a shape that is wholly inside it", () => {
    expect(subtractRects(square(5, 3, 7, 5), [rect])).toEqual([]);
  });

  it("keeps only what is outside: a shape across the edge loses the inside half", () => {
    const pieces = subtractRects(square(2, 3, 6, 5), [rect]); // 4 wide, half of it inside
    expect(total(pieces)).toBeCloseTo(4);
    for (const piece of pieces) {
      for (const p of piece)
        expect(p.x <= 4 + 1e-9 || p.x >= 8 - 1e-9 || p.y <= 2 || p.y >= 6).toBe(true);
    }
  });

  it("splits a shape around the rectangle into pieces that do not overlap", () => {
    // a big square with the rectangle cut out of the middle
    const pieces = subtractRects(square(0, 0, 12, 8), [rect]);
    expect(total(pieces)).toBeCloseTo(12 * 8 - 4 * 4);
  });

  it("takes away several rectangles", () => {
    const pieces = subtractRects(square(0, 0, 12, 8), [rect, { x0: 9, y0: 0, x1: 11, y1: 2 }]);
    expect(total(pieces)).toBeCloseTo(96 - 16 - 4);
  });
});

// The part of a shape that is in the light: the light is star-shaped round the one who casts it, so it is
// the union of the triangles (caster, corner, next corner), each of them convex.
describe("intersectLight", () => {
  const from = { x: 5, y: 5 };
  // a square of light, 4 by 4, round (5, 5), as a polygon of four corners
  const light = square(3, 3, 7, 7);
  it("keeps a shape that lies wholly in the light, with the same area", () => {
    expect(total(intersectLight(square(4, 4, 6, 6), light, from))).toBeCloseTo(4, 6);
  });
  it("drops a shape that lies wholly outside it", () => {
    expect(intersectLight(square(8, 8, 9, 9), light, from)).toEqual([]);
  });
  it("keeps only the part inside: a shape across the edge loses the outer half", () => {
    // 6..8 in x, 4..6 in y: the light ends at x = 7, so half of it (1 by 2) stays
    expect(total(intersectLight(square(6, 4, 8, 6), light, from))).toBeCloseTo(2, 6);
  });
  it("counts the overlap of two triangles once, not twice", () => {
    // a shape across the middle, over all four triangles: its area must not exceed its own
    expect(total(intersectLight(square(2, 2, 8, 8), light, from))).toBeCloseTo(16, 6);
  });
  it("follows a light that is not a square: the shadow behind a pillar is left out", () => {
    // someone at (0, 2) in a 4-by-4 room, a pillar at x 2 to 3, y 1.5 to 2.5. The rays through its two near
    // corners meet the far wall at y = 1 and y = 3, so the light is the room minus the trapezoid
    // (2, 1.5) (4, 1) (4, 3) (2, 2.5), whose area is 3. Every corner is in line of sight of the caster, in
    // order round it, as a real light polygon's are.
    const l = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 1 },
      { x: 2, y: 1.5 },
      { x: 2, y: 2.5 },
      { x: 4, y: 3 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ];
    const caster = { x: 0, y: 2 };
    expect(total(intersectLight(square(0, 0, 4, 4), l, caster))).toBeCloseTo(13, 6);
    // a shape wholly in the shadow, behind the pillar, is dropped; one just beside it is kept whole
    expect(intersectLight(square(2.8, 1.9, 3.2, 2.1), l, caster)).toEqual([]);
    expect(total(intersectLight(square(3.2, 0.2, 3.8, 0.8), l, caster))).toBeCloseTo(0.36, 6);
  });
});
