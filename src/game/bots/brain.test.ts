import { describe, expect, it } from "vitest";
import type { ChannelMessage } from "../channels.ts";
import { type RoleView, viewFor } from "../perception.ts";
import { type CacheSpec, cacheOf } from "../rooms/format.ts";
import { loadRooms } from "../rooms/load.ts";
import { syncCacheDoors } from "../sim/cache.ts";
import { forceUncover } from "../sim/stations.ts";
import { step } from "../sim/step.ts";
import { roomWith } from "../sim/testing.ts";
import { createWorld, TICK_MS } from "../sim/world.ts";
import type { Role, Seat } from "../types.ts";
import { CACHE_GIVE_UP_TICKS, createBotMemory, think } from "./brain.ts";
import { type BotSeat, botsAct } from "./crew.ts";
import { claimJobs, hintsOf } from "./jobs.ts";
import { solveRoom } from "./solve.ts";

// First Job left the heist in escape-room phase 04, Don't Blink and the old vault in phase 10;
// they stay fixtures for what they test
const rooms = [
  ...loadRooms(),
  ...loadRooms("./spec/fixtures/first-job"),
  ...loadRooms("./spec/fixtures/old-rooms"),
];
const room = (id: string) => rooms.find((r) => r.id === id) ?? (rooms[0] as (typeof rooms)[0]);
const ROLES3: [Role, Role, Role] = ["blind", "deaf", "mute"];

const callout = (c: string, from: Seat = 1): ChannelMessage =>
  ({
    method: "callout",
    callout: c,
    from: { seat: from, role: "deaf", nickname: "Bot" },
    sentAt: 0,
  }) as ChannelMessage;

const blindView = (tick: number, sounds: RoleView["sounds"] = []): RoleView => ({
  tick,
  ack: 0,
  room: "01-first-job",
  role: "blind",
  full: false,
  you: { seat: 0 },
  tiles: undefined,
  entities: [],
  sounds,
  status: "playing",
  elapsedMs: tick * TICK_MS,
  loot: 0,
  alarm: false,
  dark: false,
  gear: null,
});

// Task 40 (ADR 0019): both hand-holders steer, so a bot led by a person must not fight them. A
// Can't-see bot walks the way it was last told until it hears stop; once a person takes its hand and
// leads, that old heading must not become a tug of war against the person's own steering.
describe("a bot led by the hand never fights the person leading it (Task 40)", () => {
  const GRID = [
    "##############",
    "#1...........#",
    "#2...........#",
    "#3...........#",
    "##############",
  ];
  it("a Can't-see bot with an old heading, led by a person walking the other way, is stopped by the pair and starts no tug", () => {
    const world = createWorld(roomWith(GRID, {}), 1);
    const roles: [Role, Role, Role] = ["blind", "deaf", "mute"];
    const humans = new Set<Seat>([1, 2]);
    const bot: BotSeat = { memory: createBotMemory(0, humans, roles), inbox: [] };
    // it was told "left" (west) a moment ago, and has not been told to stop
    bot.inbox.push(callout("left", 1));
    // the person (seat 1) takes the bot's hand and leads it east
    world.players[0].pos = { x: 6.5, y: 2.5 };
    world.players[1].pos = { x: 7.5, y: 2.5 };
    world.holding[0] = 1; // seat 0 is towed by seat 1
    let pulls = 0;
    const x0 = world.players[1].pos.x;
    for (let t = 0; t < 40; t++) {
      const turn = botsAct(
        world.room,
        world,
        roles,
        { 0: bot },
        { until: {} },
        t * TICK_MS,
        (s) => `Bot ${s}`,
      );
      step(world, { ...turn.inputs, 1: { seq: t + 1, move: { x: 1, y: 0 }, act: false } }, TICK_MS);
      pulls += world.events.filter((e) => e.kind === "pull").length;
    }
    expect(world.players[1].pos.x - x0, "the person leads east, at speed").toBeGreaterThan(3);
    expect(pulls, "no tug of war with a bot that was only told west earlier").toBe(0);
  });
});

describe("a sighted bot led by the hand never fights the person leading it (Task 40)", () => {
  // Can't hear is a sighted role: with a job somewhere else it walks to it, and a person who took its
  // hand and leads the other way must not meet a bot that pulls the way its plan says.
  const GRID = [
    "##########################",
    "#1.......................#",
    "#2.......................#",
    "#3.......................#",
    "##########################",
  ];
  it("a bot walking east to a plate, led west by a person, adds nothing to the pair's step", () => {
    const rm = roomWith(GRID, { D1: { opensWhen: ["p1"] } });
    const world = createWorld(rm, 1);
    const roles: [Role, Role, Role] = ["blind", "deaf", "mute"];
    const humans = new Set<Seat>([0, 2]);
    const bot: BotSeat = { memory: createBotMemory(1, humans, roles), inbox: [] };
    // seat 1 (Can't hear, a sighted bot) is led by seat 0, a person, who walks west
    world.players[1].pos = { x: 12.5, y: 2.5 };
    world.players[0].pos = { x: 13.5, y: 2.5 };
    world.holding[1] = 0;
    let pulls = 0;
    const x0 = world.players[0].pos.x;
    for (let t = 0; t < 40; t++) {
      const turn = botsAct(
        world.room,
        world,
        roles,
        { 1: bot },
        { until: {} },
        t * TICK_MS,
        (s) => `Bot ${s}`,
      );
      step(
        world,
        { ...turn.inputs, 0: { seq: t + 1, move: { x: -1, y: 0 }, act: false } },
        TICK_MS,
      );
      pulls += world.events.filter((e) => e.kind === "pull").length;
    }
    expect(x0 - world.players[0].pos.x, "the person leads west, at speed").toBeGreaterThan(3);
    expect(pulls, "and the bot does not pull back").toBe(0);
  });
});

describe("a Can't-see bot", () => {
  const r = room("01-first-job");

  it("does nothing until it is told something, and never needs tiles or entities", () => {
    const m = createBotMemory(0);
    for (let t = 1; t < 40; t++) {
      const turn = think(r, blindView(t), [], m, t * TICK_MS);
      expect(turn.input.move).toEqual({ x: 0, y: 0 });
      expect(turn.send).toBeNull();
    }
  });

  // review fixes A FR7: with its cache's vault open and empty hands, a Can't-see bot towed over floor
  // gear hears "Take the earpiece": that is gear, not its keepsake, and it does not pick it up
  it("takes its own keepsake from an open vault, and not gear lying on the floor", () => {
    const cache = {
      id: "Q4",
      motif: "moon",
      riddle: "r",
      item: "watch",
      state: "vault",
    } as const satisfies RoleView["cache"];
    const press = (act: string) =>
      think(room("01-first-job"), { ...blindView(5), cache, act }, [], createBotMemory(0), 250)
        .input.act;
    expect(press("Take the earpiece"), "floor gear").toBe(false);
    expect(press("Take the gold watch"), "its keepsake").toBe(true);
  });

  it("walks the way a callout says until it hears stop", () => {
    const m = createBotMemory(0);
    expect(think(r, blindView(1), [callout("left")], m, 50).input.move).toEqual({ x: -1, y: 0 });
    expect(think(r, blindView(2), [], m, 100).input.move).toEqual({ x: -1, y: 0 });
    expect(think(r, blindView(3), [callout("stop")], m, 150).input.move).toEqual({ x: 0, y: 0 });
    expect(think(r, blindView(4), [], m, 200).input.move).toEqual({ x: 0, y: 0 });
  });

  it("turns on a new direction, and goes on in the old one after wait and go", () => {
    const m = createBotMemory(0);
    think(r, blindView(1), [callout("left")], m, 50);
    expect(think(r, blindView(2), [callout("up")], m, 100).input.move).toEqual({ x: 0, y: -1 });
    expect(think(r, blindView(3), [callout("wait")], m, 150).input.move).toEqual({ x: 0, y: 0 });
    expect(think(r, blindView(4), [callout("go")], m, 200).input.move).toEqual({ x: 0, y: -1 });
  });

  it("holds when it hears a hum, and walks on when it is told to", () => {
    const m = createBotMemory(0);
    think(r, blindView(1), [callout("right")], m, 50);
    const hum = [{ kind: "hum" as const, pan: 0, gain: 1 }];
    let move = { x: 1, y: 0 };
    for (let t = 2; t < 8; t++) move = think(r, blindView(t, hum), [], m, t * 50).input.move;
    expect(move).toEqual({ x: 0, y: 0 });
    // told to go, it leaves the plate even though the hum goes on for a moment
    expect(think(r, blindView(9, hum), [callout("go")], m, 450).input.move).toEqual({ x: 1, y: 0 });
    expect(think(r, blindView(10, hum), [], m, 500).input.move).toEqual({ x: 1, y: 0 });
  });

  it("stays put when nobody has called for 5 s", () => {
    const m = createBotMemory(0);
    think(r, blindView(1), [callout("right")], m, 0);
    expect(think(r, blindView(2), [], m, 4900).input.move).toEqual({ x: 1, y: 0 });
    expect(think(r, blindView(3), [], m, 5100).input.move).toEqual({ x: 0, y: 0 });
  });

  it("does not read free text", () => {
    const m = createBotMemory(0);
    const text = {
      ...callout("left"),
      method: "text",
      text: "go left now",
    } as unknown as ChannelMessage;
    expect(think(r, blindView(1), [text], m, 50).input.move).toEqual({ x: 0, y: 0 });
  });
});

