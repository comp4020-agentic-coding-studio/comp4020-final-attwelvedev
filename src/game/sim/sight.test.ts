import { describe, expect, it } from "vitest";
import { inCone, lineOfSight } from "./sight.ts";
import { worldFrom } from "./testing.ts";

const GRID = [
  "####################",
  "#1.........#.......#",
  "#2.........D.......#",
  "#3.........#.......#",
  "####################",
];
const at = (x: number, y: number) => ({ x: x + 0.5, y: y + 0.5 });

describe("lineOfSight", () => {
  it("sees across open floor", () => {
    expect(lineOfSight(worldFrom(GRID), at(2, 2), at(9, 2))).toBe(true);
  });

  it("is blocked by a wall", () => {
    expect(lineOfSight(worldFrom(GRID), at(9, 1), at(14, 1))).toBe(false);
  });

  it("is blocked by a closed door and open through an open one", () => {
    const world = worldFrom(GRID);
    expect(lineOfSight(world, at(9, 2), at(14, 2))).toBe(false);
    world.doorOpen.D1 = true;
    expect(lineOfSight(world, at(9, 2), at(14, 2))).toBe(true);
  });
});

describe("inCone", () => {
  const from = at(5, 2);
  const facing = { x: 1, y: 0 };

  it("includes a target ahead and within range", () => {
    expect(inCone(from, facing, at(9, 2), 6, 70)).toBe(true);
  });

  it("excludes a target beyond range or behind", () => {
    expect(inCone(from, facing, at(12, 2), 6, 70)).toBe(false);
    expect(inCone(from, facing, at(2, 2), 6, 70)).toBe(false);
  });

  it("includes up to half the field of view off-axis, and no more", () => {
    const off = (deg: number) => ({
      x: from.x + 4 * Math.cos((deg * Math.PI) / 180),
      y: from.y + 4 * Math.sin((deg * Math.PI) / 180),
    });
    expect(inCone(from, facing, off(30), 6, 70)).toBe(true);
    expect(inCone(from, facing, off(40), 6, 70)).toBe(false);
  });
});
