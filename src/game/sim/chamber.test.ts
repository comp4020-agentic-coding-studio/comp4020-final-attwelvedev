import { describe, expect, it } from "vitest";
import { createBotMemory } from "../bots/brain.ts";
import { type BotSeat, botsAct } from "../bots/crew.ts";
import { rolesFor } from "../crew.ts";
import { viewFor } from "../perception.ts";
import { type CacheSpec, cacheOf, inRect, secretDoors } from "../rooms/format.ts";
import { lintRoom } from "../rooms/lint.ts";
import { loadRooms } from "../rooms/load.ts";
import { worldAt } from "../rooms/mockup.ts";
import type { Seat } from "../types.ts";
import { syncCacheDoors } from "./cache.ts";
import { releaseAll } from "./gear.ts";
import { step } from "./step.ts";
import { input, place, withChamber, worldWith } from "./testing.ts";
import { createWorld, TICK_MS, type World } from "./world.ts";

// A cache with the minimal chamber `worldWith` bolts under the room (Task 62): the station is Q1.
const world = () =>
  worldWith(["##########", "#1..Q....#", "#2.......#", "#3.......#", "##########"], {
    Q1: {
      type: "dial",
      pads: [
        [3, 1],
        [5, 1],
      ],
      digits: 1,
      cache: {
        owner: 1,
        motif: "moon",
        riddle: "r",
        item: "watch",
        tiles: [{ at: [7, 2], motif: "moon" }],
      },
    },
  });
const secret = (w: World) => secretDoors(w.room)[0] as ReturnType<typeof secretDoors>[number];
const open = (w: World) => [w.doorOpen[secret(w).chamber.id], w.doorOpen[secret(w).vault.id]];

describe("syncCacheDoors (Task 62)", () => {
  it("shuts both doors with neither state, opens the chamber's on uncover, both on solve", () => {
    const w = world();
    syncCacheDoors(w);
    expect(open(w)).toEqual([false, false]);
    w.cacheUncovered.push("Q1");
    syncCacheDoors(w);
    expect(open(w)).toEqual([true, false]);
    w.cacheBy.Q1 = 0;
    syncCacheDoors(w);
    expect(open(w)).toEqual([true, true]);
  });

  it("shuts them again when the state is taken back (a send-back)", () => {
    const w = world();
    w.cacheUncovered.push("Q1");
    w.cacheBy.Q1 = 0;
    syncCacheDoors(w);
    w.cacheUncovered = [];
    w.cacheBy = {};
    syncCacheDoors(w);
    expect(open(w)).toEqual([false, false]);
  });

  it("pushes no event: a secret door never makes the ordinary door click", () => {
    const w = world();
    w.cacheUncovered.push("Q1");
    w.cacheBy.Q1 = 0;
    syncCacheDoors(w);
    expect(w.events).toEqual([]);
    step(w, {});
    expect(w.events.filter((e) => e.kind === "door")).toEqual([]);
  });
});

// The fixture rooms that carry a chamber (Task 62 appended one to each).
const fixtures = () => loadRooms("./spec/fixtures/rooms-cache");

describe("a chamber in the mockup and the linters (Task 62)", () => {
  it("worldAt shows the chamber open, and a probe player inside it perceives the station's clue", () => {
    for (const room of fixtures()) {
      const cache = cacheOf(room.objects.find((o) => o.id === "Q1") as never) as CacheSpec;
      const [x, y] = [cache.chamber.rect[0], cache.chamber.rect[1]];
      const w = worldAt(room, x, y, "stethoscope");
      const d = secretDoors(room)[0] as ReturnType<typeof secretDoors>[number];
      expect(w.doorOpen[d.chamber.id], room.id).toBe(true);
      expect(w.doorOpen[d.vault.id], room.id).toBe(true);
      const view = viewFor(w, 1, "deaf", false);
      expect(
        view.entities.some((e) => e.id === "Q1"),
        room.id,
      ).toBe(true);
    }
  });

  it("the existing clue lint still passes on both fixtures", () => {
    for (const room of fixtures()) expect(lintRoom(room), room.id).toEqual([]);
  });
});