// A run of the real simulation with bots in the chosen seats; `watch` sees every tick.
// A3 (Task 28): a bot keeps a record of the hazards it has seen or heard, and its planner plans
// only around those, so a room cannot be passed by bots knowing what their role cannot.
describe("a seeing bot records the hazards it has perceived (A3)", () => {
  // The corridor runs east along the top, then turns south at x = 11 to a guard who watches
  // the bend. From the west half the guard is out of sight, so a bot there has seen nothing.
  const GRID = [
    "##############",
    "#1...........#",
    "#2.........#.#",
    "#3.........#.#",
    "###########G.#",
    "###########.E#",
    "##############",
  ];
  const GUARD = { G1: { sightTiles: 5, fovDeg: 90, speedTps: 0 } };
  const setup = () => {
    const r = roomWith(GRID, GUARD, {
      hints: { jobs: [{ beat: 1, goTo: "E", all: true }] },
    });
    const world = createWorld(r);
    const guard = world.guards[0];
    if (guard) guard.facing = { x: 0, y: -1 }; // looking up the leg, at the bend
    world.players[0].pos = { x: 1.5, y: 2.5 };
    world.players[2].pos = { x: 1.5, y: 3.5 };
    const memory = createBotMemory(1, new Set([0, 2] as Seat[]), ROLES3);
    return { r, world, memory };
  };
  const at = (x: number, y: number) => ({ x: x + 0.5, y: y + 0.5 });

  it("plans from nothing about a guard it has not seen: it records no hazard", () => {
    const { r, world, memory } = setup();
    world.players[1].pos = at(2, 1);
    const view = viewFor(world, 1, "deaf", true);
    expect(
      view.entities.some((e) => e.id === "G1"),
      "out of sight here",
    ).toBe(false);
    think(r, view, [], memory, 0);
    expect(memory.known?.seenHazards).toEqual({});
  });

  it("a bot that hears a guard records the guard that lies along the sound, not the others", () => {
    // two guards, each in a closed pocket behind a wall, so the bot cannot see either
    const grid = [
      "####################",
      "#1.......#G#...#G#.#",
      "#2.......#.#...#.#.#",
      "#3.................#",
      "####################",
    ];
    const r = roomWith(grid, {
      G1: { sightTiles: 3, fovDeg: 60, speedTps: 0 },
      G2: { sightTiles: 3, fovDeg: 60, speedTps: 0 },
    });
    const world = createWorld(r);
    const memory = createBotMemory(1, new Set([0, 2] as Seat[]), ROLES3);
    world.players[1].pos = at(2, 1); // a hearing bot with both guards to its east
    const view = viewFor(world, 1, "deaf", true);
    expect(
      view.entities.some((e) => e.kind === "guard"),
      "neither guard is in sight",
    ).toBe(false);
    // a footstep-like cue pointing east, from the nearer guard (G1, 7 tiles off)
    view.sounds = [{ kind: "guard", pan: 0.5, gain: 0.4, dir: { x: 1, y: 0 } }];
    think(r, view, [], memory, 0);
    expect(Object.keys(memory.known?.seenHazards ?? {})).toEqual(["G1"]);
  });

  it("records the count of a clue chime it hears, from the nearest clue", () => {
    const grid = [
      "####################",
      "#1.......c.......c.#",
      "#2.................#",
      "#3.................#",
      "####################",
    ];
    const r = roomWith(grid, { c1: { n: 2 }, c2: { n: 3 } });
    const world = createWorld(r);
    const memory = createBotMemory(2, new Set([0, 1] as Seat[]), ROLES3);
    world.players[2].pos = at(12, 1); // c1 is 3 tiles west of here, c2 is 5 tiles east
    const view = viewFor(world, 2, "mute", true);
    view.sounds = [{ kind: "clue", pan: 0, gain: 0.5, dir: { x: -1, y: 0 }, n: 2 }];
    think(r, view, [], memory, 0);
    expect(memory.known?.clues).toEqual({ c1: 2 });
  });

  it("is told of a guard once it sees it, and the record keeps the tick it last did", () => {
    const { r, world, memory } = setup();
    world.players[1].pos = at(9, 1);
    world.tick = 100;
    const near = viewFor(world, 1, "deaf", true);
    expect(
      near.entities.some((e) => e.id === "G1"),
      "in sight from here",
    ).toBe(true);
    think(r, near, [], memory, world.tick * TICK_MS);
    expect(memory.known?.seenHazards.G1?.lastTick).toBe(100);
    // back out of sight 3 s later: the record is not refreshed, so its age is visible
    world.players[1].pos = at(2, 1);
    world.tick = 160;
    const away = viewFor(world, 1, "deaf", true);
    expect(away.entities.some((e) => e.id === "G1")).toBe(false);
    think(r, away, [], memory, world.tick * TICK_MS);
    expect(memory.known?.seenHazards.G1?.lastTick).toBe(100);
  });
});

describe("a seeing bot plans only around what it has perceived (A3, Task 28)", () => {
  // The same L-shaped corridor: the guard at the bend watches the way to the exit, so a bot that
  // knows of it has no safe way through and waits; one that has not perceived it walks on.
  const GRID = [
    "##############",
    "#1...........#",
    "#2.........#.#",
    "#3.........#.#",
    "###########G.#",
    "###########.E#",
    "##############",
  ];
  const setup = () => {
    const r = roomWith(
      GRID,
      { G1: { sightTiles: 5, fovDeg: 90, speedTps: 0 } },
      { hints: { jobs: [{ beat: 1, goTo: "E", all: true }] } },
    );
    const world = createWorld(r);
    const guard = world.guards[0];
    if (guard) guard.facing = { x: 0, y: -1 };
    world.players[0].pos = { x: 1.5, y: 2.5 };
    world.players[2].pos = { x: 1.5, y: 3.5 };
    const memory = createBotMemory(1, new Set([0, 2] as Seat[]), ROLES3);
    return { r, world, memory };
  };
  const at = (x: number, y: number) => ({ x: x + 0.5, y: y + 0.5 });
  const moves = (move: { x: number; y: number }) => move.x !== 0 || move.y !== 0;

  it("heads down the lane a guard covers when it has never seen or heard the guard", () => {
    const { r, world, memory } = setup();
    world.players[1].pos = at(2, 1);
    const view = viewFor(world, 1, "deaf", true);
    expect(view.entities.some((e) => e.id === "G1")).toBe(false);
    expect(moves(think(r, view, [], memory, 0).input.move)).toBe(true);
  });

  it("does not, once it saw the guard a second ago", () => {
    const { r, world, memory } = setup();
    world.players[1].pos = at(9, 1);
    world.tick = 100;
    think(r, viewFor(world, 1, "deaf", true), [], memory, world.tick * TICK_MS);
    expect(memory.known?.seenHazards.G1?.lastTick).toBe(100);
    world.players[1].pos = at(2, 1);
    world.tick = 120; // 1 s on, and out of sight again
    const away = viewFor(world, 1, "deaf", true);
    expect(away.entities.some((e) => e.id === "G1")).toBe(false);
    expect(moves(think(r, away, [], memory, world.tick * TICK_MS).input.move)).toBe(false);
  });

  it("forgets the guard after 2 s without seeing or hearing it, and plans through again", () => {
    const { r, world, memory } = setup();
    world.players[1].pos = at(9, 1);
    world.tick = 100;
    think(r, viewFor(world, 1, "deaf", true), [], memory, world.tick * TICK_MS);
    world.players[1].pos = at(2, 1);
    world.tick = 160; // 3 s on
    const away = viewFor(world, 1, "deaf", true);
    expect(moves(think(r, away, [], memory, world.tick * TICK_MS).input.move)).toBe(true);
  });
});

describe("a bot keeps a hazard in mind while it is waiting for it (A3, Task 28)", () => {
  // A guard watches the bend from out of sight of the west half. Once seen, the bot waits
  // short of it; waiting hides the guard again, and 2 s on the bot must not forget it and
  // walk in: that would be the planner forgetting what it is waiting on.
  const GRID = [
    "##############",
    "#1...........#",
    "#2.........#.#",
    "#3.........#.#",
    "###########G.#",
    "###########.E#",
    "##############",
  ];
  const at = (x: number, y: number) => ({ x: x + 0.5, y: y + 0.5 });
  it("is still waiting 5 s after it last saw the guard, with the way still covered", () => {
    const r = roomWith(
      GRID,
      { G1: { sightTiles: 5, fovDeg: 90, speedTps: 0 } },
      { hints: { jobs: [{ beat: 1, goTo: "E", all: true }] } },
    );
    const world = createWorld(r);
    const guard = world.guards[0];
    if (guard) guard.facing = { x: 0, y: -1 };
    world.players[0].pos = { x: 1.5, y: 2.5 };
    world.players[2].pos = { x: 1.5, y: 3.5 };
    const memory = createBotMemory(1, new Set([0, 2] as Seat[]), ROLES3);
    world.players[1].pos = at(9, 1);
    world.tick = 100;
    think(r, viewFor(world, 1, "deaf", true), [], memory, world.tick * TICK_MS);
    world.players[1].pos = at(2, 1); // back out of sight of it
    for (let t = 105; t <= 300; t += 5) {
      world.tick = t;
      const view = viewFor(world, 1, "deaf", true);
      const turn = think(r, view, [], memory, t * TICK_MS);
      expect(turn.input.move, `walked on at tick ${t}`).toEqual({ x: 0, y: 0 });
    }
  });
});

describe("a guide recovers a Can't-see seat that paused off the middle of its lane (Task 28)", () => {
  // A one-tile gap in the wall at x = 5. A seat that pauses mid-tile drifts off the lane's middle
  // and then pushes at the wall beside the gap: it is too wide to pass, and "go" cannot help.
  const GRID = ["###########", "#1...#....#", "#2........#", "#3...#...E#", "###########"];
  it("stops it and asks for a tap to line it up, instead of saying go forever", () => {
    const r = roomWith(GRID, {}, { hints: { jobs: [{ beat: 1, goTo: "E", all: true }] } });
    const world = createWorld(r);
    const memory = createBotMemory(1, new Set(), ROLES3);
    world.players[1].pos = { x: 1.5, y: 1.5 };
    world.players[2].pos = { x: 1.5, y: 3.5 };
    const words: string[] = [];
    for (let t = 1; t <= 40; t++) {
      world.tick = t;
      // the blind seat is pressed against the corner of the gap at x = 5, not moving
      world.players[0].pos = { x: 4.72, y: 3.05 };
      const turn = think(r, viewFor(world, 1, "deaf", true), [], memory, t * TICK_MS);
      if (turn.send?.method === "callout") words.push(turn.send.callout);
      if (turn.send?.method === "text") words.push(turn.send.text);
    }
    // 2 s of being stuck: it says what to do about it once, and does not go on saying "go"
    expect(words).toContain("stop");
    expect(words.filter((w) => w === "go").length).toBeLessThanOrEqual(7);
  });
});

describe("a bot with a clue job goes to the plate it heard named (A2, Task 23)", () => {
  // A chime of n sounds from a vented pocket. The room file says n = 2, but the chime the bot
  // hears decides: it must hold until it has heard one, then stand on that plate.
  const GRID = [
    "####################",
    "#1...........p....E#",
    "#2...c.......p.....#",
    "#3...........p.....#",
    "####################",
  ];
  const room = (n: number) =>
    roomWith(
      GRID,
      { c1: { n, everyS: 3 } },
      {
        beats: [{ name: "b", x: [1, 18], intent: { blind: "b", deaf: "d", mute: "m" } }],
        hints: { jobs: [{ beat: 1, goTo: "clue:c1", prefer: "mute" }] },
      },
    );
  const at = (x: number, y: number) => ({ x: x + 0.5, y: y + 0.5 });
  const walk = (r: ReturnType<typeof room>, chimes: number, ticks: number) => {
    const world = createWorld(r);
    const memory = createBotMemory(2, new Set(), ROLES3); // all bots: the mute seat claims the job
    world.players[2].pos = at(8, 2);
    let heard: number | undefined;
    for (let i = 0; i < ticks; i++) {
      step(world, {}, TICK_MS);
      const view = viewFor(world, 2, "mute", i === 0);
      if (chimes === 0) view.sounds = view.sounds.filter((x) => x.kind !== "clue");
      else {
        const c = view.sounds.find((x) => x.kind === "clue");
        if (c) c.n = chimes;
      }
      const turn = think(r, view, [], memory, world.tick * TICK_MS);
      world.players[2].pos = {
        x: world.players[2].pos.x + turn.input.move.x * 0.2,
        y: world.players[2].pos.y + turn.input.move.y * 0.2,
      };
      heard = memory.known?.clues.c1;
    }
    return { pos: world.players[2].pos, heard };
  };

  it("holds where it is until it has heard a chime", () => {
    const { pos, heard } = walk(room(2), 0, 120);
    expect(heard).toBeUndefined();
    expect(Math.abs(pos.x - 8.5)).toBeLessThan(1.5);
  });

  it("stands on the plate the chime it heard names, not the one the room file says", () => {
    const { pos, heard } = walk(room(2), 3, 400);
    expect(heard).toBe(3);
    // the file says n = 2 (the middle plate, y = 2); the chime heard said 3 (y = 3)
    expect(Math.floor(pos.y)).toBe(3);
    expect(Math.floor(pos.x)).toBe(13);
  });
});

