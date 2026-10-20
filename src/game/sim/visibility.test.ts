import { describe, expect, it } from "vitest";
import { worldFrom } from "./testing.ts";
import { decodeSeen, encodeSeen, visibleFrom } from "./visibility.ts";

const at = (x: number, y: number) => ({ x: x + 0.5, y: y + 0.5 });

// A wall column at x = 5 (rows 1 and 2) with the way round it along row 3.
const split = (cell = "#") => [
  "##########",
  `#1...${cell}...#`,
  `#2...${cell}...#`,
  "#3.......#",
  "##########",
];

describe("visibleFrom", () => {
  it("sees round nothing past a corner", () => {
    const seen = visibleFrom(worldFrom(split()), at(1, 1));
    expect(seen.has(4, 1)).toBe(true);
    expect(seen.has(3, 3)).toBe(true); // the open way along the bottom
    expect(seen.has(8, 1)).toBe(false);
    expect(seen.has(8, 2)).toBe(false);
  });

  it("sees the wall tiles bounding the area, and the near face of a blocker", () => {
    const seen = visibleFrom(worldFrom(split()), at(1, 1));
    expect(seen.has(5, 1)).toBe(true);
    expect(seen.has(0, 0)).toBe(true);
    expect(seen.has(4, 4)).toBe(true);
  });

  it("sees through glass, but not through a vent or a closed door", () => {
    expect(visibleFrom(worldFrom(split("=")), at(1, 1)).has(8, 1)).toBe(true);
    const vent = visibleFrom(worldFrom(split("%")), at(1, 1));
    expect(vent.has(5, 1)).toBe(true); // you see the vent itself
    expect(vent.has(8, 1)).toBe(false);
    const door = worldFrom(split("D"));
    expect(visibleFrom(door, at(1, 1)).has(8, 1)).toBe(false);
    door.doorOpen.D1 = true;
    expect(visibleFrom(door, at(1, 1)).has(8, 1)).toBe(true);
  });

  it("is not blocked by a hide spot or a crate, which only cover a hazard's view", () => {
    const world = worldFrom([
      "##########",
      "#1..h..B..#",
      "#2........#",
      "#3........#",
      "##########",
    ]);
    expect(visibleFrom(world, at(1, 1)).has(9, 1)).toBe(true);
  });

  it("lists every visible tile as an x,y key, and agrees with has", () => {
    const seen = visibleFrom(worldFrom(split()), at(1, 1));
    expect(seen.tiles).toContain("1,1");
    expect(seen.tiles).not.toContain("8,1");
    expect(new Set(seen.tiles).size).toBe(seen.tiles.length);
    for (const key of seen.tiles) {
      const [x, y] = key.split(",").map(Number) as [number, number];
      expect(seen.has(x, y)).toBe(true);
    }
  });

  it("run-length encodes the seen tiles per row, and decodes them back", () => {
    expect(encodeSeen(["3,2", "1,2", "2,2", "5,2", "0,0", "1,0"])).toEqual(["0:0-1", "2:1-3,5-5"]);
    expect([...decodeSeen(["0:0-1", "2:1-3,5-5"])].sort()).toEqual(
      ["0,0", "1,0", "1,2", "2,2", "3,2", "5,2"].sort(),
    );
    expect(encodeSeen([])).toEqual([]);
  });

  it("is symmetric: if A sees B's tile, B sees A's", () => {
    const world = worldFrom([
      "##############",
      "#1....#......#",
      "#2....#..#...#",
      "#3.##.....#..#",
      "#............#",
      "##############",
    ]);
    const floor: [number, number][] = [];
    for (let y = 1; y < 5; y++)
      for (let x = 1; x < 13; x++) if (world.room.grid[y]?.[x] === ".") floor.push([x, y]);
    for (const [ax, ay] of floor) {
      const a = visibleFrom(world, at(ax, ay));
      for (const [bx, by] of floor) {
        expect(visibleFrom(world, at(bx, by)).has(ax, ay), `${ax},${ay} <-> ${bx},${by}`).toBe(
          a.has(bx, by),
        );
      }
    }
  });
});
