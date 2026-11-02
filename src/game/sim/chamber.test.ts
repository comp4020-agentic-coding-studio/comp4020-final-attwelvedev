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
import { step } from "./step.ts";
import { worldWith } from "./testing.ts";
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