describe("bots never enter a chamber (Task 62)", () => {
  it("no bot position ever lies inside the chamber rect, in either fixture, over every rotation", () => {
    for (const room of fixtures()) {
      const cache = cacheOf(room.objects.find((o) => o.id === "Q1") as never) as CacheSpec;
      for (const rotation of [0, 1, 2]) {
        const roles = rolesFor(rotation);
        const world = createWorld(room);
        const bots: Partial<Record<Seat, BotSeat>> = {};
        const cooldowns = { until: {} };
        for (const seat of [0, 1, 2] as const) {
          bots[seat] = { memory: createBotMemory(seat, new Set(), roles), inbox: [] };
        }
        let inside = 0;
        for (let t = 0; t < 4000 && world.status !== "cleared"; t++) {
          const full = world.tick === 0 ? new Set<Seat>([0, 1, 2]) : new Set<Seat>();
          const turn = botsAct(
            room,
            world,
            roles,
            bots,
            cooldowns,
            world.tick * TICK_MS,
            (s) => `Bot ${s}`,
            full,
          );
          step(world, turn.inputs, TICK_MS);
          for (const p of world.players) {
            if (inRect(cache.chamber.rect, { x: Math.floor(p.pos.x), y: Math.floor(p.pos.y) }))
              inside++;
          }
        }
        expect(world.status, `${room.id} rotation ${rotation}`).toBe("cleared");
        expect(inside, `${room.id} rotation ${rotation}: ticks a bot stood in the chamber`).toBe(0);
      }
    }
  }, 120_000);
});

