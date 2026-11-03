import { describe, expect, it } from "vitest";
import { solveRoom } from "../src/game/bots/solve.ts";
import { viewFor } from "../src/game/perception.ts";
import { type CacheSpec, cacheOf, secretDoors } from "../src/game/rooms/format.ts";
import { loadRooms } from "../src/game/rooms/load.ts";
import { cacheResultOf } from "../src/game/sim/credits.ts";
import { tilesOf, toggled } from "../src/game/sim/stations.ts";
import { step } from "../src/game/sim/step.ts";
import { input, place } from "../src/game/sim/testing.ts";
import { createWorld, type StationState, TICK_MS, type World } from "../src/game/sim/world.ts";
import type { Seat, Vec } from "../src/game/types.ts";

// The cache of each real room, played headless the way a crew would: the right motif tile uncovers
// the chamber (a decoy does nothing), the station is worked to its true answer, a non-owner cannot
// take the item, the owner can (+1 loot), and a send-back undoes it all. Bots ignore all of this
// (spec/rooms.test.ts clears every room without opening a chamber), so this is where the real room
// files' caches are shown to work end to end.
const ROOMS = loadRooms("./rooms");
const CACHE_ROOMS: [id: string, station: string][] = [
  ["04-the-safe", "Q3"],
  ["05-the-gallery", "Q4"],
  ["06-lights-out", "Q5"],
  ["07-night-shift", "Q7"],
  ["08-music-room", "Q4"],
  ["09-the-vault", "Q8"],
];
const tile = (a: number[]) => ({ x: a[0] as number, y: a[1] as number });

function act(world: World, seat: Seat, at: Vec): void {
  place(world, seat, at);
  step(world, { [seat]: input(0, 0, true) }, TICK_MS);
  step(world, { [seat]: input(0, 0, false) }, TICK_MS);
}

// Works the station to its true answer with the presses a person would make.
function solveIt(world: World, id: string, seat: Seat): void {
  const o = world.room.objects.find((x) => x.id === id);
  if (!o) throw new Error(`no ${id}`);
  const s = world.stations[id] as StationState;
  const p = o.params ?? {};
  if (s.type === "keypad") {
    const keys = tilesOf(p.keys);
    for (const k of s.answer) act(world, seat, keys[k] as Vec);
  } else if (s.type === "switches") {
    const buttons = tilesOf(p.buttons);
    const cols = Number(p.cols ?? 3);
    // press each button the answer needs once, in order of index (a toggle is its own inverse)
    let lamps = s.input.slice();
    for (let i = 0; i < buttons.length; i++) {
      const next = toggled(lamps, i, cols);
      const gain = next.filter((v, j) => v === s.answer[j]).length;
      const have = lamps.filter((v, j) => v === s.answer[j]).length;
      if (gain > have || lamps.join() !== s.answer.join()) {
        act(world, seat, buttons[i] as Vec);
        lamps = next;
      }
    }
  } else if (s.type === "dial") {
    const [down, up] = tilesOf(p.pads) as [Vec, Vec];
    const anchor = o.tiles[0] as Vec;
    const range = Number(p.range ?? 10);
    for (const digit of s.answer) {
      const have = s.input.at(-1) ?? 0;
      const turns = (digit - have + range) % range;
      for (let i = 0; i < turns; i++) act(world, seat, up);
      void down;
      act(world, seat, anchor);
    }
  } else if (s.type === "wires") {
    // the cut wire is the first answer entry (the rest describe the colours)
    act(world, seat, tilesOf(p.wires)[s.answer[0] as number] as Vec);
  } else if (s.type === "bells") {
    const bells = tilesOf(p.bells);
    for (const b of s.answer) act(world, seat, bells[b] as Vec);
  } else throw new Error(`no scripted solve for ${s.type}`);
}

