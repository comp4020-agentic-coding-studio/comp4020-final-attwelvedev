import { describe, expect, it } from "vitest";
import { viewFor } from "../perception.ts";
import { createWorld } from "../sim/world.ts";
import { parseRoom } from "./format.ts";
import { buildMockup } from "./mockup.ts";

const text = (grid: string[], head: Record<string, unknown> = {}) =>
  `${JSON.stringify({ id: "t", name: "T", version: 1, beats: [], objects: {}, ...head })}\n---\n${grid.join("\n")}\n`;

const GRID = ["##########", "#1..#...E#", "#2..=..p.#", "#3..#....#", "##########"];

describe("buildMockup", () => {
  const room = parseRoom(text(GRID, { objects: { D1: { opensWhen: ["p1"] } } }));
  const mock = buildMockup(room);

  it("describes the room: its size and the grid the game draws", () => {
    expect(mock.width).toBe(10);
    expect(mock.height).toBe(5);
    expect(mock.grid).toEqual(room.grid);
  });

  it("holds, for every role and every floor tile, exactly what the game's view says is seen", () => {
    for (const role of ["blind", "deaf", "mute"] as const) {
      for (const [key, cell] of Object.entries(mock.roles[role].cells)) {
        const [x, y] = key.split(",").map(Number) as [number, number];
        const world = createWorld(room);
        world.players[1].pos = { x: x + 0.5, y: y + 0.5 };
        const real = viewFor(world, 1, role, false);
        expect(cell.seen, `${role} at ${key}`).toEqual(real.seen ?? []);
        expect(cell.entities, `${role} at ${key}`).toEqual(
          real.entities.filter((e) => e.kind !== "player").map((e) => e.id),
        );
      }
    }
  });

  it("gives Can't see no sight at all, and Can't hear no sounds", () => {
    const blind = Object.values(mock.roles.blind.cells);
    const deaf = Object.values(mock.roles.deaf.cells);
    expect(blind.every((c) => c.seen.length === 0)).toBe(true);
    expect(deaf.every((c) => c.sounds.length === 0)).toBe(true);
  });

  it("lists a sound once per kind and bearing, not once per tick it drifts", () => {
    const walker = parseRoom(
      text(["##########", "#1.......E#", "#2.G.....#", "#3.......#", "##########"], {
        objects: {
          G1: {
            patrol: [
              [3, 2],
              [8, 2],
            ],
            speedTps: 1.5,
          },
        },
      }),
    );
    const cells = Object.values(buildMockup(walker).roles.blind.cells);
    for (const cell of cells) {
      const keys = cell.sounds.map((s) => s.kind);
      expect(keys.length).toBeLessThanOrEqual(new Set(keys).size * 8); // at most one per octant
    }
    const here = buildMockup(walker).roles.blind.cells["1,1"];
    expect(here?.sounds.filter((s) => s.kind === "guard").length).toBeLessThanOrEqual(8);
  });

  it("leaves out walls and glass as places to stand", () => {
    expect(mock.roles.deaf.cells["4,2"]).toBeUndefined(); // the glass at (4,2)
    expect(mock.roles.deaf.cells["0,0"]).toBeUndefined();
    expect(mock.roles.deaf.cells["1,1"]).toBeDefined();
  });
});
