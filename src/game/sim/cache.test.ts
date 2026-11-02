import { describe, expect, it } from "vitest";
import { cueCaptions } from "../../client/hud.ts";
import { spectatorView, viewFor } from "../perception.ts";
import type { Seat, Vec } from "../types.ts";
import { step } from "./step.ts";
import { input, place, withChamber, worldWith } from "./testing.ts";
import type { StationState, World, WorldEvent } from "./world.ts";

// Seat `seat` walks onto `tile` and presses Act for one tick, then lets go for one (Act is an edge).
function press(world: World, tile: Vec, seat: Seat = 0): WorldEvent[] {
  place(world, seat, tile);
  step(world, { [seat]: input(0, 0, true) });
  const events = [...world.events];
  step(world, { [seat]: input(0, 0, false) });
  return [...events, ...world.events];
}

// Q1 (a dial: pads (6,2) and (8,2), anchor (7,2)) is a cache. The moon tile is (10,1), the star
// decoy (12,1). A laser at (7,3) fires right along row 3 from tick 0, for a send-back.
const BASE = [
  "##############",
  "#1............#",
  "#2.....Q......#",
  "#3.....L......#",
  "##############",
].map((r) => r.padEnd(14, "#").slice(0, 14));
const { grid: GRID, chamber: CHAMBER } = withChamber(BASE, 2);
const CACHE = {
  chamber: CHAMBER,
  owner: 2,
  motif: "moon",
  riddle: "Where the moon watches, listen twice.",
  item: "watch",
  tiles: [
    { at: [10, 1], motif: "moon" },
    { at: [12, 1], motif: "star" },
  ],
};
const OBJECTS = {
  Q1: {
    type: "dial",
    pads: [
      [6, 2],
      [8, 2],
    ],
    digits: 2,
    range: 10,
    cache: CACHE,
  },
  L1: { dir: "right", onS: 2, offS: 2, offsetS: 0 },
};
const MOON = { x: 10, y: 1 };
const STAR = { x: 12, y: 1 };
const ANCHOR = { x: 7, y: 2 };
const PAD_UP = { x: 8, y: 2 };

const world = () => worldWith(GRID, OBJECTS);
const st = (w: World): StationState => w.stations.Q1 as StationState;
const cacheEvents = (events: WorldEvent[]) => events.filter((e) => e.kind === "cache");
// A right answer is in: the dial sits on the last digit of [3, 4] and Act confirms it.
const rig = (w: World) => {
  st(w).answer = [3, 4];
  st(w).input = [3, 4];
};