describe.each(CACHE_ROOMS)("%s: its cache, opened, solved and taken by script", (roomId, id) => {
  const room = ROOMS.find((r) => r.id === roomId);
  if (!room) throw new Error(`no room ${roomId}`);
  const o = room.objects.find((x) => x.id === id);
  const cache = cacheOf(o as never) as CacheSpec;
  const owner = (cache.owner - 1) as Seat;
  const other = ((owner + 1) % 3) as Seat;
  const right = (cache.tiles.find((t) => t.motif === cache.motif) as CacheSpec["tiles"][number]).at;
  const decoy = (cache.tiles.find((t) => t.motif !== cache.motif) as CacheSpec["tiles"][number]).at;
  const vault = secretDoors(room).find((d) => d.id === id);
  const fresh = () => createWorld(room);

  it("has a chamber hanging below the room, and a decoy tile that opens nothing", () => {
    expect(cache.chamber.door.y, "the chamber hangs below the room").toBeGreaterThan(
      Math.max(
        ...room.objects.filter((x) => x.kind === "exit").flatMap((x) => x.tiles.map((t) => t.y)),
      ),
    );
    const w = fresh();
    act(w, other, decoy);
    expect(w.cacheUncovered).toEqual([]);
    expect(w.doorOpen[vault?.chamber.id as string]).toBeFalsy();
  });

  it("opens the chamber on the right tile, the vault on a right answer, and counts nothing yet", () => {
    const w = fresh();
    const loot = w.loot;
    act(w, other, right);
    expect(w.cacheUncovered).toEqual([id]);
    expect(w.doorOpen[vault?.chamber.id as string]).toBe(true);
    expect(w.doorOpen[vault?.vault.id as string]).toBeFalsy();
    solveIt(w, id, other);
    expect(w.cacheBy[id]).toBe(other);
    expect(w.doorOpen[vault?.vault.id as string]).toBe(true);
    expect(w.loot).toBe(loot);
  });

  it("lets only the owner take the item: +1 loot, and the view says who", () => {
    const w = fresh();
    act(w, other, right);
    solveIt(w, id, other);
    const before = w.loot;
    act(w, other, cache.chamber.vault.item);
    expect(w.cacheTaken[id]).toBeUndefined();
    expect(w.loot).toBe(before);
    place(w, owner, cache.chamber.vault.item);
    step(w, { [owner]: input(0, 0, true) }, TICK_MS);
    expect(w.cacheTaken[id]).toBe(owner);
    expect(w.loot).toBe(before + 1);
    const roles = ["blind", "deaf", "mute"] as const;
    expect(viewFor(w, owner, roles[owner], false).keepsake).toBe(cache.item);
  });

  it("is undone by a send-back to a checkpoint from before it was taken", () => {
    const w = fresh();
    act(w, other, right);
    solveIt(w, id, other);
    place(w, owner, cache.chamber.vault.item);
    step(w, { [owner]: input(0, 0, true) }, TICK_MS);
    expect(w.cacheTaken[id]).toBe(owner);
    // a wrong answer on an ordinary (non-teaching) station sends the team back to the spawns
    const plain = room.objects.find(
      (x) =>
        x.kind === "station" &&
        !cacheOf(x) &&
        x.params?.teach !== true &&
        x.params?.type !== "radio",
    ) as NonNullable<typeof o>;
    const s = w.stations[plain.id] as StationState;
    const p = plain.params ?? {};
    if (s.type === "wires") {
      s.answer[0] = 0; // the wire to cut is wire 0, so cutting wire 1 is wrong
      act(w, other, tilesOf(p.wires)[1] as Vec);
    } else if (s.type === "keypad") {
      s.answer = s.answer.map(() => 0);
      act(w, other, tilesOf(p.keys)[1] as Vec);
    } else if (s.type === "dial") {
      s.answer = s.answer.map(() => 3);
      s.input = [5];
      act(w, other, plain.tiles[0] as Vec);
    } else throw new Error(`no scripted wrong answer for ${s.type}`);
    expect(w.attempt).toBeGreaterThan(0);
    expect(w.cacheUncovered).toEqual([]);
    expect(w.cacheBy).toEqual({});
    expect(w.cacheTaken).toEqual({});
    expect(w.doorOpen[vault?.chamber.id as string]).toBeFalsy();
    expect(w.doorOpen[vault?.vault.id as string]).toBeFalsy();
  });
});