function play(
  roomId: string,
  roles: [Role, Role, Role],
  seats: Seat[],
  ticks: number,
  watch: (tick: number, sent: ReturnType<typeof botsAct>["sent"]) => void = () => {},
  options: {
    humans?: Seat[]; // claimed as people by the others, though a bot still plays them
    slow?: Partial<Record<Seat, number>>; // a seat that does nothing until this tick: a slow person
    onTick?: (world: ReturnType<typeof createWorld>) => void;
  } = {},
) {
  const r = room(roomId);
  const world = createWorld(r);
  const bots: Partial<Record<Seat, BotSeat>> = {};
  const humans = new Set<Seat>(
    options.humans ?? ([0, 1, 2] as const).filter((s) => !seats.includes(s)),
  );
  const born = (s: Seat) => ({ memory: createBotMemory(s, humans, roles), inbox: [] });
  for (const s of seats) if (!options.slow?.[s]) bots[s] = born(s);
  const cooldowns = { until: {} };
  let caught = 0;
  for (let i = 0; i < ticks && world.status !== "cleared"; i++) {
    options.onTick?.(world);
    // a slow person has not started yet; then they play like anyone, from where they stand
    for (const [seat, from] of Object.entries(options.slow ?? {})) {
      if (world.tick === from) bots[Number(seat) as Seat] = born(Number(seat) as Seat);
    }
    const out = botsAct(r, world, roles, bots, cooldowns, world.tick * TICK_MS, (s) => `Bot ${s}`);
    watch(world.tick, out.sent);
    step(world, out.inputs, TICK_MS);
    caught += world.events.filter((e) => e.kind === "caught").length;
  }
  return { world, caught };
}

describe("a Can't-hear bot guiding a Can't-see teammate", () => {
  it("repeats a callout no more often than every 1.5 s, and the router never refuses it", () => {
    // ruling 2: a change (a turn, a stop, a go) is said at once; saying the same thing again waits
    let previous: { callout: string; at: number } | null = null;
    const repeats: number[] = [];
    let said = 0;
    const run = play("01-first-job", ROLES3, [0, 1, 2], 600, (_tick, sent) => {
      for (const s of sent) {
        if (s.message.method !== "callout") continue;
        said++;
        const { callout, sentAt } = s.message;
        if (previous && previous.callout === callout) repeats.push(sentAt - previous.at);
        previous = { callout, at: sentAt };
      }
    });
    expect(run.world.status).toBe("cleared");
    expect(said).toBeGreaterThan(4);
    for (const gap of repeats) expect(gap).toBeGreaterThanOrEqual(1500);
  });

  it("steers a blind bot to the plates with callouts alone", () => {
    const said = new Set<string>();
    const run = play("01-first-job", ROLES3, [0, 1, 2], 600, (_t, sent) => {
      for (const s of sent) if (s.message.method === "callout") said.add(s.message.callout);
    });
    expect(run.world.status).toBe("cleared");
    expect(said.has("right")).toBe(true);
    expect(said.has("stop") || said.has("wait")).toBe(true);
  });

  it("says a phrase now and then, at most one every 10 s", () => {
    const texts: number[] = [];
    play("09-cameras-lasers", ROLES3, [0, 1, 2], 2000, (_t, sent) => {
      for (const s of sent) if (s.message.method === "text") texts.push(s.message.sentAt);
    });
    expect(texts.length).toBeGreaterThan(0);
    for (let i = 1; i < texts.length; i++)
      expect((texts[i] as number) - (texts[i - 1] as number)).toBeGreaterThanOrEqual(10_000);
  });
});

describe("a Can't-speak bot", () => {
  it("never says anything, whatever it sees", () => {
    const r = room("01-first-job");
    const world = createWorld(r);
    const m = createBotMemory(2, new Set(), ROLES3);
    for (let i = 0; i < 400; i++) {
      const turn = think(r, viewFor(world, 2, "mute", true), [], m, world.tick * TICK_MS);
      expect(
        turn.send === null || (turn.send.method !== "callout" && turn.send.method !== "text"),
      ).toBe(true);
      step(world, { 2: turn.input }, TICK_MS);
    }
  });

  it("plays a sound clip when the blind teammate is on the wrong side of a closed door", () => {
    const r = room("01-first-job");
    const world = createWorld(r);
    world.players[0].pos = { x: 20.5, y: 4.5 }; // blind, west of the door at x = 31
    world.players[2].pos = { x: 35.5, y: 4.5 }; // mute, east of it
    const m = createBotMemory(2, new Set(), ROLES3);
    const turn = think(r, viewFor(world, 2, "mute", true), [], m, 20_000);
    expect(turn.send).toMatchObject({ method: "clip" });
    // and not again straight away: sound has a cooldown, and the bot keeps its own
    expect(think(r, viewFor(world, 2, "mute", true), [], m, 20_050).send).toBeNull();
  });

  it("sends a face when the room is cleared", () => {
    const r = room("01-first-job");
    const world = createWorld(r);
    world.status = "cleared";
    const m = createBotMemory(2, new Set(), ROLES3);
    expect(think(r, viewFor(world, 2, "mute", true), [], m, 0).send).toMatchObject({
      method: "face",
    });
    expect(think(r, viewFor(world, 2, "mute", true), [], m, 50).send).toBeNull();
  });
});

describe("a seeing bot among hazards", () => {
  it("waits while the camera watches, and crosses its cone when it looks away", () => {
    const r = room("09-cameras-lasers");
    // seat 1 is the only bot; the others stay at spawn
    let stoodStill = 0;
    let watchedWhileStill = false;
    let lastX = 0;
    const roles = ROLES3;
    const world = createWorld(r);
    // the other two are people already standing at the first checkpoint, so the bot is free to go
    world.players[0].pos = { x: 6.5, y: 3.5 };
    world.players[2].pos = { x: 6.5, y: 5.5 };
    const memory = createBotMemory(1, new Set([0, 2] as Seat[]), roles);
    let caught = 0;
    for (let i = 0; i < 900; i++) {
      const view = viewFor(world, 1, "deaf", true);
      const turn = think(r, view, [], memory, world.tick * TICK_MS);
      const camera = view.entities.find((e) => e.kind === "camera");
      const x = view.you.pos?.x ?? 0;
      if (x > 6 && x < 20 && x === lastX) {
        stoodStill++;
        if (camera?.state === "watching") watchedWhileStill = true;
      }
      lastX = x;
      step(world, { 1: turn.input }, TICK_MS);
      caught += world.events.filter((e) => e.kind === "caught").length;
    }
    expect(caught).toBe(0);
    expect(world.players[1].pos.x).toBeGreaterThan(20);
    expect(stoodStill).toBeGreaterThan(5);
    expect(watchedWhileStill).toBe(true);
  });

  // 10-vault is left out (ruled 2026-10-28): perception-only bots are caught in its dark corridor,
  // the overhaul phase 04 finding, and escape-room heist phase 04 rewrites the room.
  it("is never caught by a guard in room 2, in any rotation", () => {
    for (const id of ["09-cameras-lasers"]) {
      for (const roles of [
        ["blind", "deaf", "mute"],
        ["deaf", "mute", "blind"],
        ["mute", "blind", "deaf"],
      ] as [Role, Role, Role][]) {
        expect(play(id, roles, [0, 1, 2], 1200).caught).toBe(0);
      }
    }
  });

  it("reads only its view: a bot's answer does not change with what else is in the room", () => {
    const r = room("01-first-job");
    const a = createWorld(r);
    const b = createWorld(r);
    b.pressed.p1 = true; // something the deaf role cannot see in this view is not what it acts on
    b.players[0].pos = { x: 3.5, y: 6.5 }; // the blind teammate is in the view, so this is seen
    const ma = createBotMemory(1, new Set(), ROLES3);
    const mb = createBotMemory(1, new Set(), ROLES3);
    const va = viewFor(a, 1, "deaf", true);
    const vb = viewFor(b, 1, "deaf", true);
    expect(JSON.stringify(think(r, va, [], ma, 0).input.move)).toBe(
      JSON.stringify(think(r, vb, [], mb, 0).input.move),
    );
  });
});

describe("with a person on the team", () => {
  const ROTATION_2: [Role, Role, Role] = ["mute", "blind", "deaf"];

  // One test a tick, not one loop of six: each is a 2,400-tick simulation (about 2 s here), and all six in one
  // test ran past the 20 s limit on a CI runner that is slower than a laptop.
  it.each([60, 100, 130, 170, 220, 260])(
    "recovers when the team is caught and sent back at tick %i: nobody walks on in the old direction",
    (when) => {
      let sentBack = false;
      const run = play("10-vault", ROTATION_2, [0, 1, 2], 2400, () => {}, {
        onTick: (world) => {
          // the way the simulation sends a caught team back: to the spawns, sequence forgotten
          if (!sentBack && world.tick === when) {
            sentBack = true;
            world.players.forEach((p, i) => {
              p.pos = { x: 2.5, y: 3.5 + i };
              p.moving = false;
            });
            world.events.push({ kind: "caught", by: "L1", hazard: "laser", seat: 0 });
            world.seqProgress = {};
          }
        },
      });
      expect(sentBack).toBe(true);
      expect(run.world.status, `sent back at tick ${when}`).toBe("cleared");
    },
  );

  it("clears the sequence door when the person is slow: the others step off and press again", () => {
    // a person who does nothing for 25 s, longer than the 5 s the sequence allows (not the one
    // who cannot see: steering a person is its own test below, since they do not obey like a bot)
    for (const slow of [0, 2] as const) {
      const run = play("10-vault", ROTATION_2, [0, 1, 2], 4000, () => {}, {
        humans: [slow],
        slow: { [slow]: 500 },
      });
      expect(run.world.status, `seat ${slow} slow`).toBe("cleared");
    }
  });

  it("keeps each plate of the sequence held until the door opens: nobody steps off early", () => {
    let wrong = 0;
    let letGo = 0;
    let opened = 0;
    const seq = ["p7", "p1", "p4"];
    const run = play("10-vault", ROTATION_2, [0, 1, 2], 4000, () => {}, {
      onTick: (world) => {
        wrong += world.events.filter((e) => e.kind === "seq" && e.result === "wrong").length;
        // a plate of the sequence released before the door has opened
        letGo += world.events.filter(
          (e) => e.kind === "plate" && !e.pressed && seq.includes(e.id) && !world.doorOpen.D1,
        ).length;
        if (opened === 0 && world.doorOpen.D1) opened = world.tick;
      },
    });
    expect(run.world.status).toBe("cleared");
    expect(opened).toBeGreaterThan(0);
    expect(letGo, "a plate was let go before the door opened").toBe(0);
    expect(wrong, "the sequence was never reset by a bot letting go").toBe(0);
  });

  it("waits at each checkpoint for the person, so the whole team sets every one", () => {
    for (const slow of [0, 2] as const) {
      const run = play("10-vault", ROTATION_2, [0, 1, 2], 4000, () => {}, {
        humans: [slow],
        slow: { [slow]: 400 },
      });
      expect(run.world.status, `seat ${slow} slow`).toBe("cleared");
      expect(run.world.checkpoint, `seat ${slow} slow`).toBe(3);
    }
  });

  it("does not press the first plate until the person is at theirs", () => {
    let pressedEarly = false;
    play("10-vault", ROTATION_2, [0, 1, 2], 1200, () => {}, {
      humans: [0],
      slow: { 0: 600 },
      onTick: (world) => {
        if (world.tick < 500 && world.pressed.p7) pressedEarly = true;
      },
    });
    expect(pressedEarly).toBe(false);
  });
});