describe("a cache", () => {
  it("counts one loot toward the room's total", () => {
    expect(world().lootTotal).toBe(1);
  });

  it("does nothing under Act until it is uncovered", () => {
    const w = world();
    const events = press(w, PAD_UP);
    expect(events.filter((e) => e.kind === "station")).toEqual([]);
    expect(cacheEvents(events)).toEqual([]);
    expect(st(w).input).toEqual([0]);
  });

  it("is uncovered once by Act on the matching motif tile, and not by a decoy", () => {
    const w = world();
    expect(cacheEvents(press(w, STAR))).toEqual([]);
    expect(w.cacheUncovered).toEqual([]);
    const events = press(w, MOON, 1);
    expect(cacheEvents(events)).toEqual([
      { kind: "cache", id: "Q1", result: "uncover", seat: 1, at: { x: 10.5, y: 1.5 } },
    ]);
    expect(w.cacheUncovered).toEqual(["Q1"]);
    expect(cacheEvents(press(w, MOON, 1))).toEqual([]); // pressing it again is silent
    expect(w.cacheUncovered).toEqual(["Q1"]);
  });

  it("is worked like any station once uncovered", () => {
    const w = world();
    press(w, MOON);
    const events = press(w, PAD_UP);
    expect(events.some((e) => e.kind === "station" && e.result === "turn")).toBe(true);
    expect(st(w).input).toEqual([1]);
  });

  it("re-draws only itself on a wrong answer: no dye, no send-back", () => {
    const w = world();
    press(w, MOON);
    st(w).answer = [3, 4];
    st(w).input = [0];
    const events = press(w, ANCHOR);
    expect(events.some((e) => e.kind === "station" && e.result === "wrong")).toBe(true);
    expect(events.some((e) => e.kind === "caught")).toBe(false);
    expect(w.attempt).toBe(0);
    expect(w.dyedUntil).toBe(0);
    expect(st(w).answer).not.toEqual([3, 4]);
    expect(st(w).input).toEqual([0]);
  });

  it("is solved by a right answer: the solver's seat, one loot", () => {
    const w = world();
    press(w, MOON);
    rig(w);
    const events = press(w, ANCHOR, 2);
    expect(cacheEvents(events)).toEqual([
      { kind: "cache", id: "Q1", result: "solved", seat: 2, at: { x: 7.5, y: 2.5 } },
    ]);
    expect(st(w).solved).toBe(true);
    expect(w.cacheBy).toEqual({ Q1: 2 });
    expect(w.loot).toBe(1);
    expect(w.lootTotal).toBe(1);
  });

  it("is closed again by a send-back to a checkpoint taken before it was solved", () => {
    const w = world();
    press(w, MOON);
    rig(w);
    press(w, ANCHOR);
    expect(w.loot).toBe(1);
    place(w, 1, { x: 10, y: 3 }); // into the laser's beam: the team goes back to the start
    step(w, {}, 50);
    expect(w.events.some((e) => e.kind === "caught")).toBe(true);
    expect(w.attempt).toBe(1);
    expect(w.cacheUncovered).toEqual([]);
    expect(w.cacheBy).toEqual({});
    expect(w.solvedBy.Q1).toBeUndefined();
    expect(w.loot).toBe(0);
    expect(st(w).solved).toBe(false);
    expect(st(w).input).toEqual([0]);
    expect(st(w).answer).not.toEqual([3, 4]);
  });
});

// One Act edge by `seat` on `tile`: the events of that tick are still on the world for the views.
function act(world: World, tile: Vec, seat: Seat): void {
  place(world, seat, tile);
  step(world, { [seat]: input(0, 0, true) });
}
const ROLE = ["blind", "deaf", "mute"] as const;
const view = (w: World, seat: Seat) => viewFor(w, seat, ROLE[seat], false);
const sees = (w: World, seat: Seat, id: string) => view(w, seat).entities.some((e) => e.id === id);