describe("04-the-safe: the dial's inspection plate", () => {
  const room = ROOMS.find((r) => r.id === "04-the-safe");
  if (!room) throw new Error("no room 4");
  const o = room.objects.find((x) => x.id === "Q3");
  const back = tile(o?.params?.back as number[]);

  it("sounds hollow underfoot to a hearing teammate and to the walker, and a stethoscope holder hears the tumbler", () => {
    const w = createWorld(room);
    const cache = cacheOf(o as never) as CacheSpec;
    w.cacheUncovered.push("Q3");
    place(w, 0, { x: back.x - 2, y: back.y }); // Can't see, in earshot
    place(w, 2, back);
    w.players[2].moving = true;
    const heard = viewFor(w, 0, "blind", false).sounds.map((s) => s.kind);
    expect(heard).toContain("hollow");
    expect(heard).not.toContain("footsteps");
    w.players[0].pos = { x: back.x + 0.5, y: back.y + 0.5 };
    w.players[0].moving = true;
    expect(viewFor(w, 0, "blind", false).sounds.map((s) => s.kind)).toContain("hollow");
    expect(cache.chamber.rect[1] <= back.y && back.y <= cache.chamber.rect[3]).toBe(true);
  });
});

describe("the whole heist with bots that ignore every cache (Task 59)", () => {
  it("clears all nine rooms, and the six caches come out in room order, unopened and untaken", () => {
    const results = ROOMS.map((room) => {
      const cleared = solveRoom(room, ["blind", "deaf", "mute"], 600);
      expect(cleared.cleared, `${room.id} cleared`).toBe(true);
      return { room: room.id, cache: cacheResultOf(cleared.world) };
    });
    const withCache = results.filter((r) => r.cache);
    expect(withCache.map((r) => r.room)).toEqual([
      "04-the-safe",
      "05-the-gallery",
      "06-lights-out",
      "07-night-shift",
      "08-music-room",
      "09-the-vault",
    ]);
    for (const { cache } of withCache) expect(cache).toMatchObject({ opened: false, found: false });
    // rooms 1 to 3 have none
    expect(results.slice(0, 3).map((r) => r.cache)).toEqual([undefined, undefined, undefined]);
  }, 120_000);
});

// Object ids are numbered in reading order, so a letter added above an existing one of its kind
// silently renumbers it, and pnpm lint:rooms stays green (every clue is still a valid clue). These
// are the pairings that matter: which clue, card or ink each station reads, by where that thing
// stands, for the rooms whose chambers added a clue, a card or an ink. A later edit that reshuffles
// them fails here.
describe("what each station reads, by where it stands", () => {
  const read = (roomId: string, stationId: string, key: "clue" | "plaque" | "of") => {
    const room = ROOMS.find((r) => r.id === roomId);
    if (!room) throw new Error(`no room ${roomId}`);
    const o =
      key === "of"
        ? room.objects.find((x) => x.kind === "card" && x.params?.of === stationId)
        : room.objects.find(
            (x) => x.id === room.objects.find((s) => s.id === stationId)?.params?.[key],
          );
    const t = o?.tiles[0];
    return t ? `(${t.x},${t.y})` : "nothing";
  };

  it("room 5: the real keypad hears the vent at (17,7), the cache keypad the one at (2,7)", () => {
    expect(read("05-the-gallery", "Q3", "clue")).toBe("(17,7)");
    expect(read("05-the-gallery", "Q4", "clue")).toBe("(2,7)");
  });

  it("room 6: the real switches read the card at (2,8), the cache switches the one at (36,0)", () => {
    expect(read("06-lights-out", "Q2", "of")).toBe("(2,8)");
    expect(read("06-lights-out", "Q5", "of")).toBe("(36,0)");
  });

  it("room 7: each wire panel reads the ink at its own place, the cache's behind the switches door", () => {
    expect(read("07-night-shift", "Q1", "plaque")).toBe("(2,7)");
    expect(read("07-night-shift", "Q3", "plaque")).toBe("(25,7)");
    expect(read("07-night-shift", "Q7", "plaque")).toBe("(34,2)");
  });
});
