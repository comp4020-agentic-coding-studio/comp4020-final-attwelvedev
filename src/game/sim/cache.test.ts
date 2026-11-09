import { describe, expect, it } from "vitest";
import { cueCaptions } from "../../client/hud.ts";
import { spectatorView, viewFor } from "../perception.ts";
import { secretDoors } from "../rooms/format.ts";
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
const DOOR_AT = { x: CHAMBER.door[0] + 0.5, y: CHAMBER.door[1] + 0.5 };
const VAULT_DOOR_AT = { x: CHAMBER.vault.door[0] + 0.5, y: CHAMBER.vault.door[1] + 0.5 };
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
      { kind: "cache", id: "Q1", result: "uncover", seat: 1, at: DOOR_AT },
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

  it("is solved by a right answer: the solver's seat, and no loot until the item is taken", () => {
    const w = world();
    press(w, MOON);
    rig(w);
    const events = press(w, ANCHOR, 2);
    expect(cacheEvents(events)).toEqual([
      { kind: "cache", id: "Q1", result: "solved", seat: 2, at: VAULT_DOOR_AT },
    ]);
    expect(st(w).solved).toBe(true);
    expect(w.cacheBy).toEqual({ Q1: 2 });
    expect(w.loot).toBe(0);
    expect(w.lootTotal).toBe(1);
  });

  it("is closed again by a send-back to a checkpoint taken before it was solved", () => {
    const w = world();
    press(w, MOON);
    rig(w);
    press(w, ANCHOR);
    expect(w.cacheBy).toEqual({ Q1: 0 });
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
    expect(view(w, 1).cache).toMatchObject({ state: "vault", by: 2 });
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
        "Bo's side job open: the gold watch",
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
      "Bo's side job open: the gold watch",
    );
    expect(cueCaptions(view(w, 0).sounds, names).map((c) => c.text)).not.toContain(
      "Something opened Bo",
    );
  });
});