// A person who cannot see, steered by the Can't-hear bot: they hear a call a few ticks late,
// walk the way they were told until told to stop, and tap a key for "tap up".
// They start a little off the middle of the lane, as a person steering by ear would be.
function reactiveBlind(lagTicks = 6) {
  let heading = { x: 0, y: 0 };
  let tap = 0;
  const due: { at: number; run: () => void }[] = [];
  const dirOf = (w: string) =>
    ({ up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } })[
      w
    ];
  return {
    hear(tick: number, m: ChannelMessage) {
      if (m.method !== "callout" && m.method !== "text") return;
      const word = m.method === "callout" ? m.callout : null;
      const taps = m.method === "text" ? /^Tap (\w+)\./.exec(m.text)?.[1] : undefined;
      if (word && dirOf(word)) {
        due.push({ at: tick + lagTicks, run: () => (heading = dirOf(word) as typeof heading) });
      } else if (word === "stop" || word === "wait") {
        due.push({ at: tick + lagTicks, run: () => (heading = { x: 0, y: 0 }) });
      } else if (taps && dirOf(taps)) {
        due.push({
          at: tick + lagTicks,
          run: () => {
            heading = { x: 0, y: 0 };
            tap = 1;
            tapDir = dirOf(taps) as typeof heading;
          },
        });
      }
    },
    input(tick: number, seq: number) {
      for (const d of due.filter((x) => x.at <= tick)) d.run();
      due.splice(0, due.length, ...due.filter((x) => x.at > tick));
      let move = heading;
      if (tap > 0) {
        tap--;
        move = tapDir;
      }
      return { seq, move, act: false };
    },
  };
}
let tapDir = { x: 0, y: 0 };

describe("steering a person who cannot see", () => {
  const sim = (roomId: string, roles: [Role, Role, Role], offset = 0.3, ticks = 3000) => {
    const r = room(roomId);
    const world = createWorld(r);
    const blindSeat = roles.indexOf("blind") as Seat;
    const humans = new Set<Seat>([blindSeat]);
    const person = reactiveBlind();
    world.players[blindSeat].pos.y += offset; // a little off the middle of the lane
    const bots: Partial<Record<Seat, BotSeat>> = {};
    for (const s of [0, 1, 2] as const) {
      if (s !== blindSeat) bots[s] = { memory: createBotMemory(s, humans, roles), inbox: [] };
    }
    const cooldowns = { until: {} };
    let bumpedTicks = 0;
    let worst = 0;
    for (let i = 0; i < ticks && world.status !== "cleared"; i++) {
      const out = botsAct(
        r,
        world,
        roles,
        bots,
        cooldowns,
        world.tick * TICK_MS,
        (s) => `Bot ${s}`,
      );
      for (const sent of out.sent)
        if (sent.receivers.includes(blindSeat)) person.hear(world.tick, sent.message);
      out.inputs[blindSeat] = person.input(world.tick, i + 1);
      step(world, out.inputs, TICK_MS);
      // a bump: pushing against something and getting nowhere
      bumpedTicks = world.players[blindSeat].blocked ? bumpedTicks + 1 : 0;
      worst = Math.max(worst, bumpedTicks);
    }
    return { world, worst };
  };

  it("gets a person who starts off-centre through the tunnel to the plates", () => {
    const run = sim("01-first-job", ["blind", "deaf", "mute"]);
    expect(run.world.status).toBe("cleared");
  });

  it("tells a person to tap toward the middle of the lane, in words, rather than repeating a direction", () => {
    const r = room("01-first-job");
    const world = createWorld(r);
    (world.crates[0] as { tile: { x: number; y: number } }).tile = { x: 12, y: 4 }; // the tunnel is clear
    world.players[0].pos = { x: 4.5, y: 4.3 }; // at the tunnel's mouth, 0.2 above the middle of its lane
    const roles: [Role, Role, Role] = ["blind", "deaf", "mute"];
    const bots: Partial<Record<Seat, BotSeat>> = {
      1: { memory: createBotMemory(1, new Set([0]), roles), inbox: [] },
    };
    const said: string[] = [];
    for (let i = 0; i < 80; i++) {
      const out = botsAct(r, world, roles, bots, { until: {} }, world.tick * TICK_MS, () => "Bot");
      for (const s of out.sent) {
        if (s.message.method === "callout" || s.message.method === "text") {
          said.push(s.message.method === "callout" ? s.message.callout : s.message.text);
        }
      }
      step(world, out.inputs, TICK_MS);
    }
    expect(said).toContain("Tap down.");
    // and not the same direction called over and over
    expect(said.filter((w) => w === "right").length).toBeLessThanOrEqual(2);
  });

  it("never lets a person push against a wall for more than a second", () => {
    for (const offset of [0.3, -0.3, 0.2, -0.2]) {
      const run = sim("01-first-job", ["blind", "deaf", "mute"], offset);
      expect(run.worst, `offset ${offset}`).toBeLessThanOrEqual(20);
    }
  });

  it("gets a person who reacts late through every room, in every role rotation, without pushing at walls", () => {
    for (const id of ["01-first-job", "09-cameras-lasers", "10-vault"]) {
      for (const roles of [
        ["blind", "deaf", "mute"],
        ["deaf", "mute", "blind"],
        ["mute", "blind", "deaf"],
      ] as [Role, Role, Role][]) {
        const run = sim(id, roles, 0.2, 6000);
        expect(run.world.status, `${id} ${roles.join("/")}`).toBe("cleared");
        expect(run.worst, `${id} ${roles.join("/")}`).toBeLessThanOrEqual(20);
      }
    }
  });
});

// Clues FR5: bots solve only from what their own role perceives and what teammates send. The sim's
// station state is never read: a world whose `stations` throws on read still runs the bots.
describe("a bot on a station job reads only its view and inbox (escape-room Task 13)", () => {
  const GRID = [
    "##############",
    "#1...........#",
    "#2...Q...g...#",
    "#3...........#",
    "##############",
  ];
  const WIRES = {
    type: "wires",
    wires: [
      [4, 1],
      [5, 1],
      [6, 1],
    ],
  };
  const r = roomWith(
    GRID,
    { Q1: WIRES, g1: { item: "stethoscope" } },
    {
      beats: [{ name: "b", x: [0, 13], intent: { blind: "b", deaf: "d", mute: "m" } }],
      hints: {
        jobs: [
          { beat: 1, station: "Q1", prefer: "deaf" },
          { beat: 1, take: "g1", prefer: "mute" },
        ],
      },
    },
  );

  it("think takes no hidden state: a sixth argument is a type error", () => {
    const world = createWorld(r, 5);
    const memory = createBotMemory(1, new Set(), ROLES3);
    const view = viewFor(world, 1, "deaf", true);
    // @ts-expect-error think(room, view, inbox, memory, now) has no hidden parameter (ADR 0018)
    think(r, view, [], memory, 0, { stations: world.stations });
  });

  // think is the bot: botsAct also builds each view, and perception reads the sim by design
  it("never reads world.stations while the bots think", () => {
    const world = createWorld(r, 5);
    const bots: Partial<Record<Seat, BotSeat>> = {
      1: { memory: createBotMemory(1, new Set(), ROLES3), inbox: [] },
      2: { memory: createBotMemory(2, new Set(), ROLES3), inbox: [] },
    };
    const views = ([1, 2] as const).map((s) => viewFor(world, s, ROLES3[s], true));
    Object.defineProperty(world, "stations", {
      get() {
        throw new Error("a bot read world.stations");
      },
    });
    for (const [i, s] of ([1, 2] as const).entries()) {
      const bot = bots[s] as BotSeat;
      for (let t = 0; t < 40; t++)
        expect(() => think(r, views[i] as RoleView, [], bot.memory, t * TICK_MS)).not.toThrow();
    }
  });

  it("a sighted bot that sees a teammate's x mark on a wire tile puts that tile in its belief", () => {
    const world = createWorld(r, 5);
    const memory = createBotMemory(1, new Set(), ROLES3);
    const mark = {
      method: "mark",
      id: "x",
      at: { x: 5.5, y: 1.5 },
      from: { seat: 2, role: "mute", nickname: "Cy" },
      sentAt: 0,
    } as ChannelMessage;
    think(r, viewFor(world, 1, "deaf", true), [mark], memory, 0);
    expect(memory.known?.stations.Q1?.marked).toEqual([{ x: 5, y: 1 }]);
  });

  it("a bot reads 5 from text and ignores five", () => {
    const world = createWorld(r, 5);
    const memory = createBotMemory(2, new Set(), ROLES3);
    const text = (t: string) =>
      ({
        method: "text",
        text: t,
        from: { seat: 0, role: "blind", nickname: "Ana" },
        sentAt: 0,
      }) as ChannelMessage;
    think(r, viewFor(world, 2, "mute", true), [text("five"), text("5")], memory, 0);
    expect(memory.known?.stations.Q1?.numbers).toEqual([5]);
  });

  it("does not work a station whose type has no decoder yet, and still takes the gear", () => {
    const world = createWorld(r, 5);
    const bots: Partial<Record<Seat, BotSeat>> = {
      1: { memory: createBotMemory(1, new Set(), ROLES3), inbox: [] },
      2: { memory: createBotMemory(2, new Set(), ROLES3), inbox: [] },
    };
    for (let i = 0; i < 400 && world.gear[0]?.heldBy !== 2; i++) {
      const out = botsAct(r, world, ROLES3, bots, { until: {} }, world.tick * TICK_MS, () => "Bot");
      step(world, out.inputs, TICK_MS);
    }
    expect(world.gear[0]?.heldBy).toBe(2);
    expect(world.stations.Q1?.input).toEqual([]); // never cut a wire it could not decode
    expect(world.attempt).toBe(0);
  });
});

