import { describe, expect, it } from "vitest";
import { footLit } from "../../game/light.ts";
import type { Vec } from "../../game/types.ts";
import type { EntityView } from "../../net/protocol.ts";
import {
  cutToSight,
  decodeSeen,
  inLight,
  lightPolygon,
  litEntities,
  tileTouched,
} from "./sight.ts";

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

describe("cutToSight: a station is drawn only where it stands in your sight", () => {
  const station = (parts: { key: string; at: { x: number; y: number }[] }[]) =>
    ({
      id: "Q1",
      kind: "station",
      pos: { x: 1.5, y: 1.5 },
      station: { type: "wires", shows: [], solved: false, parts },
    }) as unknown as EntityView;
  const seen = decodeSeen(["1:0-3"]); // row 1, x 0..3 in sight
  const wires = [
    { x: 1, y: 1 },
    { x: 7, y: 1 },
  ];

  it("keeps the parts in sight and drops the ones out of it", () => {
    const [cut] = cutToSight([station([{ key: "wires", at: wires }])], seen);
    expect(cut?.station?.parts[0]?.at).toEqual([{ x: 1, y: 1 }]);
  });

  it("drops a station none of whose parts is in sight, and leaves everything else alone", () => {
    const far = [{ x: 8, y: 1 }];
    const door = { id: "D1", kind: "door", pos: { x: 9.5, y: 1.5 } } as unknown as EntityView;
    const out = cutToSight([station([{ key: "wires", at: far }]), door], seen);
    expect(out.map((e) => e.id)).toEqual(["D1"]);
  });

  it("changes nothing for a watcher, who has no `seen`", () => {
    const all = [station([{ key: "wires", at: wires }])];
    expect(cutToSight(all, null)).toBe(all);
  });
});

describe("inLight / litEntities: what stands out of the exact light is not drawn", () => {
  // a viewer in the open at (2.5, 3.5); a wall block at (6,3) casts a shadow behind it
  const GRID = [
    "############",
    "#..........#",
    "#..........#",
    "#.....#....#",
    "#..........#",
    "#..........#",
    "############",
  ];
  const viewer = { x: 2.5, y: 3.5 };
  const light = lightPolygon(viewer, GRID);
  const player = (id: string, x: number, y: number, seat = 1) =>
    ({ id, kind: "player", pos: { x, y }, seat }) as unknown as EntityView;

  it("is true for a point in the open and false for one in a wall's shadow", () => {
    expect(inLight(light, { x: 4.5, y: 3.5 })).toBe(true);
    expect(inLight(light, { x: 9.5, y: 3.5 }), "straight behind the block").toBe(false);
  });

  it("keeps a figure on a tile the light only grazes (the clip then cuts it at the cone's edge), and drops one on a tile it never touches", () => {
    // the block at (6,3) shades the tiles behind it. A figure at the corner stands on a tile a ray
    // grazes: it is kept whole and the clip to the light cuts the shadowed part off. One straight
    // behind the block, in a tile no ray reaches, is dropped.
    const grazed = { x: 6.9, y: 3.95 };
    expect(inLight(light, grazed), "its feet are in shadow").toBe(false);
    expect(
      tileTouched(light, Math.floor(grazed.x), Math.floor(grazed.y)),
      "its tile is grazed",
    ).toBe(true);
    expect(litEntities([player("P2", grazed.x, grazed.y, 2)], light, 0).map((e) => e.id)).toEqual([
      "P2",
    ]);
    expect(tileTouched(light, 9, 3), "a tile straight behind the block").toBe(false);
    expect(litEntities([player("P2", 9.5, 3.5, 2)], light, 0)).toEqual([]);
  });

  it("keeps a guard or camera on a tile the light touches only at a vertex, as the server sends it (review F3)", () => {
    // guards and cameras keep the tile-set rule (the server sends them by `seen`), so the client must not
    // drop one the server sent: here the polygon has a vertex inside tile (10,3) but covers under 1e-4 of it
    const v = lightPolygon({ x: 2, y: 4 }, GRID);
    expect(tileTouched(v, 10, 3), "the tile is touched at a vertex").toBe(true);
    expect(footLit(v, { x: 10.5, y: 3.5 }, 0.5), "but its footprint is not lit").toBe(false);
    for (const kind of ["guard", "camera"]) {
      const e = { id: kind, kind, pos: { x: 10.5, y: 3.5 } } as unknown as EntityView;
      expect(
        litEntities([e], v, 0).map((x) => x.id),
        kind,
      ).toEqual([kind]);
    }
    const crate = { id: "c", kind: "crate", pos: { x: 10.5, y: 3.5 } } as unknown as EntityView;
    expect(litEntities([crate], v, 0), "a crate there is still dropped").toEqual([]);
  });

  it("keeps your own figure, marks, cones and floor layout whatever the light says", () => {
    const own = player("P0", 9.5, 3.5, 0); // yours, out of your own light by construction
    const stamp = { id: "m1", kind: "stamp", pos: { x: 9.5, y: 3.5 } } as unknown as EntityView;
    const sight = { id: "s1", kind: "sight", pos: { x: 9.5, y: 3.5 } } as unknown as EntityView;
    const plate = { id: "p1", kind: "plate", pos: { x: 9.5, y: 3.5 } } as unknown as EntityView;
    const out = litEntities([own, stamp, sight, plate], light, 0);
    expect(out.map((e) => e.id).sort()).toEqual(["m1", "p1", "P0", "s1"].sort());
  });

  it("drops another figure in the shadow and keeps one in the light", () => {
    const shadowed = player("P1", 9.5, 3.5, 1);
    const lit = player("P2", 4.5, 3.5, 2);
    expect(litEntities([shadowed, lit], light, 0).map((e) => e.id)).toEqual(["P2"]);
  });

  it("drops anything that stands and can be picked up or moved out of the light, and keeps the floor's layout", () => {
    const at = { x: 9.5, y: 3.5 }; // straight behind the block: in shadow
    const thing = (kind: string) => ({ id: kind, kind, pos: at }) as unknown as EntityView;
    const standing = [
      "crate",
      "loot",
      "gear",
      "bell",
      "lamp",
      "lever",
      "keepsake",
      "card",
      "guard",
      "camera",
    ];
    const layout = [
      "plate",
      "door",
      "exit",
      "hide",
      "checkpoint",
      "hatch",
      "stamp",
      "sight",
      "ink",
      "sign",
      "motiftile",
    ];
    expect(litEntities(standing.map(thing), light, 0)).toEqual([]);
    expect(litEntities(layout.map(thing), light, 0).map((e) => e.kind)).toEqual(layout);
  });

  it("changes nothing without a light (a watcher)", () => {
    const all = [player("P1", 9.5, 3.5)];
    expect(litEntities(all, null, 0)).toBe(all);
  });
});