// Task 64: the chamber in the views. Owner is seat 1 (owner: 2). The chamber rect is [2,5,5,5]: floor at
// (2,5) and (3,5), the vault door at (4,5), the vault (the keepsake's tile) at (5,5), the secret door at (2,4).
describe("the chamber in the views (Task 64)", () => {
  const ROLES = ["blind", "deaf", "mute"] as const;
  const OWNER = 1 as Seat;
  const rect = CHAMBER.rect;
  const cell = (x: number, y: number) => ({ x, y });
  const DOOR = cell(CHAMBER.door[0], CHAMBER.door[1]);
  const VDOOR = cell(CHAMBER.vault.door[0], CHAMBER.vault.door[1]);
  const ITEM = cell(CHAMBER.vault.item[0], CHAMBER.vault.item[1]);
  const mid = (t: Vec) => ({ x: t.x + 0.5, y: t.y + 0.5 });
  const doorIds = (w: World) => {
    const d = secretDoors(w.room)[0] as ReturnType<typeof secretDoors>[number];
    return { chamber: d.chamber.id, vault: d.vault.id };
  };
  const tilesFor = (w: World, seat: Seat) => viewFor(w, seat, ROLES[seat], true).tiles as string[];
  const at = (rows: string[], t: Vec) => rows[t.y]?.[t.x];
  const watcher = (w: World, follow: Seat) =>
    spectatorView(w, follow, [...ROLES], true).tiles as string[];
  const solveIt = (w: World) => {
    press(w, MOON, 1);
    rig(w);
    press(w, ANCHOR, 2);
  };
  const entityIds = (w: World, follow: Seat) =>
    spectatorView(w, follow, [...ROLES], false).entities;

  it("(a) the chamber, the vault and both doors read # on the sighted map until each opens", () => {
    const w = world();
    const real = w.room.grid; // what the room really holds, masked or not
    for (const rows of [tilesFor(w, 1), tilesFor(w, 2), watcher(w, 1), watcher(w, 2)]) {
      for (const t of [DOOR, cell(2, 5), cell(3, 5), VDOOR, ITEM]) expect(at(rows, t)).toBe("#");
      expect(rows[3]).toBe(real[3]); // the rest of the room is not touched
    }
    expect(at(real, DOOR)).toBe("D"); // the masked tiles are not walls in the sim
    expect(at(real, cell(2, 5))).toBe(".");
    press(w, MOON, 1); // the chamber opens
    for (const rows of [tilesFor(w, 1), tilesFor(w, 2), watcher(w, 1)]) {
      expect(at(rows, DOOR)).toBe("D");
      expect(at(rows, cell(2, 5))).toBe(".");
      expect(at(rows, cell(3, 5))).toBe(".");
      expect(at(rows, VDOOR)).toBe("#"); // the vault is still closed
      expect(at(rows, ITEM)).toBe("#");
    }
    rig(w);
    press(w, ANCHOR, 2); // the vault opens
    for (const rows of [tilesFor(w, 1), tilesFor(w, 2), watcher(w, 1)]) {
      expect(rows.join("\n")).toBe(real.join("\n"));
    }
  });

  it("(a) Can't see gets no tiles at all, as before", () => {
    expect(viewFor(world(), 0, "blind", true).tiles).toBeUndefined();
  });

  it("(b2) an open secret door is marked secret in the entity list, an ordinary door is not", () => {
    const w = world();
    press(w, MOON, 1);
    const doors = entityIds(w, 1).filter((e) => e.kind === "door");
    expect(doors.length).toBeGreaterThan(0);
    for (const d of doors) expect(d.secret).toBe(true);
  });

  it("(b) no entity list holds a secret door while it is closed", () => {
    const w = world();
    const ids = doorIds(w);
    const seen = (follow: Seat) => entityIds(w, follow).filter((e) => e.kind === "door");
    for (const follow of [1, 2] as const) expect(seen(follow).map((e) => e.id)).toEqual([]);
    press(w, MOON, 1);
    for (const follow of [1, 2] as const) {
      expect(seen(follow).map((e) => [e.id, e.state])).toEqual([[ids.chamber, "open"]]);
    }
    rig(w);
    press(w, ANCHOR, 2);
    expect(
      seen(1)
        .map((e) => [e.id, e.state])
        .sort(),
    ).toEqual(
      [
        [ids.chamber, "open"],
        [ids.vault, "open"],
      ].sort(),
    );
  });

  it("(c) the keepsake stands for the sighted from the solve until the take, never for Can't see", () => {
    const w = world();
    const keep = (follow: Seat) => entityIds(w, follow).filter((e) => e.kind === "keepsake");
    expect(keep(1)).toEqual([]);
    solveIt(w);
    for (const follow of [1, 2] as const) {
      expect(keep(follow)).toEqual([expect.objectContaining({ pos: mid(ITEM), keep: "watch" })]);
    }
    expect(keep(0)).toEqual([]);
    place(w, 1, { x: 3, y: 5 }); // inside the chamber, the vault door open: in sight
    expect(viewFor(w, 1, "deaf", false).entities.filter((e) => e.kind === "keepsake")).toHaveLength(
      1,
    );
    place(w, 0, ITEM);
    expect(viewFor(w, 0, "blind", false).entities).toEqual([]);
    press(w, ITEM, OWNER);
    expect(keep(1)).toEqual([]);
  });

  it("(d) cacheEvent is in the tick of the event for every role, and gone the next", () => {
    const w = world();
    const events = (kind?: string) =>
      ([0, 1, 2] as const).map((s) => view(w, s).cacheEvent).filter((e) => !kind || e);
    act(w, MOON, 1);
    for (const e of events()) {
      expect(e).toEqual({ result: "uncover", at: mid(DOOR), owner: OWNER });
      expect(e && "item" in e).toBe(false);
    }
    step(w, { 1: input(0, 0, false) });
    for (const e of events()) expect(e).toBeUndefined();
    rig(w);
    act(w, ANCHOR, 2);
    for (const e of events()) {
      expect(e).toEqual({ result: "solved", at: mid(VDOOR), owner: OWNER, item: "watch" });
    }
    step(w, { 2: input(0, 0, false) });
    act(w, ITEM, OWNER);
    for (const e of events()) {
      expect(e).toEqual({ result: "taken", at: mid(ITEM), owner: OWNER, item: "watch" });
    }
    step(w, { 1: input(0, 0, false) });
    for (const e of events()) expect(e).toBeUndefined();
  });

  it("(e) the owner's cache state walks hidden, open, vault, taken; nobody else has one", () => {
    const w = world();
    const state = () => view(w, OWNER).cache?.state;
    expect(state()).toBe("hidden");
    press(w, MOON, 1);
    expect(state()).toBe("open");
    rig(w);
    press(w, ANCHOR, 2);
    expect(state()).toBe("vault");
    expect(view(w, OWNER).cache?.by).toBe(2);
    press(w, ITEM, OWNER);
    expect(state()).toBe("taken");
    for (const seat of [0, 2] as const) {
      expect(view(w, seat).cache).toBeUndefined();
      expect(view(w, seat).keepsake).toBeUndefined();
    }
  });

  it("(e) before the solve no other seat's view carries the riddle or the item's name", () => {
    const w = world();
    press(w, MOON, 1);
    for (const seat of [0, 2] as const) {
      const json = JSON.stringify(viewFor(w, seat, ROLES[seat], true));
      expect(json).not.toContain("listen twice");
      expect(json).not.toContain("watch");
    }
    expect(JSON.stringify(spectatorView(w, 0, [...ROLES], true))).not.toContain("watch");
  });

  it("(f) keepsake is the item for the owner after the take, and absent for everyone else", () => {
    const w = world();
    solveIt(w);
    expect(view(w, OWNER).keepsake).toBeUndefined();
    press(w, ITEM, OWNER);
    expect(view(w, OWNER).keepsake).toBe("watch");
    for (const seat of [0, 2] as const) expect(view(w, seat).keepsake).toBeUndefined();
  });

  it("(g) the Act hint on the item: the owner takes it, others are told, none before the solve", () => {
    const w = world();
    place(w, OWNER, ITEM);
    expect(view(w, OWNER).act).toBeUndefined();
    solveIt(w);
    place(w, OWNER, ITEM);
    place(w, 0, ITEM);
    expect(view(w, OWNER).act).toBe("Take the gold watch");
    expect(view(w, 0).act).toBe("Only its owner can take this");
    press(w, ITEM, OWNER);
    place(w, 0, { x: 1, y: 1 }); // a teammate beside you would offer to hold hands instead
    place(w, OWNER, ITEM);
    expect(view(w, OWNER).act).toBeUndefined(); // taken: nothing left to take
  });

  it("(i) a take is a loot cue with its owner and item, for every hearing seat", () => {
    const w = world();
    solveIt(w);
    place(w, 0, { x: 1, y: 1 });
    act(w, ITEM, OWNER);
    for (const seat of [0, 2] as const) {
      const loot = view(w, seat).sounds.filter((s) => s.kind === "loot");
      expect(loot).toHaveLength(1);
      expect(loot[0]).toMatchObject({ n: OWNER, item: "watch" });
    }
    expect(view(w, 1).sounds).toEqual([]);
  });
});

describe("a keypad cache's clue stays silent while the cache is hidden (Task 58)", () => {
  const KEYS = [0, 1, 2].map((x) => [3 + x, 1]);
  const keypadWorld = () => {
    const withClue = BASE.map((r, y) => (y === 2 ? `${r.slice(0, 12)}c${r.slice(13)}` : r));
    const built = withChamber(withClue, 2);
    return worldWith(built.grid, {
      Q1: {
        type: "keypad",
        keys: KEYS,
        length: 3,
        clue: "c1",
        cache: { ...CACHE, chamber: built.chamber },
      },
      c1: {},
    });
  };
  const chimes = (w: World, ticks: number) => {
    let n = 0;
    for (let i = 0; i < ticks; i++) {
      step(w, {});
      n += w.events.filter((e) => e.kind === "clue").length;
    }
    return n;
  };

  it("makes no chime until the chamber is opened, then plays the keypad's code", () => {
    const w = keypadWorld();
    expect(chimes(w, 200)).toBe(0);
    w.cacheUncovered.push("Q1");
    expect(chimes(w, 200)).toBeGreaterThan(0);
  });
});