// Task 63: the chamber in the sim. Owner is seat 2 (owner: 2 below), the dial Q1's anchor is (7,2),
// its pads (6,2) and (8,2), the moon tile (10,1), a laser along row 3 for a send-back.
describe("the chamber in the sim (Task 63)", () => {
  const BASE = [
    "##############",
    "#1............#",
    "#2.....Q......#",
    "#3.....L......#",
    "##############",
  ].map((r) => r.padEnd(14, "#").slice(0, 14));
  const { grid: GRID, chamber: CHAMBER } = withChamber(BASE, 2);
  const MOON = { x: 10, y: 1 };
  const STAR = { x: 12, y: 1 };
  const ANCHOR = { x: 7, y: 2 };
  const PAD_UP = { x: 8, y: 2 };
  const ITEM = { x: CHAMBER.vault.item[0], y: CHAMBER.vault.item[1] };
  const DOOR = { x: CHAMBER.door[0], y: CHAMBER.door[1] };
  const OWNER = 1 as Seat; // owner: 2
  const make = (extra: Record<string, unknown> = {}, checkpointAt?: { x: number; y: number }) =>
    worldWith(checkpointAt ? withFlag(GRID, checkpointAt) : GRID, {
      Q1: {
        type: "dial",
        pads: [
          [6, 2],
          [8, 2],
        ],
        digits: 2,
        range: 10,
        cache: {
          owner: 2,
          motif: "moon",
          riddle: "r",
          item: "watch",
          tiles: [
            { at: [10, 1], motif: "moon" },
            { at: [12, 1], motif: "star" },
          ],
          chamber: CHAMBER,
        },
      },
      L1: { dir: "right", onS: 2, offS: 2, offsetS: 0 },
      ...extra,
    });
  const withFlag = (g: string[], t: { x: number; y: number }) =>
    g.map((r, y) => (y === t.y ? r.slice(0, t.x) + "K" + r.slice(t.x + 1) : r));
  const st = (w: World) => w.stations.Q1 as NonNullable<World["stations"][string]>;
  const door = (w: World) => secretDoors(w.room)[0] as ReturnType<typeof secretDoors>[number];
  const doors = (w: World) => [w.doorOpen[door(w).chamber.id], w.doorOpen[door(w).vault.id]];
  const kinds = (events: World["events"]) => events.filter((e) => e.kind === "cache");
  const press = (w: World, tile: { x: number; y: number }, seat: Seat = 0) => {
    place(w, seat, tile);
    step(w, { [seat]: input(0, 0, true) });
    const events = [...w.events];
    step(w, { [seat]: input(0, 0, false) });
    return [...events, ...w.events];
  };
  const solve = (w: World, seat: Seat = 2) => {
    press(w, MOON, seat);
    st(w).answer = [3, 4];
    st(w).input = [3, 4];
    return press(w, ANCHOR, seat);
  };
  const centreOf = (t: { x: number; y: number }) => ({ x: t.x + 0.5, y: t.y + 0.5 });

  it("(a) the right motif tile opens the chamber door that tick, with no door event; a decoy does nothing", () => {
    const w = make();
    // closed: a body walking into the door tile is blocked
    place(w, 0, { x: DOOR.x, y: DOOR.y - 1 });
    for (let i = 0; i < 20; i++) step(w, { 0: input(0, 1) });
    expect(Math.floor(w.players[0].pos.y)).toBeLessThan(DOOR.y);
    expect(kinds(press(w, STAR))).toEqual([]);
    expect(doors(w)).toEqual([false, false]);
    const events = press(w, MOON, 1);
    expect(kinds(events)).toEqual([
      { kind: "cache", id: "Q1", result: "uncover", seat: 1, at: centreOf(DOOR) },
    ]);
    expect(events.some((e) => e.kind === "door")).toBe(false);
    expect(doors(w)).toEqual([true, false]);
    // open: any seat walks in
    place(w, 0, { x: DOOR.x, y: DOOR.y - 1 });
    for (let i = 0; i < 30; i++) step(w, { 0: input(0, 1) });
    expect(Math.floor(w.players[0].pos.y)).toBeGreaterThan(DOOR.y);
  });

  it("(b) a wrong answer re-draws only the cache: no dye, no send-back", () => {
    const w = make();
    press(w, MOON);
    st(w).answer = [3, 4];
    st(w).input = [0];
    const events = press(w, ANCHOR);
    expect(events.some((e) => e.kind === "station" && e.result === "wrong")).toBe(true);
    expect(events.some((e) => e.kind === "caught")).toBe(false);
    expect(w.dyedUntil).toBe(0);
    expect(doors(w)).toEqual([true, false]);
  });

  it("(c) a right answer opens the vault door at the vault door, and gives no loot", () => {
    const w = make();
    const events = solve(w);
    const vault = door(w).vault.tiles[0] as { x: number; y: number };
    expect(kinds(events).filter((e) => e.kind === "cache" && e.result === "solved")).toEqual([
      { kind: "cache", id: "Q1", result: "solved", seat: 2, at: centreOf(vault) },
    ]);
    expect(doors(w)).toEqual([true, true]);
    expect(w.loot).toBe(0);
    expect(w.lootTotal).toBe(1);
    expect(w.cacheTaken).toEqual({});
  });

  it("(d) only the owner takes the item, once, after the solve, for 1 loot", () => {
    const w = make();
    expect(kinds(press(w, ITEM, OWNER))).toEqual([]); // before the solve
    solve(w);
    expect(kinds(press(w, ITEM, 0))).toEqual([]); // a non-owner
    expect(kinds(press(w, ITEM, 2))).toEqual([]);
    expect(w.cacheTaken).toEqual({});
    expect(w.loot).toBe(0);
    // a non-owner's Act at the item falls through to the ordinary Act (hold hands): let go and park
    releaseAll(w);
    place(w, 0, { x: 1, y: 1 });
    place(w, 2, { x: 1, y: 3 });
    const events = press(w, ITEM, OWNER);
    expect(kinds(events)).toEqual([
      { kind: "cache", id: "Q1", result: "taken", seat: OWNER, at: centreOf(ITEM) },
    ]);
    expect(w.cacheTaken).toEqual({ Q1: OWNER });
    expect(w.loot).toBe(1);
    expect(kinds(press(w, ITEM, OWNER))).toEqual([]); // a second Act does nothing
    expect(w.loot).toBe(1);
  });

  it("(e) the owner carrying gear takes it and carries the same gear afterwards", () => {
    const w = make({ g1: { item: "stethoscope" } });
    w.gear.push({ id: "mine", item: "goggles", at: null, heldBy: OWNER, sill: null });
    const before = JSON.stringify(w.gear);
    solve(w);
    press(w, ITEM, OWNER);
    expect(w.cacheTaken).toEqual({ Q1: OWNER });
    expect(JSON.stringify(w.gear)).toBe(before);
  });

  it("(f) a send-back before the uncover shuts both doors and takes everything back; one after the take keeps it", () => {
    const w = make();
    solve(w);
    press(w, ITEM, OWNER);
    expect(w.loot).toBe(1);
    place(w, 0, { x: 10, y: 3 }); // into the laser's beam
    step(w, {}, 50);
    expect(w.events.some((e) => e.kind === "caught")).toBe(true);
    expect(doors(w)).toEqual([false, false]);
    expect(w.cacheUncovered).toEqual([]);
    expect(w.cacheBy).toEqual({});
    expect(w.cacheTaken).toEqual({});
    expect(w.loot).toBe(0);
    expect(st(w).solved).toBe(false);
    expect(st(w).answer).not.toEqual([3, 4]);
  });

  it("(f) a send-back to a checkpoint taken after the take leaves it taken and the loot kept", () => {
    const w = make({}, { x: 3, y: 1 });
    solve(w);
    press(w, ITEM, OWNER);
    for (const seat of [0, 1, 2] as const) place(w, seat, { x: 3, y: 1 });
    step(w, {}, 50);
    expect(w.checkpoint).toBe(1);
    place(w, 0, { x: 10, y: 3 });
    step(w, {}, 50);
    expect(w.events.some((e) => e.kind === "caught")).toBe(true);
    expect(w.cacheTaken).toEqual({ Q1: OWNER });
    expect(w.loot).toBe(1);
    expect(doors(w)).toEqual([true, true]);
  });

  it("(g) a checkpoint beside the secret door snapshots only main-room spots", () => {
    // The flag K stands alone against the secret door and the spawns are far away, so the nearest
    // floor to the flag is the chamber itself: only the rule keeps anyone out of it.
    const wall = "########";
    const base = [wall, "#123...#", wall, wall, wall, wall, wall, wall, "####K###", wall];
    const built = withChamber(base, 4);
    // the station's anchor stands in the chamber (row 10, x = 5): without a `Q` tile there is no cache
    built.grid[10] = `${(built.grid[10] as string).slice(0, 5)}Q${(built.grid[10] as string).slice(6)}`;
    const w = worldWith(built.grid, {
      Q1: {
        type: "dial",
        pads: [
          [5, 1],
          [6, 1],
        ],
        digits: 2,
        range: 10,
        cache: {
          owner: 2,
          motif: "moon",
          riddle: "r",
          item: "watch",
          tiles: [{ at: [4, 1], motif: "moon" }],
          chamber: built.chamber,
        },
      },
    });
    for (const seat of [0, 1, 2] as const) place(w, seat, { x: 4, y: 8 });
    step(w, {}, 50);
    expect(w.checkpoint).toBe(1);
    const rect = built.chamber.rect as [number, number, number, number];
    expect(w.snapshot.players).toHaveLength(3);
    for (const p of w.snapshot.players) {
      expect(inRect(rect, { x: Math.floor(p.x), y: Math.floor(p.y) }), JSON.stringify(p)).toBe(
        false,
      );
    }
  });

  it("(h) lootTotal is unchanged, and a room cleared with the item left has loot = lootTotal - 1", () => {
    const w = make();
    expect(w.lootTotal).toBe(1);
    solve(w);
    expect(w.lootTotal).toBe(1);
    expect(w.loot).toBe(w.lootTotal - 1);
  });
});
