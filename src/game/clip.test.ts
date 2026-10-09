import { describe, expect, it } from "vitest";
import { area, subtractRects } from "./clip.ts";

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