// The safe (escape-room Task 16): one bot turns at the pads, Can't see listens at the back with the
// stethoscope and says "stop" on the tumbler; the turner enters the number on that word alone.
describe("bots work a safe from what they perceive (escape-room Task 16)", () => {
  const GRID = ["############", "#1...Q.....#", "#2.........#", "#3...g.....#", "############"];
  const SAFE = {
    type: "dial",
    pads: [
      [4, 1],
      [6, 1],
    ],
    back: [5, 3],
    digits: 2,
    range: 10,
  };
  const r = roomWith(
    GRID,
    { Q1: SAFE, g1: { item: "stethoscope" } },
    {
      beats: [{ name: "b", x: [0, 11], intent: { blind: "b", deaf: "d", mute: "m" } }],
      hints: {
        jobs: [
          { beat: 1, station: "Q1", prefer: "mute" },
          { beat: 1, listen: "Q1", at: [6, 3], prefer: "blind" },
        ],
      },
    },
  );

  it("Can't see holding the stethoscope says stop when it hears the tumbler, and only then", () => {
    const world = createWorld(r, 4);
    const memory = createBotMemory(0, new Set(), ROLES3);
    const g = world.gear[0];
    if (!g) throw new Error("no g1");
    Object.assign(g, { heldBy: 0, at: null });
    world.players[0].pos = { x: 6.5, y: 3.5 };
    const s = world.stations.Q1;
    if (!s) throw new Error("no Q1");
    const wrong = ((s.answer[0] as number) + 3) % 10;
    s.input[0] = (wrong + 9) % 10;
    world.players[2].pos = { x: 6.5, y: 1.5 };
    step(world, { 2: { seq: 1, move: { x: 0, y: 0 }, act: true } }, TICK_MS);
    expect(think(r, viewFor(world, 0, "blind", false), [], memory, 0).send).toBeNull();
    step(world, { 2: { seq: 2, move: { x: 0, y: 0 }, act: false } }, TICK_MS);
    s.input[0] = ((s.answer[0] as number) + 9) % 10;
    step(world, { 2: { seq: 3, move: { x: 0, y: 0 }, act: true } }, TICK_MS);
    expect(think(r, viewFor(world, 0, "blind", false), [], memory, 0).send).toEqual({
      method: "callout",
      callout: "stop",
    });
  });

  it("a listen job never goes to Can't hear, who could not hear the tumbler", () => {
    const listen = hintsOf(r).filter((j) => j.target.kind === "listen");
    const queues = claimJobs(
      r,
      listen,
      ([0, 1, 2] as const).map((seat) => ({ seat, role: ROLES3[seat], human: false })),
    );
    expect(queues[1]).toEqual([]);
  });

  it("with the stethoscope out of reach, the turner turns but never enters a number (it does not guess)", () => {
    const world = createWorld(r, 4);
    const g = world.gear[0];
    if (!g) throw new Error("no g1");
    Object.assign(g, { heldBy: null, at: { x: 10, y: 1 } }); // nobody's job takes it
    const bots: Partial<Record<Seat, BotSeat>> = {
      0: { memory: createBotMemory(0, new Set(), ROLES3), inbox: [] },
      1: { memory: createBotMemory(1, new Set(), ROLES3), inbox: [] },
      2: { memory: createBotMemory(2, new Set(), ROLES3), inbox: [] },
    };
    let turns = 0;
    for (let i = 0; i < 1200; i++) {
      const out = botsAct(r, world, ROLES3, bots, { until: {} }, world.tick * TICK_MS, () => "Bot");
      step(world, out.inputs, TICK_MS);
      for (const e of world.events) {
        if (e.kind === "station" && e.result === "turn") turns++;
        expect(e.kind === "station" && e.result === "press").toBe(false);
      }
    }
    expect(turns).toBeGreaterThan(10);
    expect(world.attempt).toBe(0);
    expect(world.stations.Q1?.solved).toBe(false);
  });

  it("with the stethoscope at the back, three bots open the safe, never caught", () => {
    const world = createWorld(r, 4);
    const g = world.gear[0];
    if (!g) throw new Error("no g1");
    Object.assign(g, { heldBy: 0, at: null });
    const bots: Partial<Record<Seat, BotSeat>> = {
      0: { memory: createBotMemory(0, new Set(), ROLES3), inbox: [] },
      1: { memory: createBotMemory(1, new Set(), ROLES3), inbox: [] },
      2: { memory: createBotMemory(2, new Set(), ROLES3), inbox: [] },
    };
    const cd = { until: {} };
    for (let i = 0; i < 2400 && !world.stations.Q1?.solved; i++) {
      const out = botsAct(r, world, ROLES3, bots, cd, world.tick * TICK_MS, () => "Bot");
      step(world, out.inputs, TICK_MS);
    }
    expect(world.stations.Q1?.solved).toBe(true);
    expect(world.attempt).toBe(0);
  });
});

// G hands gear to the nearest teammate beside you with a free slot (sim/gear.ts: gearPress), so a
// give waits until the one it is for is the nearest: a guide standing by them would get it instead.
describe("a bot gives gear to the role it is for, not the nearer teammate (escape-room Task 17)", () => {
  const r = roomWith(
    ["##########", "#1......g#", "#2.......#", "#3.......#", "##########"],
    { g1: { item: "stethoscope" } },
    {
      beats: [{ name: "b", x: [0, 9], intent: { blind: "b", deaf: "d", mute: "m" } }],
      hints: { jobs: [{ beat: 1, give: "g1", to: "blind", prefer: "mute" }] },
    },
  );
  it("does not press G while Can't hear stands nearer than Can't see", () => {
    const world = createWorld(r, 1);
    const g = world.gear[0];
    if (!g) throw new Error("no g1");
    Object.assign(g, { heldBy: 2, at: null });
    world.players[0].pos = { x: 5.5, y: 3.5 }; // Can't see
    world.players[1].pos = { x: 5.5, y: 2.5 }; // Can't hear, between
    world.players[2].pos = { x: 5.5, y: 1.5 }; // Can't speak, holding it
    const bots: Partial<Record<Seat, BotSeat>> = {
      2: { memory: createBotMemory(2, new Set(), ROLES3), inbox: [] },
    };
    for (let i = 0; i < 200; i++) {
      const out = botsAct(r, world, ROLES3, bots, { until: {} }, world.tick * TICK_MS, () => "Bot");
      step(world, out.inputs, TICK_MS);
      expect(world.gear[0]?.heldBy).not.toBe(1);
      if (world.gear[0]?.heldBy === 0) break;
    }
    expect(world.gear[0]?.heldBy).toBe(0);
  });
});

describe("a seeing bot never plans a way through a hatch (escape-room Task 4)", () => {
  // the only way from the spawns to the flag is round by the top row; straight east is a hatch
  const GRID = ["##########", "#1.......#", "#2.#H#####", "#3.#..K..#", "##########"];
  const r = roomWith(
    GRID,
    {},
    {
      beats: [{ name: "b", x: [0, 9], intent: { blind: "b", deaf: "d", mute: "m" } }],
      hints: { jobs: [{ beat: 1, goTo: [5, 3], prefer: "deaf" }] },
    },
  );
  it("does not walk into the hatch: it stops short, since nothing else leads there", () => {
    const world = createWorld(r);
    const memory = createBotMemory(1, new Set(), ROLES3);
    world.players[1].pos = { x: 4.5, y: 1.5 };
    for (let i = 0; i < 200; i++) {
      const turn = think(r, viewFor(world, 1, "deaf", i === 0), [], memory, world.tick * TICK_MS);
      step(world, { 1: turn.input }, TICK_MS);
    }
    // the plan it made goes nowhere near the hatch tile
    expect(Math.floor(world.players[1].pos.y)).toBe(1);
    expect(memory.nav.plan).not.toContain("down");
  });
});

describe("a Can't-hear bot leading Can't see by the hand (escape-room phase 04)", () => {
  // Can't see stands east of its guide, in the way it is going: taking their hand swings them
  // round behind, a jump the guide must not mistake for the team being sent back.
  const GRID = ["##########", "#1.......#", "#.23.....#", "##########"];
  const r = roomWith(
    GRID,
    {},
    {
      beats: [{ name: "b", x: [0, 9], intent: { blind: "b", deaf: "d", mute: "m" } }],
      hints: { jobs: [{ beat: 1, tow: "blind", to: [7, 2], prefer: "deaf" }] },
    },
  );
  it("takes the hand and leads them to the tile, rather than starting over every tick", () => {
    const roles: [Role, Role, Role] = ["mute", "deaf", "blind"];
    const world = createWorld(r);
    const bots: Partial<Record<Seat, BotSeat>> = {
      1: { memory: createBotMemory(1, new Set(), roles), inbox: [] },
    };
    const cooldowns = { until: {} };
    world.players[1].facing = { x: -1, y: 0 }; // it came from the east: behind it is where they stand
    for (let i = 0; i < 200 && Math.floor(world.players[1].pos.x) !== 7; i++) {
      const now = world.tick * TICK_MS;
      const full = new Set<Seat>(i === 0 ? [0, 1, 2] : []);
      const turn = botsAct(r, world, roles, bots, cooldowns, now, (s) => `Bot ${s}`, full);
      step(world, turn.inputs, TICK_MS);
    }
    expect(Math.floor(world.players[1].pos.x)).toBe(7);
  });
});

// Music box and earpiece (escape-room Task 24): the tune and the earpiece's code are heard, so the
// jobs that need them never go to Can't hear, and Can't see tells what the earpiece plays.
describe("bots work a music box and an earpiece from what they hear (escape-room Task 24)", () => {
  const BELLS = {
    type: "bells",
    bells: [
      [6, 1],
      [7, 1],
      [8, 1],
      [9, 1],
    ],
    tune: [3, 3],
  };
  const keys = [0, 1, 2].flatMap((y) => [0, 1, 2].map((x) => [6 + x, 1 + y]));
  const GRID = ["############", "#1..#.....Q#", "#2g.=......#", "#3..=....Q.#", "############"];
  const r = roomWith(
    GRID,
    { Q1: BELLS, Q2: { type: "keypad", keys, clue: "g1", length: 3 }, g1: { item: "earpiece" } },
    {
      beats: [{ name: "b", x: [0, 11], intent: { blind: "b", deaf: "d", mute: "m" } }],
      hints: {
        jobs: [
          { beat: 1, station: "Q1", at: [2, 3], prefer: "mute" },
          { beat: 1, watch: "Q1", at: [2, 3], prefer: "mute" },
          { beat: 1, station: "Q2", prefer: "mute" },
        ],
      },
    },
  );

  it("a music box's station job from its tune box, and its watch job, never go to Can't hear", () => {
    const jobs = hintsOf(r);
    expect(jobs.slice(0, 2).map((j) => j.target.kind)).toEqual(["station", "watch"]);
    for (const job of jobs.slice(0, 2)) {
      const queues = claimJobs(
        r,
        [job],
        ([0, 1, 2] as const).map((seat) => ({ seat, role: ROLES3[seat], human: false })),
      );
      expect(queues[1]).toEqual([]);
    }
  });

  it("Can't see holding the earpiece texts the code it hears, a digit a key, once", () => {
    const world = createWorld(r, 6);
    const memory = createBotMemory(0, new Set(), ROLES3);
    Object.assign(world.gear[0] as object, { heldBy: 0, at: null });
    const sent: string[] = [];
    for (let t = 0; t < 400; t++) {
      step(world, {}, TICK_MS);
      const out = think(r, viewFor(world, 0, "blind", false), [], memory, t * TICK_MS).send;
      if (out?.method === "text") sent.push(out.text);
    }
    expect(sent).toEqual(world.stations.Q2?.answer.map((k) => String(k + 1)));
  });

  it("a watcher at the tune box marks the tune's bells in order, an x each", () => {
    const w = roomWith(
      GRID,
      { Q1: BELLS, Q2: { type: "keypad", keys, clue: "g1", length: 3 }, g1: { item: "earpiece" } },
      {
        beats: [{ name: "b", x: [0, 11], intent: { blind: "b", deaf: "d", mute: "m" } }],
        hints: { jobs: [{ beat: 1, watch: "Q1", at: [2, 3], prefer: "mute" }] },
      },
    );
    const world = createWorld(w, 6);
    const memory = createBotMemory(2, new Set(), ROLES3);
    world.players[2].pos = { x: 2.5, y: 3.5 };
    const marks: { x: number; y: number }[] = [];
    for (let t = 0; t < 400; t++) {
      step(world, {}, TICK_MS);
      world.players[2].pos = { x: 2.5, y: 3.5 };
      const out = think(w, viewFor(world, 2, "mute", false), [], memory, t * TICK_MS).send;
      if (out?.method === "mark") marks.push({ x: Math.floor(out.at.x), y: Math.floor(out.at.y) });
    }
    const tune = world.stations.Q1?.answer ?? [];
    expect(marks).toEqual(tune.map((i) => ({ x: 6 + i, y: 1 })));
  });
});

