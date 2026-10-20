import { describe, expect, it } from "vitest";
import type { Vec } from "../../game/types.ts";
import { lightPolygon } from "./sight.ts";

// The region you can see from a point, as the polygon the mist is cut out of. It has to be exact:
// the edge of the light runs through the corners of walls, the way a camera's cone does, not along
// tile edges and not as a chord between a few rays.

const room = (rows: string[]) => rows;
const inside = (poly: Vec[], x: number, y: number): boolean => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = [poly[i] as Vec, poly[j] as Vec];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
};

const OPEN = room([
  "############",
  "#..........#",
  "#..........#",
  "#..........#",
  "#..........#",
  "#..........#",
  "#..........#",
  "############",
]);

describe("lightPolygon", () => {
  it("fills an open room, and none of the wall around it", () => {
    const poly = lightPolygon({ x: 3.4, y: 3.6 }, OPEN);
    for (const [x, y] of [
      [1.2, 1.2],
      [10.8, 6.8],
      [10.8, 1.2],
      [1.2, 6.8],
      [6, 4],
    ] as const)
      expect(inside(poly, x, y), `${x},${y}`).toBe(true);
    expect(inside(poly, 0.5, 3.5)).toBe(false); // the west wall's own tile
    expect(inside(poly, 11.5, 3.5)).toBe(false);
  });

  it("leaves a shadow behind a block whose edges run exactly through its corners", () => {
    const tiles = room([
      "############",
      "#..........#",
      "#..........#",
      "#..........#",
      "#.....#....#",
      "#..........#",
      "#..........#",
      "############",
    ]);
    const poly = lightPolygon({ x: 2.3, y: 4.5 }, tiles);
    // the block fills x 6..7, y 4..5; the tangents run through its west corners (6, 4) and (6, 5),
    // so behind it the shadow is |y - 4.5| < 0.5 / 3.7 * (x - 2.3)
    const half = (x: number) => (0.5 / 3.7) * (x - 2.3);
    expect(inside(poly, 10, 4.5)).toBe(false);
    expect(inside(poly, 10, 4.5 + half(10) - 0.1)).toBe(false); // just inside the shadow
    expect(inside(poly, 10, 4.5 + half(10) + 0.1)).toBe(true); // just outside it
    expect(inside(poly, 10, 4.5 - half(10) + 0.1)).toBe(false);
    expect(inside(poly, 10, 4.5 - half(10) - 0.1)).toBe(true);
    expect(inside(poly, 9, 4.5 + half(9) + 0.1)).toBe(true);
    expect(inside(poly, 9, 4.5 + half(9) - 0.1)).toBe(false);
    // the block itself is not lit: you stop at its face
    expect(inside(poly, 6.6, 4.5)).toBe(false);
    expect(inside(poly, 5.9, 4.5)).toBe(true);
  });

  it("lights a thin diagonal sliver through a gap, edge inside the tile", () => {
    // the sight spec's room: a wall across the west end with the open ground east of it
    const tiles = room([
      "####################",
      "#..................#",
      "#..................#",
      "##########.........#",
      "#..................#",
      "#..................#",
      "####################",
    ]);
    const poly = lightPolygon({ x: 1.5, y: 1.5 }, tiles);
    // the edge of the light is the ray through the wall's end at (10, 3): slope 1.5 / 8.5
    const edge = (x: number) => 1.5 + (1.5 / 8.5) * (x - 1.5);
    for (const x of [13.2, 15.4, 16.9, 18.3]) {
      expect(inside(poly, x, edge(x) - 0.1), `lit above the edge at ${x}`).toBe(true);
      expect(inside(poly, x, edge(x) + 0.1), `veiled below the edge at ${x}`).toBe(false);
    }
    expect(inside(poly, 5, 4.5)).toBe(false); // plainly behind the wall
  });

  it("is bounded by the map even with no wall in it, so an open room is lit whole and not nowhere", () => {
    const empty = room(["....", "....", "...."]);
    const poly = lightPolygon({ x: 1.5, y: 1.5 }, empty);
    expect(poly.length).toBeGreaterThan(3);
    expect(inside(poly, 0.2, 0.2)).toBe(true);
    expect(inside(poly, 3.8, 2.8)).toBe(true);
    expect(inside(poly, 4.5, 1.5)).toBe(false); // past the map
  });

  it("sees through glass and not through a vent or a closed door", () => {
    const behind = (ch: string, closed = false) => {
      const tiles = room(["#########", `#...${ch}...#`, "#########"]);
      const poly = lightPolygon({ x: 1.5, y: 1.5 }, tiles, (tx) => closed && tx === 4);
      return inside(poly, 6.5, 1.5);
    };
    expect(behind("=")).toBe(true);
    expect(behind("%")).toBe(false);
    expect(behind("D", true)).toBe(false);
    expect(behind("D", false)).toBe(true); // an open door passes sight
  });

  it("never lets the tile you stand on block you, even in a doorway", () => {
    const tiles = room(["#######", "#..D..#", "#######"]);
    const poly = lightPolygon({ x: 3.5, y: 1.5 }, tiles, (tx) => tx === 3);
    expect(inside(poly, 1.5, 1.5)).toBe(true);
    expect(inside(poly, 5.5, 1.5)).toBe(true);
  });

  it("is a star around the viewer: vertices go round once, in order", () => {
    const o = { x: 3.4, y: 3.6 };
    const poly = lightPolygon(o, OPEN);
    const angles = poly.map((p) => Math.atan2(p.y - o.y, p.x - o.x));
    let wraps = 0;
    for (let i = 1; i < angles.length; i++)
      if ((angles[i] as number) < (angles[i - 1] as number) - 1e-9) wraps++;
    expect(wraps).toBeLessThanOrEqual(1);
  });

  it("stays a few hundred vertices in a big room, and cheap to compute", () => {
    const wide = Array.from({ length: 12 }, (_, y) =>
      Array.from({ length: 48 }, (_, x) =>
        y === 0 || y === 11 || x === 0 || x === 47 || (x % 6 === 3 && y % 4 === 2) ? "#" : ".",
      ).join(""),
    );
    const t0 = performance.now();
    let poly: Vec[] = [];
    for (let i = 0; i < 20; i++) poly = lightPolygon({ x: 10.2 + i * 0.1, y: 5.3 }, wide);
    expect((performance.now() - t0) / 20).toBeLessThan(5); // ms a frame
    expect(poly.length).toBeLessThan(2000);
  });

  it("gives the same polygon twice for the same input, so a still room draws a still picture", () => {
    const a = lightPolygon({ x: 3.4, y: 3.6 }, OPEN);
    const b = lightPolygon({ x: 3.4, y: 3.6 }, OPEN);
    expect(a).toEqual(b);
  });
});
