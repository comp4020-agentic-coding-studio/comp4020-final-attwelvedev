import { describe, expect, it } from "vitest";
import { viewFor } from "../src/game/perception.ts";
import { loadRooms } from "../src/game/rooms/load.ts";
import { stationParts } from "../src/game/sim/stations.ts";
import { step } from "../src/game/sim/step.ts";
import { visibleFrom } from "../src/game/sim/visibility.ts";
import { createWorld, TICK_MS } from "../src/game/sim/world.ts";

// Room 7, Night Shift, after the review (escape-room phase 12, Task 37): the lamps are behind a door
// the wire cut opens (and it stays open), and the UV torch is not in plain sight of the spawn.
const room = loadRooms().find((r) => r.id === "07-night-shift");
if (!room) throw new Error("no room 7");
const centre = (t: { x: number; y: number }) => ({ x: t.x + 0.5, y: t.y + 0.5 });

// The lamp banks, and the wires that must be cut to open the door in front of each.
const lampBank = (id: string) => {
  const o = room.objects.find((x) => x.id === id);
  if (!o) throw new Error(`no ${id}`);
  return stationParts(o).find((p) => p.key === "lamps")?.at ?? [];
};

describe("room 7: the lamps behind a door", () => {
  it("shuts each lamp bank behind a door that names the wires, not the switches", () => {
    for (const [lamps, wires] of [
      ["Q2", "Q1"],
      ["Q4", "Q3"],
    ] as const) {
      const bank = lampBank(lamps);
      // the door is the row just below the bank, across all its columns (a bank can be two rows deep)
      const below = Math.max(...bank.map((l) => l.y)) + 1;
      const door = room.objects.find(
        (o) =>
          o.kind === "door" &&
          [...new Set(bank.map((l) => l.x))].every((x) =>
            o.tiles.some((t) => t.x === x && t.y === below),
          ),
      );
      expect(door, `a door under ${lamps}'s lamps`).toBeDefined();
      expect(door?.opensWhen, `${lamps}'s door opens on the wires`).toEqual([wires]);
    }
  });

  it("hides the lamps until the wires are cut, then keeps the door open", () => {
    const world = createWorld(room, 3);
    const bank = lampBank("Q2");
    // looking up from the corridor, a tile under the door's row (the door itself is at y + 1)
    const stand = (t: { x: number; y: number }) => centre({ x: t.x, y: t.y + 2 });
    const seen = () => bank.every((l) => visibleFrom(world, stand(l)).has(l.x, l.y));
    expect(seen(), "shut: the lamps are not in sight").toBe(false);
    // cut the right wire (what the team does in beat 2)
    const q1 = world.stations.Q1;
    if (!q1) throw new Error("no Q1");
    q1.solved = true;
    step(world, {}, TICK_MS);
    expect(world.doorOpen.D1, "the wires are cut: it opens").toBe(true);
    expect(seen(), "open: the lamps are in sight").toBe(true);
    // and it stays open, whatever happens to the wires after (a latched door)
    q1.solved = false;
    for (let i = 0; i < 20; i++) step(world, {}, TICK_MS);
    expect(world.doorOpen.D1, "latched").toBe(true);
  });

  it("keeps the switches reachable from the start, so two stations are open at once", () => {
    // the buttons are not behind the door: only their lamps are (the linter's FR2 rule)
    const buttons =
      stationParts(room.objects.find((o) => o.id === "Q2") as never).find(
        (p) => p.key === "buttons",
      )?.at ?? [];
    const world = createWorld(room, 3);
    expect(buttons.every((b) => room.grid[b.y]?.[b.x] === ".")).toBe(true);
    expect(world.doorOpen.D1).toBe(false);
  });
});

describe("room 7: the torch is not in plain sight of the spawn", () => {
  it("is on no tile any spawn can see, so someone has to go and find it", () => {
    const world = createWorld(room, 3);
    const torch = room.objects.find((o) => o.kind === "gear" && o.params?.item === "uv");
    const at = torch?.tiles[0];
    if (!at) throw new Error("no torch");
    for (const s of room.objects.filter((o) => o.kind === "spawn")) {
      const from = s.tiles[0];
      if (!from) continue;
      expect(
        visibleFrom(world, centre(from)).has(at.x, at.y),
        `the torch at (${at.x},${at.y}) is hidden from spawn ${s.id}`,
      ).toBe(false);
    }
  });

  it("shows no other role the torch before it is picked up (it is gear on the floor, not carried)", () => {
    const world = createWorld(room, 3);
    const view = viewFor(world, 1, "deaf", false);
    expect(view.entities.some((e) => e.kind === "gear" && e.item === "uv")).toBe(false);
  });
});