describe("a keypad whose code is in the earpiece (escape-room Task 24)", () => {
  const keys = [0, 1, 2].flatMap((y) => [0, 1, 2].map((x) => [9 + x, 1 + y]));
  const GRID = [
    "#############",
    "#1.......Q..#",
    "#2g.........#",
    "#3..........#",
    "#############",
  ];
  const r = roomWith(
    GRID,
    { Q1: { type: "keypad", keys, clue: "g1", length: 3 }, g1: { item: "earpiece" } },
    {
      beats: [{ name: "b", x: [0, 12], intent: { blind: "b", deaf: "d", mute: "m" } }],
      hints: { jobs: [{ beat: 1, station: "Q1", prefer: "mute" }] },
    },
  );
  const run = (held: boolean) => {
    const world = createWorld(r, 8);
    if (held) Object.assign(world.gear[0] as object, { heldBy: 0, at: null });
    const bots: Partial<Record<Seat, BotSeat>> = {
      0: { memory: createBotMemory(0, new Set(), ROLES3), inbox: [] },
      1: { memory: createBotMemory(1, new Set(), ROLES3), inbox: [] },
      2: { memory: createBotMemory(2, new Set(), ROLES3), inbox: [] },
    };
    let presses = 0;
    const cd = { until: {} };
    for (let i = 0; i < 1200 && !world.stations.Q1?.solved; i++) {
      const out = botsAct(r, world, ROLES3, bots, cd, world.tick * TICK_MS, () => "Bot");
      step(world, out.inputs, TICK_MS);
      for (const e of world.events) if (e.kind === "station" && e.result === "press") presses++;
    }
    return { world, presses };
  };

  it("with nobody holding the earpiece, the presser never presses a key (it does not guess)", () => {
    const { world, presses } = run(false);
    expect(presses).toBe(0);
    expect(world.attempt).toBe(0);
  });

  it("with Can't see holding it, the code is texted and the keypad opens, never caught", () => {
    const { world } = run(true);
    expect(world.stations.Q1?.solved).toBe(true);
    expect(world.attempt).toBe(0);
  });
});

// Braille (Task 74): a Can't-see bot at a plate reads it with one Act, decodes the cells from its
// own view and texts the number a digit a turn, as the earpiece's code is texted.
describe("a Can't-see bot reads a braille plate (Task 74)", () => {
  const plated = roomWith(
    ["############", "#1.........#", "#2..Q..o...#", "#3.........#", "############"],
    {
      Q1: {
        type: "dial",
        pads: [
          [3, 1],
          [5, 1],
        ],
        digits: 2,
      },
      o1: { for: "Q1", part: 1 },
    },
    { beats: [{ name: "b", x: [0, 11], intent: { blind: "b", deaf: "d", mute: "m" } }] },
  );
  it("presses Act once at the plate, then texts the digits it reads", () => {
    const world = createWorld(plated, 3, ROLES3);
    world.players[0].pos = { x: 7.5, y: 2.5 };
    const memory = createBotMemory(0, new Set(), ROLES3);
    const acts: number[] = [];
    const sent: string[] = [];
    for (let t = 0; t < 20; t++) {
      const turn = think(plated, viewFor(world, 0, "blind", false), [], memory, t * TICK_MS);
      if (turn.input.act) acts.push(t);
      if (turn.send?.method === "text") sent.push(turn.send.text);
      step(world, { 0: turn.input }, TICK_MS);
    }
    expect(acts).toHaveLength(1);
    expect(sent).toEqual([String(world.stations.Q1?.answer[1])]);
  });
});

// ADR 0024: once a person has uncovered a cache, bots take its cache jobs before their beat job.
describe("cache jobs (ADR 0024)", () => {
  const GRID = [
    "###############",
    "#1............#",
    "#2............#",
    "#3.....Q......#",
    "###############",
  ];
  const CACHE = {
    owner: 1,
    motif: "moon",
    riddle: "r",
    item: "watch",
    tiles: [{ at: [13, 1], motif: "moon" }],
  };
  // seat 1 is Can't speak: no guide duty, so the bot is free to walk its jobs
  const ROLES_M: [Role, Role, Role] = ["deaf", "mute", "blind"];
  const make = () => {
    const probe = roomWith(GRID, {
      Q1: {
        type: "dial",
        pads: [
          [5, 1],
          [9, 1],
        ],
        back: [7, 2],
        digits: 1,
        cache: CACHE,
      },
    });
    const c = cacheOf(probe.objects.find((o) => o.id === "Q1") as never) as CacheSpec;
    const inside = [c.chamber.rect[0], c.chamber.rect[1]];
    return roomWith(
      GRID,
      {
        Q1: {
          type: "dial",
          pads: [
            [5, 1],
            [9, 1],
          ],
          back: [7, 2],
          digits: 1,
          cache: CACHE,
        },
      },
      {
        beats: [{ name: "b", x: [0, 14], intent: { blind: "b", deaf: "d", mute: "m" } }],
        hints: {
          jobs: [
            { beat: 1, goTo: [13, 2], prefer: "mute" },
            { beat: 1, cache: "Q1", goTo: inside, prefer: "mute" },
            { beat: 1, cache: "Q1", keepsake: "Q1" },
          ],
        },
      },
    );
  };
  const r = make();
  const chamber = (cacheOf(r.objects.find((o) => o.id === "Q1") as never) as CacheSpec).chamber;
  const uncover = (world: ReturnType<typeof createWorld>) => {
    world.cacheUncovered.push("Q1");
    syncCacheDoors(world);
    world.events.push({
      kind: "cache",
      id: "Q1",
      result: "uncover",
      seat: 2,
      at: { x: chamber.door.x + 0.5, y: chamber.door.y + 0.5 },
    });
  };
  const crew = (humans: ReadonlySet<Seat> = new Set()) => {
    const world = createWorld(r, 1, ROLES_M);
    const bots: Partial<Record<Seat, BotSeat>> = {
      1: { memory: createBotMemory(1, humans, ROLES_M), inbox: [] },
    };
    const cd = { until: {} };
    // one tick; `before` runs on the world before the bot looks (so a cacheEvent shows in its view)
    const seen = { maxX: 0, chamber: false };
    const tick = (before?: () => void) => {
      world.events = [];
      before?.();
      const out = botsAct(r, world, ROLES_M, bots, cd, world.tick * TICK_MS, () => "Bot");
      const events = world.events;
      step(world, out.inputs, TICK_MS);
      world.events = [...events, ...world.events];
      seen.maxX = Math.max(seen.maxX, world.players[1].pos.x);
      seen.chamber ||= inChamber(world);
    };
    return { world, bots, tick, seen };
  };
  const inChamber = (world: ReturnType<typeof createWorld>) => {
    const p = world.players[1].pos;
    return (
      p.x >= chamber.rect[0] &&
      p.x <= chamber.rect[2] + 1 &&
      p.y >= chamber.rect[1] &&
      p.y <= chamber.rect[3] + 1
    );
  };

  it("a bot ignores its cache job until it perceives the uncover", () => {
    const { tick, seen } = crew();
    for (let i = 0; i < 300; i++) tick();
    expect(seen.chamber).toBe(false);
    expect(seen.maxX).toBeGreaterThan(13); // it walked its beat job
  });

  it("on the uncover event it leaves its beat job for the cache job, and returns after it", () => {
    const { world, tick, seen } = crew();
    for (let i = 0; i < 20; i++) tick(); // under way along its beat
    expect(world.players[1].pos.x).toBeLessThan(13);
    tick(() => uncover(world));
    for (let i = 0; i < 400; i++) tick();
    expect(seen.chamber).toBe(true);
    expect(seen.maxX).toBeGreaterThan(13); // and it went back to its beat job
  });

  it("a send-back that shuts the chamber returns it to its beat job", () => {
    const { world, tick, bots, seen } = crew();
    for (let i = 0; i < 10; i++) tick();
    tick(() => uncover(world));
    for (let i = 0; i < 12; i++) tick();
    expect(bots[1]?.memory.known?.cachesOpen?.Q1).toBe(true);
    // the team is caught and sent back: chamber shut, bot at its spawn
    world.cacheUncovered.length = 0;
    syncCacheDoors(world);
    world.players[1].pos = { x: 1.5, y: 2.5 };
    seen.chamber = false;
    seen.maxX = 0;
    for (let i = 0; i < 3; i++) tick();
    expect(bots[1]?.memory.known?.cachesOpen?.Q1).toBeUndefined();
    for (let i = 0; i < 300; i++) tick();
    expect(seen.chamber).toBe(false);
    expect(seen.maxX).toBeGreaterThan(13);
  });

  it("a bot owner Acts on the keepsake once the vault is open; a bot that is not the owner never steps on the item tile", () => {
    const item = chamber.vault.item;
    // owner is seat 0 (owner 1): a bot there
    const owner = createWorld(r, 1, ROLES_M);
    owner.cacheUncovered.push("Q1");
    owner.cacheBy.Q1 = 1;
    if (owner.stations.Q1) owner.stations.Q1.solved = true;
    syncCacheDoors(owner);
    const bots: Partial<Record<Seat, BotSeat>> = {
      0: { memory: createBotMemory(0, new Set([1, 2]), ROLES_M), inbox: [] },
    };
    const cd = { until: {} };
    for (let i = 0; i < 600 && owner.cacheTaken.Q1 === undefined; i++) {
      const out = botsAct(r, owner, ROLES_M, bots, cd, owner.tick * TICK_MS, () => "Bot");
      step(owner, out.inputs, TICK_MS);
    }
    expect(owner.cacheTaken.Q1).toBe(0);
    expect(item).toBeDefined();
    // a bot that is not the owner (seat 1) is never given the keepsake job
    const others = claimJobs(
      r,
      hintsOf(r),
      ([0, 1, 2] as const).map((seat) => ({ seat, role: ROLES_M[seat], human: seat === 0 })),
    );
    for (const s of [0, 1, 2] as const)
      expect(others[s].some((j) => j.target.kind === "keepsake")).toBe(false);
  });

  // FR1 (review fixes A): a cache needs every seat's part, and a person may never do theirs. Room 4,
  // seat 2 a person who plays the beat but never turns the cache's dial: the listener must not stay
  // parked at the cache's back, nor Q2's turner deaf to "stop", for good.
  it("a person who never does their cache part does not hang the room: the bots give the cache up", () => {
    const safe = room("04-the-safe");
    const c = cacheOf(safe.objects.find((o) => o.id === "Q3") as never) as CacheSpec;
    for (const rotation of [0, 1, 2] as const) {
      const roles = ([0, 1, 2] as const).map((s) => ROLES3[(s + rotation) % 3]) as [
        Role,
        Role,
        Role,
      ];
      const turner = roles.indexOf("mute") as Seat; // the cache's Q3 is the turner's
      const world = createWorld(safe, 1, roles);
      const bots: Partial<Record<Seat, BotSeat>> = {};
      for (const s of [0, 1, 2] as const)
        bots[s] = { memory: createBotMemory(s, new Set(), roles), inbox: [] };
      const cd = { until: {} };
      let parted = false;
      while (world.tick < 240 * 20 && world.status !== "cleared") {
        const full = world.tick === 0 ? new Set<Seat>([0, 1, 2]) : new Set<Seat>();
        const out = botsAct(safe, world, roles, bots, cd, world.tick * TICK_MS, () => "Bot", full);
        // the person's seat: the beat as the bots planned it, but none of the cache's jobs
        const q = bots[turner]?.memory.queues;
        if (q && !parted) {
          q[turner] = q[turner].filter((j) => j.cache === undefined);
          parted = true;
        }
        step(world, out.inputs, TICK_MS);
        const x = (s: Seat) => Math.floor(world.players[s].pos.x);
        if (
          !world.cacheUncovered.includes("Q3") &&
          [0, 1, 2].some((s) => x(s as Seat) >= c.chamber.rect[0])
        )
          forceUncover(world, "Q3", turner);
      }
      expect(world.cacheUncovered, roles.join("/")).toContain("Q3");
      expect(world.cacheBy.Q3, roles.join("/")).toBeUndefined();
      expect(world.status, `${roles.join("/")}: not cleared after ${world.tick / 20} s`).toBe(
        "cleared",
      );
    }
  });

  it("a stop callout reaches the room's own dial once its open, unsolved cache is given up", () => {
    const safe = room("04-the-safe");
    const world = createWorld(safe, 1, ROLES3);
    world.players[2].pos = { x: 20.5, y: 2.5 }; // Can't speak, at Q2, the dial in sight
    const m = createBotMemory(2, new Set(), ROLES3);
    const stop: ChannelMessage = {
      method: "callout",
      callout: "stop",
      from: { seat: 0, role: "blind", nickname: "Bot" },
      sentAt: 0,
    } as ChannelMessage;
    const at = (tick: number, inbox: ChannelMessage[] = []) => {
      world.tick = tick;
      think(safe, viewFor(world, 2, "mute", tick === 0), inbox, m, tick * TICK_MS);
      world.events = [];
    };
    at(0);
    // it is at Q2 in beat 3 (the safe), where the cache's jobs are in play: its queue says so too
    const q = m.queues?.[2] ?? [];
    m.ptr[2] = q.findIndex((j) => j.cache === undefined && j.beat === 3);
    expect(m.ptr[2]).toBeGreaterThanOrEqual(0);
    forceUncover(world, "Q3", 0);
    at(1);
    expect(m.known?.cachesOpen?.Q3).toBe(true);
    // while the cache is fresh, its listener's stop is about the cache's safe
    at(2, [stop]);
    expect(m.known?.stations.Q2?.answer[0] ?? null).toBeNull();
    // nobody has worked it for a long while: the room's own dial takes the word again
    at(1 + CACHE_GIVE_UP_TICKS);
    at(2 + CACHE_GIVE_UP_TICKS, [stop]);
    const shown = m.known?.stations.Q2?.shows ?? [];
    expect(shown.length, "the dial is in sight").toBeGreaterThan(0);
    expect(m.known?.stations.Q2?.answer[shown.length - 1]).toBe(shown[shown.length - 1]);
  });

  it("a bot never Acts on a motif tile (FR1): three bots in room 4 open no cache", () => {
    const run = solveRoom(room("04-the-safe"), ROLES3, 120);
    expect(run.world.cacheUncovered).toEqual([]);
  });
});