describe("a cache in the views", () => {
  it("tells its owner's seat the riddle, and nobody else's view carries it", () => {
    const w = world();
    expect(view(w, 1).cache).toEqual({
      id: "Q1",
      motif: "moon",
      riddle: CACHE.riddle,
      item: "watch",
      state: "hidden",
    });
    for (const seat of [0, 2] as const) {
      expect(view(w, seat).cache).toBeUndefined();
      const json = JSON.stringify(view(w, seat));
      expect(json).not.toContain("listen twice");
      expect(json).not.toContain("watch");
    }
    press(w, MOON);
    expect(view(w, 1).cache?.state).toBe("open");
    rig(w);
    press(w, ANCHOR, 2);
    expect(view(w, 1).cache).toMatchObject({ state: "found", by: 2 });
  });

  it("is in no one's view and has no Act hint until it is uncovered; then the sighted see it and Can't see hears it", () => {
    const w = world();
    place(w, 1, { x: 3, y: 2 });
    place(w, 2, PAD_UP);
    place(w, 0, { x: 5, y: 1 });
    expect(sees(w, 1, "Q1")).toBe(false);
    expect(sees(w, 2, "Q1")).toBe(false);
    expect(view(w, 2).act).toBeUndefined(); // standing on a pad: no hint while it is hidden
    act(w, PAD_UP, 2); // an Act on the hidden pad makes no click anyone hears
    expect(view(w, 0).sounds.some((s) => s.kind === "tick")).toBe(false);
    step(w, { 2: input(0, 0, false) });
    press(w, MOON, 1); // seat 1 uncovers it
    place(w, 1, { x: 3, y: 2 });
    place(w, 2, PAD_UP);
    expect(sees(w, 1, "Q1")).toBe(true);
    expect(sees(w, 2, "Q1")).toBe(true);
    expect(view(w, 2).act).toBe("Turn the dial right");
    step(w, { 2: input(0, 0, false) });
    act(w, PAD_UP, 2);
    expect(view(w, 0).sounds.some((s) => s.kind === "tick")).toBe(true);
    expect(sees(w, 0, "Q1")).toBe(false); // Can't see is sent no entities at all
  });

  it("draws every motif tile for the sighted, never for Can't see, decoy and answer alike", () => {
    const w = world();
    place(w, 1, { x: 11, y: 2 });
    place(w, 2, { x: 11, y: 2 });
    for (const seat of [1, 2] as const) {
      const tiles = view(w, seat).entities.filter((e) => e.kind === "motiftile");
      expect(tiles.map((t) => t.motif).sort()).toEqual(["moon", "star"]);
      const [a, b] = tiles;
      const bare = ({ id: _i, pos: _p, motif: _m, ...rest }: (typeof tiles)[number]) => rest;
      expect(Object.keys(a ?? {}).sort()).toEqual(Object.keys(b ?? {}).sort());
      expect(bare(a as never)).toEqual(bare(b as never));
    }
    expect(view(w, 0).entities).toEqual([]);
    // a spectator follows a seat's senses: the tiles are drawn for a sighted seat, not a blind one
    const roles = ["blind", "deaf", "mute"] as const;
    const tilesFor = (follow: Seat) =>
      spectatorView(w, follow, [...roles], false).entities.filter((e) => e.kind === "motiftile");
    expect(tilesFor(0)).toEqual([]);
    expect(tilesFor(1)).toHaveLength(2);
    press(w, MOON, 2); // still drawn once it is open
    expect(view(w, 1).entities.filter((e) => e.kind === "motiftile")).toHaveLength(2);
  });

  it("puts the same cue on every seat in the tick it is uncovered and in the tick it is solved", () => {
    const w = world();
    place(w, 0, { x: 1, y: 1 });
    act(w, MOON, 2);
    for (const seat of [0, 2] as const) {
      expect(view(w, seat).sounds.filter((s) => s.kind === "uncover")).toHaveLength(1);
      expect(cueCaptions(view(w, seat).sounds).map((c) => c.text)).toContain("Something opened");
    }
    expect(view(w, 1).sounds).toEqual([]); // Can't hear sees it instead
    step(w, { 2: input(0, 0, false) });
    rig(w);
    act(w, ANCHOR, 2);
    for (const seat of [0, 2] as const) {
      const stash = view(w, seat).sounds.filter((s) => s.kind === "stash");
      expect(stash).toHaveLength(1);
      expect(cueCaptions(view(w, seat).sounds, ["Ana", "Bo", "Cy"]).map((c) => c.text)).toContain(
        "Bo's side job found: the gold watch",
      );
    }
    expect(view(w, 1).sounds).toEqual([]);
  });

  it("says whose cache it is on both cues, and what was found on the stash cue only", () => {
    const w = world();
    place(w, 0, { x: 1, y: 1 });
    act(w, MOON, 2);
    const open = view(w, 0).sounds.find((s) => s.kind === "uncover");
    expect(open?.n).toBe(1); // CACHE.owner 2 is seat 1
    expect(open?.item).toBeUndefined(); // an opened panel has not shown what it hides
    step(w, { 2: input(0, 0, false) });
    rig(w);
    act(w, ANCHOR, 2);
    const stash = view(w, 0).sounds.find((s) => s.kind === "stash");
    expect(stash?.n).toBe(1);
    expect(stash?.item).toBe("watch");
    const names = ["Ana", "Bo", "Cy"];
    expect(cueCaptions(view(w, 0).sounds, names).map((c) => c.text)).toContain(
      "Bo's side job found: the gold watch",
    );
    expect(cueCaptions(view(w, 0).sounds, names).map((c) => c.text)).not.toContain(
      "Something opened Bo",
    );
  });
});
