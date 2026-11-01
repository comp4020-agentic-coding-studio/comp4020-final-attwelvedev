import { describe, expect, it } from "vitest";
import { viewFor } from "../src/game/perception.ts";
import { loadRooms } from "../src/game/rooms/load.ts";
import { solidTile } from "../src/game/sim/collide.ts";
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

// Tiles a player can walk to from `from` with the doors as they are now (the sim's own solidity).
function reach(world: ReturnType<typeof createWorld>, from: { x: number; y: number }) {
  const seen = new Set([`${from.x},${from.y}`]);
  const queue = [from];
  while (queue.length > 0) {
    const t = queue.shift() as { x: number; y: number };
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const n = { x: t.x + dx, y: t.y + dy };
      const key = `${n.x},${n.y}`;
      if (seen.has(key) || solidTile(world, n.x, n.y)) continue;
      seen.add(key);
      queue.push(n);
    }
  }
  return seen;
}
const parts = (id: string, key: string) => {
  const o = room.objects.find((x) => x.id === id);
  if (!o) throw new Error(`no ${id}`);
  return stationParts(o).find((p) => p.key === key)?.at ?? [];
};
const spawnTile = () => {
  const s = room.objects.find((o) => o.id === "s1")?.tiles[0];
  if (!s) throw new Error("no spawn");
  return s;
};
const flagTile = () => {
  const k = room.objects.find((o) => o.kind === "checkpoint")?.tiles[0];
  if (!k) throw new Error("no checkpoint");
  return k;
};

// Each half has one door over the whole nook: the switches and their lamps are behind it, and only
// the half's wire cut opens it (stays open). Two other wire stations stay open, so FR2 holds.
const HALVES = [
  { name: "left", wires: "Q1", switches: "Q2", other: "Q5", from: spawnTile },
  { name: "right", wires: "Q3", switches: "Q4", other: "Q6", from: flagTile },
] as const;

describe("room 7: the switches and lamps behind one door", () => {
  for (const h of HALVES) {
    it(`${h.name}: one door over the switches and the lamps, named for the wires`, () => {
      const xs = [...parts(h.switches, "buttons"), ...parts(h.switches, "lamps")];
      const below = Math.max(...xs.map((t) => t.y)) + 1;
      const door = room.objects.find(
        (o) =>
          o.kind === "door" && xs.every((t) => o.tiles.some((d) => d.x === t.x && d.y === below)),
      );
      expect(door, `one door under ${h.switches}'s buttons and lamps`).toBeDefined();
      expect(door?.opensWhen).toEqual([h.wires]);
    });

    it(`${h.name}: the switches cannot be reached until the wire is cut, then stay reachable`, () => {
      const world = createWorld(room, 3);
      const buttons = parts(h.switches, "buttons");
      const can = () => {
        const seen = reach(world, h.from());
        return buttons.map((b) => seen.has(`${b.x},${b.y}`));
      };
      expect(can().some(Boolean), "shut: no button is reachable").toBe(false);
      const wires = world.stations[h.wires];
      if (!wires) throw new Error(`no ${h.wires}`);
      wires.solved = true;
      step(world, {}, TICK_MS);
      expect(can().every(Boolean), "cut: every button is reachable").toBe(true);
      wires.solved = false;
      for (let i = 0; i < 20; i++) step(world, {}, TICK_MS);
      expect(can().every(Boolean), "latched open").toBe(true);
    });

    it(`${h.name}: the lamps are out of sight until the wire is cut`, () => {
      const world = createWorld(room, 3);
      const bank = parts(h.switches, "lamps");
      const stand = (t: { x: number; y: number }) => centre({ x: t.x, y: t.y + 2 });
      const seen = () => bank.every((l) => visibleFrom(world, stand(l)).has(l.x, l.y));
      expect(seen()).toBe(false);
      const wires = world.stations[h.wires];
      if (!wires) throw new Error(`no ${h.wires}`);
      wires.solved = true;
      step(world, {}, TICK_MS);
      expect(seen()).toBe(true);
    });

    it(`${h.name}: another wire station is open from the start, so two stations are open at once`, () => {
      const world = createWorld(room, 3);
      const seen = reach(world, h.from());
      for (const [id, key] of [
        [h.wires, "wires"],
        [h.other, "pads"],
      ] as const) {
        expect(
          parts(id, key).some((t) => seen.has(`${t.x},${t.y}`)),
          `${id}'s ${key} are reachable with every door shut`,
        ).toBe(true);
      }
    });
  }

  it("makes the extra stations count: the middle doors wait for them too", () => {
    const need = (door: string) => room.objects.find((o) => o.id === door)?.opensWhen ?? [];
    expect(need("D4")).toContain("Q5");
    expect(need("D3")).toContain("Q6");
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

  it("is far from every ink, and on the spawn's side of the first door", () => {
    const world = createWorld(room, 3);
    const torch = room.objects.find((o) => o.kind === "gear" && o.params?.item === "uv")?.tiles[0];
    if (!torch) throw new Error("no torch");
    for (const ink of room.objects.filter((o) => o.kind === "ink")) {
      const t = ink.tiles[0] as { x: number; y: number };
      expect(
        Math.abs(t.x - torch.x) + Math.abs(t.y - torch.y),
        `ink ${ink.id} is far from the torch`,
      ).toBeGreaterThanOrEqual(8);
    }
    expect(reach(world, spawnTile()).has(`${torch.x},${torch.y}`), "the spawn can walk to it").toBe(
      true,
    );
  });

  it("shows no other role the torch before it is picked up (it is gear on the floor, not carried)", () => {
    const world = createWorld(room, 3);
    const view = viewFor(world, 1, "deaf", false);
    expect(view.entities.some((e) => e.kind === "gear" && e.item === "uv")).toBe(false);
  });
});