describe("a guide says a direction once, and repeats it with backoff while no progress (FR10-FR11, Tasks 273, 282)", () => {
  const ROLES: [Role, Role, Role] = ["blind", "deaf", "mute"];
  const DIRS: Record<string, { x: number; y: number }> = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  const OPEN = [
    "##############################",
    "#2...........................#",
    "#1..........................E#",
    "#3...........................#",
    "##############################",
  ];
  type Pos = { x: number; y: number };
  // A person playing Can't see, moved by hand each tick from what the guide last said to them
  // (`heard`, a callout, or a "Tap x." text once). The guide stands on them, so it always sees them.
  const guided = (
    grid: string[],
    ticks: number,
    walk: (heard: string | null, pos: Pos, tap: string | null) => Pos,
    onTick?: (tick: number, memory: ReturnType<typeof createBotMemory>) => void,
  ) => {
    const r = roomWith(grid, {}, { hints: { jobs: [{ beat: 1, goTo: "E", all: true }] } });
    const world = createWorld(r);
    const memory = createBotMemory(1, new Set([0]), ROLES);
    const said: { word: string; tick: number }[] = [];
    let heard: string | null = null;
    let tap: string | null = null;
    for (let t = 1; t <= ticks; t++) {
      world.tick = t;
      world.players[0].pos = walk(heard, { ...world.players[0].pos }, tap);
      tap = null;
      world.players[1].pos = { ...world.players[0].pos };
      onTick?.(t, memory);
      const turn = think(r, viewFor(world, 1, "deaf", true), [], memory, t * TICK_MS);
      if (turn.send?.method === "callout") {
        said.push({ word: turn.send.callout, tick: t });
        heard = turn.send.callout;
      }
      if (turn.send?.method === "text") tap = /^Tap (\w+)\./.exec(turn.send.text)?.[1] ?? null;
    }
    return { said, at: world.players[0].pos };
  };
  const along = (heard: string | null, p: Pos, speed: number): Pos => {
    const d = heard ? DIRS[heard] : undefined;
    return d ? { x: p.x + d.x * speed, y: p.y + d.y * speed } : p;
  };

  it("says the direction exactly once over 10 s while the person walks that way", () => {
    const run = guided(OPEN, 200, (heard, p) => along(heard, p, 0.1));
    expect(run.said.map((s) => s.word)).toEqual(["right"]);
    expect(run.at.x).toBeGreaterThan(15); // and they did walk it
  });

  it("a person walking against the heading is told it again after 3 s, then backs off", () => {
    const run = guided(OPEN, 60 + 60 + 200, (heard, p) =>
      heard === null ? p : { x: Math.max(1.5, p.x - 0.02), y: p.y },
    );
    // 16 s: said at 0, then repeats at 3 s and 9 s (no progress, walking the other way)
    expect(run.said.map((s) => s.word)).toEqual(["right", "right", "right"]);
  });

  // FR11 as the user changed it after the review (2026-11-10): repeats back off, 3 s, 6 s, 12 s, then every 12 s
  const STEPS = 3000 / TICK_MS; // 60 ticks
  const gaps = (ticks: number[]) => ticks.slice(1).map((t, i) => t - (ticks[i] as number));
  it("a person who never moves hears the direction again after 3, 6, 12 and 12 s: four repeats in 40 s (Task 282)", () => {
    const run = guided(OPEN, 40_000 / TICK_MS, (_heard, p) => p);
    const ticks = run.said.map((s) => s.tick);
    expect(run.said.every((s) => s.word === "right")).toBe(true);
    expect(ticks).toHaveLength(5); // the direction, then exactly four repeats
    const g = gaps(ticks);
    for (const [i, want] of [STEPS, 2 * STEPS, 4 * STEPS, 4 * STEPS].entries()) {
      expect(
        Math.abs((g[i] as number) - want),
        `gap ${i + 1}: ${g.join(", ")}`,
      ).toBeLessThanOrEqual(1);
    }
  });

  it("progress resets the backoff: a person creeping along is not repeated at, and once they stop it starts over at 3 s (Task 282)", () => {
    // they stand through the 3 s and 6 s repeats (the next would be 12 s away), then creep along the
    // heading for 20 s, a quarter tile every ~1 s, then stand. (Standing after progress, the stuck rule
    // says "stop" and the direction again: that word, not a repeat, starts the cadence.)
    let t = 0;
    const run = guided(OPEN, 40_000 / TICK_MS, (heard, p) => {
      t++;
      return heard && t > 200 && t <= 600 ? along(heard, p, 0.012) : p;
    });
    const words = run.said.filter((s) => s.word === "right").map((s) => s.tick);
    const label = run.said.map((s) => `${s.word}@${s.tick}`).join(", ");
    expect(
      words.filter((tick) => tick > 210 && tick <= 600),
      `creeping: ${label}`,
    ).toEqual([]);
    const after = words.filter((tick) => tick > 600);
    expect(after.length, label).toBeGreaterThanOrEqual(2);
    expect(
      Math.abs((after[1] as number) - (after[0] as number) - STEPS),
      label,
    ).toBeLessThanOrEqual(1);
  });

  it("a repeat waits until nothing has been sent for 2 s (Task 282)", () => {
    // a flavour line goes out at 2.5 s, half a second before the first repeat is due
    const run = guided(
      OPEN,
      10_000 / TICK_MS,
      (_heard, p) => p,
      (t, memory) => {
        if (t === 51) memory.lastFlavourAt = t * TICK_MS;
      },
    );
    const ticks = run.said.map((s) => s.tick);
    expect(ticks[1], ticks.join(", ")).toBeGreaterThanOrEqual(51 + 2000 / TICK_MS);
  });

  it("a repeat waits 2 s after a work text too, so it never cuts off a digit (Task 291)", () => {
    // a work text (a digit, sent through `stamp`) goes out at 2.5 s, half a second before the first
    // repeat is due: on a person's client a callout 50 ms later would supersede it (speech.ts)
    const run = guided(
      OPEN,
      10_000 / TICK_MS,
      (_heard, p) => p,
      (t, memory) => {
        if (t === 51) memory.lastSpokeAt = t * TICK_MS;
      },
    );
    const ticks = run.said.map((s) => s.tick);
    expect(ticks[1], ticks.join(", ")).toBeGreaterThanOrEqual(51 + 2000 / TICK_MS);
  });

  it("a new heading resets the backoff and is said at once (Task 282)", () => {
    const L = [
      "#############",
      "#2..........#",
      "#1..........#",
      "#3..........#",
      "##########.##",
      "##########.##",
      "##########E##",
      "#############",
    ];
    // stand still long enough to back off to 12 s, then walk with the guide
    let t = 0;
    const run = guided(L, 1200, (heard, p, tap) => {
      t++;
      if (t < 25_000 / TICK_MS) return p;
      return tap ? along(tap, p, 0.2) : along(heard, p, 0.2);
    });
    const down = run.said.find((s) => s.word === "down");
    expect(down).toBeDefined();
    // standing at the corner after the turn: the first repeat of "down" comes 3 s later, not 12
    const s2 = guided(L, 1200, (heard, p, tap) => {
      if (heard === "down") return p; // freeze once told down
      return tap ? along(tap, p, 0.2) : along(heard, p, 0.2);
    });
    const downs = s2.said.filter((s) => s.word === "down").map((s) => s.tick);
    expect(downs.length).toBeGreaterThanOrEqual(2);
    expect(Math.abs((downs[1] as number) - (downs[0] as number) - STEPS)).toBeLessThanOrEqual(1);
  });

  it("a turn sends the new word at once, and each word once", () => {
    const L = [
      "#############",
      "#2..........#",
      "#1..........#",
      "#3..........#",
      "##########.##",
      "##########.##",
      "##########E##",
      "#############",
    ];
    const run = guided(L, 400, (heard, p, tap) =>
      tap ? along(tap, p, 0.2) : along(heard, p, 0.2),
    );
    const words = run.said.map((s) => s.word);
    // right, then down once the way turns; a stop between (at the corner, or to line them up with
    // the lane) is a new instruction, but the same word is never said twice in a row
    expect(words.filter((w) => DIRS[w])[0]).toBe("right");
    expect(words).toContain("down");
    expect(words.slice(words.indexOf("down")).every((w) => w !== "right")).toBe(true);
    for (let i = 1; i < words.length; i++) expect(words[i]).not.toBe(words[i - 1]);
    expect(Math.floor(run.at.y)).toBe(6); // they got to the exit's tile
  });
});

describe("a person at the very edge of their goal's tile is tapped onto it (Task 273)", () => {
  // the sim's sums leave a person at 29.99999…, which the view rounds to 30.000: on the plate's tile
  // by what the guide sees, and off it by what the sim presses. The guide taps them to the middle.
  it("taps a person toward the plate's centre rather than waiting forever", () => {
    const grid = ["#########", "#2......#", "#1...p..#", "#3......#", "#########"];
    const r = roomWith(grid, {}, { hints: { jobs: [{ beat: 1, goTo: "p1", prefer: "blind" }] } });
    const world = createWorld(r);
    const roles: [Role, Role, Role] = ["blind", "deaf", "mute"];
    const memory = createBotMemory(1, new Set([0]), roles);
    world.players[1].pos = { x: 3.5, y: 1.5 };
    world.players[2].pos = { x: 1.5, y: 3.5 };
    const texts: string[] = [];
    for (let t = 1; t <= 60; t++) {
      world.tick = t;
      world.players[0].pos = { x: 4.9999999999999, y: 2.5 }; // left of x = 5, the plate's tile
      const turn = think(r, viewFor(world, 1, "deaf", true), [], memory, t * TICK_MS);
      if (turn.send?.method === "text") texts.push(turn.send.text);
    }
    expect(texts).toContain("Tap right.");
  });
});

