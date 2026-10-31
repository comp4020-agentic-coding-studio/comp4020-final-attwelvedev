import { describe, expect, it } from "vitest";
import { linkPath } from "./links.ts";

const at = (x: number, y: number) => ({ x, y });

describe("linkPath (Task 35): a station's wire to its remote part", () => {
  it("runs along wall tiles from beside the anchor to beside the remote part", () => {
    const tiles = ["#######", "#.....#", "#######"];
    const path = linkPath(tiles, at(1, 1), at(5, 1));
    // anchor, wall tiles along the top, then the remote part: every middle point is a wall
    expect(path[0]).toEqual(at(1.5, 1.5));
    expect(path.at(-1)).toEqual(at(5.5, 1.5));
    for (const p of path.slice(1, -1)) expect(tiles[Math.floor(p.y)]?.[Math.floor(p.x)]).toBe("#");
    expect(path.length).toBeGreaterThan(2);
  });

  it("is a straight line when no wall tile touches the anchor or the remote part", () => {
    const open = [".....", ".....", ".....", ".....", "....."];
    expect(linkPath(open, at(0, 0), at(4, 4))).toEqual([at(0.5, 0.5), at(4.5, 4.5)]);
  });

  it("is a straight line when no wall connects the two", () => {
    // a wall beside each, but the two bits of wall are not joined to each other
    const apart = ["#...#", "....."];
    expect(linkPath(apart, at(1, 0), at(3, 0))).toEqual([at(1.5, 0.5), at(3.5, 0.5)]);
  });

  it("is a straight line when the wall route is more than twice the Manhattan distance", () => {
    // anchor (1,0) and remote (5,0) are 4 apart; the only wall joining the side walls runs round the
    // bottom of a U, 13 tiles, past the 8 allowed
    const u = ["#.....#", "#.....#", "#.....#", "#######"];
    expect(linkPath(u, at(1, 0), at(5, 0))).toEqual([at(1.5, 0.5), at(5.5, 0.5)]);
  });

  it("keeps a wall route that is within twice the Manhattan distance", () => {
    const short = ["#.....#", "#######"];
    const path = linkPath(short, at(1, 0), at(5, 0));
    expect(path.length).toBeGreaterThan(2);
  });

  it("draws nothing for a remote part with no tile (a keypad's chime has none)", () => {
    expect(linkPath(["###", "#.#", "###"], at(1, 1), undefined)).toEqual([]);
  });
});