describe("the edge tap needs sight of the person (F1, Task 281)", () => {
  // Out of sight and stopped, the guide's estimate of a person never moves: a tap moves nobody in its
  // model. So if the estimate sits near its tile's edge, the same "Tap …" fired every 16 ticks forever.
  it("a stopped person out of sight, reckoned 0.4 off the middle of their goal tile, is tapped at most once in 100 ticks", () => {
    // the guide (2) is sealed off below: a wall between it and Can't see (1), so it never sees them
    const grid = ["#########", "#1...p..#", "#########", "#2.....3#", "#########"];
    const r = roomWith(grid, {}, { hints: { jobs: [{ beat: 1, goTo: "p1", prefer: "blind" }] } });
    const world = createWorld(r);
    const roles: [Role, Role, Role] = ["blind", "deaf", "mute"];
    const memory = createBotMemory(1, new Set([0]), roles);
    memory.guide.est = { x: 5.1, y: 1.5 }; // on the plate's tile (x 5), 0.4 left of its middle
    const texts: string[] = [];
    for (let t = 1; t <= 100; t++) {
      world.tick = t;
      const view = viewFor(world, 1, "deaf", true);
      expect(view.entities.some((e) => e.kind === "player" && e.seat === 0)).toBe(false);
      const turn = think(r, view, [], memory, t * TICK_MS);
      if (turn.send?.method === "text" && turn.send.text.startsWith("Tap"))
        texts.push(turn.send.text);
    }
    expect(texts.length, texts.join(" | ")).toBeLessThanOrEqual(1);
  });
});

describe("the line-up tap needs sight of the person too (F1, Task 281)", () => {
  it("a stopped person out of sight, reckoned 0.3 off a one-tile lane's middle, is tapped at most once in 100 ticks", () => {
    // Can't see (1) in a one-tile corridor to the exit, the guide (2) sealed off below it
    const grid = ["#########", "#1.....E#", "#########", "#2.....3#", "#########"];
    const r = roomWith(grid, {}, { hints: { jobs: [{ beat: 1, goTo: "E", all: true }] } });
    const world = createWorld(r);
    const roles: [Role, Role, Role] = ["blind", "deaf", "mute"];
    const memory = createBotMemory(1, new Set([0]), roles);
    memory.guide.est = { x: 1.5, y: 1.8 }; // 0.3 below the middle of the lane
    const texts: string[] = [];
    for (let t = 1; t <= 100; t++) {
      world.tick = t;
      const view = viewFor(world, 1, "deaf", true);
      expect(view.entities.some((e) => e.kind === "player" && e.seat === 0)).toBe(false);
      const turn = think(r, view, [], memory, t * TICK_MS);
      if (turn.send?.method === "text" && turn.send.text.startsWith("Tap"))
        texts.push(turn.send.text);
    }
    expect(texts.length, texts.join(" | ")).toBeLessThanOrEqual(1);
  });
});

describe("a bot Can't see on a long straight run (F7, Task 283)", () => {
  // A direction is said once (FR10), so on a run of 20+ tiles nothing reached the blind bot for more than
  // IDLE_MS (5 s), it held ("nobody is steering"), and the guide's stuck rule then said stop and go.
  it("walks a 30-tile corridor to the exit without holding or being called stuck", () => {
    const grid = [
      "##################################",
      "#2..............................3#",
      "#1..............................E#",
      "##################################",
    ];
    const r = roomWith(grid, {}, { hints: { jobs: [{ beat: 1, goTo: "E", all: true }] } });
    const world = createWorld(r);
    const roles: [Role, Role, Role] = ["blind", "deaf", "mute"];
    const bots: Record<Seat, BotSeat> = {
      0: { memory: createBotMemory(0, new Set(), roles), inbox: [] },
      1: { memory: createBotMemory(1, new Set(), roles), inbox: [] },
      2: { memory: createBotMemory(2, new Set(), roles), inbox: [] },
    };
    let held = 0;
    let stuck = 0;
    let started = false;
    for (let i = 0; i < 400 && world.players[0].pos.x < 32; i++) {
      // the guide walks beside the blind, so it always sees it
      const out = botsAct(
        r,
        world,
        roles,
        bots,
        { until: {} },
        world.tick * TICK_MS,
        (s) => `Bot ${s}`,
      );
      step(world, out.inputs, TICK_MS);
      if (bots[1].memory.guide.moving) started = true;
      if (started && bots[0].memory.holding && world.players[0].pos.x < 32) held++;
      for (const s of out.sent)
        if (s.message.method === "callout" && s.message.callout === "stop") stuck++;
    }
    expect(started).toBe(true);
    expect(Math.floor(world.players[0].pos.x), "reached the end").toBeGreaterThanOrEqual(32);
    expect(held, "ticks the blind bot held mid-run").toBe(0);
    expect(stuck, "stops said").toBe(0);
  });
});

describe("a bot guide stays put and quiet while a person listens at a safe (Task 289)", () => {
  // Room 4, a person playing Can't see with two bots: led to the back of Q2, they stood still to listen,
  // and the guide walked left and right and kept sending them taps. Three bots play the room up to
  // the listen tile; there the person takes over Can't see and stands still where they arrived.
  it("over 20 s at Q2's listen tile: no direction or tap to the listener, and the guide settles", () => {
    const r = room("04-the-safe");
    const world = createWorld(r, 1, [...ROLES3]);
    const humans = new Set<Seat>();
    const bots: Partial<Record<Seat, BotSeat>> = {};
    for (const s of [0, 1, 2] as const)
      bots[s] = { memory: createBotMemory(s, humans, ROLES3), inbox: [] };
    const cd = { until: {} };
    const act = () =>
      botsAct(
        r,
        world,
        ROLES3,
        bots,
        cd,
        world.tick * TICK_MS,
        (s) => `Bot ${s}`,
        world.tick === 0 ? new Set<Seat>([0, 1, 2]) : new Set<Seat>(),
      );
    const there = () => {
      const p = world.players[0].pos;
      return Math.floor(p.x) === 23 && Math.floor(p.y) === 1 && world.gear[0]?.heldBy === 0;
    };
    while (world.tick < 6000 && !there()) step(world, act().inputs, TICK_MS);
    expect(there(), "Can't see reached Q2's listen tile").toBe(true);
    delete bots[0];
    humans.add(0); // the person, who stands still from here
    const told: string[] = [];
    const tiles: string[] = [];
    const end = world.tick + 400;
    while (world.tick < end && world.stations.Q2?.solved !== true) {
      const out = act();
      for (const s of out.sent) {
        if (s.from !== 1 || !s.receivers.includes(0)) continue;
        const m = s.message;
        if (m.method === "callout" && m.callout !== "stop" && m.callout !== "wait")
          told.push(m.callout);
        if (m.method === "text" && m.text.startsWith("Tap")) told.push(m.text);
      }
      out.inputs[0] = { seq: world.tick + 1, move: { x: 0, y: 0 }, act: false };
      step(world, out.inputs, TICK_MS);
      const g = world.players[1].pos;
      const t = `${Math.floor(g.x)},${Math.floor(g.y)}`;
      if (tiles.at(-1) !== t) tiles.push(t);
    }
    expect(told, told.join(" | ")).toEqual([]);
    expect(tiles.length - 1, `the guide's tiles: ${tiles.join(" ")}`).toBeLessThanOrEqual(1);
  });
});

describe("the bot keep-alive never reaches a person (F1 of the phase 05 review, Task 290)", () => {
  // `route` sends a callout to every seat whose role receives it: a person playing Can't speak beside a
  // bot Can't see heard the heading again every 2.5 s on a long run, which breaks FR10.
  it("a person as Can't speak hears no more callouts on a 30-tile corridor than the heading changes and one nudge", () => {
    const grid = [
      "##################################",
      "#2..............................3#",
      "#1..............................E#",
      "##################################",
    ];
    const r = roomWith(grid, {}, { hints: { jobs: [{ beat: 1, goTo: "E", all: true }] } });
    const world = createWorld(r);
    const roles: [Role, Role, Role] = ["blind", "deaf", "mute"];
    const humans = new Set<Seat>([2]);
    const bots: Partial<Record<Seat, BotSeat>> = {
      0: { memory: createBotMemory(0, humans, roles), inbox: [] },
      1: { memory: createBotMemory(1, humans, roles), inbox: [] },
    };
    const heard: string[] = [];
    let changes = 0;
    let heading = "";
    for (let i = 0; i < 400 && world.players[0].pos.x < 32; i++) {
      const out = botsAct(
        r,
        world,
        roles,
        bots,
        { until: {} },
        world.tick * TICK_MS,
        (s) => `Bot ${s}`,
      );
      for (const s of out.sent) {
        if (s.message.method !== "callout" || !s.receivers.includes(2)) continue;
        heard.push(s.message.callout);
        if (s.message.callout !== heading) changes++;
        heading = s.message.callout;
      }
      out.inputs[2] = { seq: i + 1, move: { x: 0, y: 0 }, act: false };
      step(world, out.inputs, TICK_MS);
    }
    expect(Math.floor(world.players[0].pos.x), "reached the end").toBeGreaterThanOrEqual(32);
    // a bot Can't see is nudged once (FR11's backoff is for a person who makes no progress)
    expect(heard.length, heard.join(" ")).toBeLessThanOrEqual(changes + 1);
  });
});

describe("a bot asks a person for what it needs (Task 299)", () => {
  // Room 4's Q2: the Can't speak turner turns the dial and waits for the listener's Stop. Three bots
  // play to the listen tile; there seat 0 becomes a person (or stays a bot) and stands still.
  const asksOf = (person: boolean) => {
    const r = room("04-the-safe");
    const world = createWorld(r, 1, [...ROLES3]);
    const humans = new Set<Seat>();
    const bots: Partial<Record<Seat, BotSeat>> = {};
    for (const s of [0, 1, 2] as const)
      bots[s] = { memory: createBotMemory(s, humans, ROLES3), inbox: [] };
    const cd = { until: {} };
    const act = () =>
      botsAct(
        r,
        world,
        ROLES3,
        bots,
        cd,
        world.tick * TICK_MS,
        () => "Bot",
        world.tick === 0 ? new Set<Seat>([0, 1, 2]) : new Set<Seat>(),
      );
    const there = () => {
      const p = world.players[0].pos;
      return Math.floor(p.x) === 23 && Math.floor(p.y) === 1 && world.gear[0]?.heldBy === 0;
    };
    while (world.tick < 6000 && !there()) step(world, act().inputs, TICK_MS);
    expect(there(), "Can't see reached Q2's listen tile").toBe(true);
    if (person) {
      delete bots[0];
      humans.add(0);
    }
    const asks: { kind: string; to: Seat; from: Seat; at: number }[] = [];
    const end = world.tick + 400;
    while (world.tick < end && world.stations.Q2?.solved !== true) {
      const out = act();
      for (const a of out.sentAsks) asks.push({ ...a, at: world.tick * TICK_MS });
      if (person) out.inputs[0] = { seq: world.tick + 1, move: { x: 0, y: 0 }, act: false };
      step(world, out.inputs, TICK_MS);
    }
    return asks;
  };

  it("the turner asks a person at the safe's back for Stop; no ask when the listener is a bot", () => {
    const asks = asksOf(true);
    expect(asks.length, "an ask was made").toBeGreaterThan(0);
    expect(asks[0]).toMatchObject({ kind: "stop-on-click", to: 0, from: 2 });
    expect(asksOf(false)).toEqual([]);
  });
});
