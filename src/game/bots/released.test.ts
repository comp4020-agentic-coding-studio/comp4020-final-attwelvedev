import { describe, expect, it } from "vitest";
import type { ChannelMessage } from "../channels.ts";
import { rolesFor } from "../crew.ts";
import { loadRooms } from "../rooms/load.ts";
import { releaseAll } from "../sim/gear.ts";
import { step } from "../sim/step.ts";
import { roomWith } from "../sim/testing.ts";
import { createWorld, TICK_MS } from "../sim/world.ts";
import type { Role, Seat } from "../types.ts";
import { createBotMemory } from "./brain.ts";
import { type BotSeat, botsAct } from "./crew.ts";

// Task 48: a bot let go of by the person who led it goes back to work. Real rooms 5 to 8, every role.
const rooms = loadRooms();
const LEAD = 40;
const ROOMS = ["05-the-gallery", "06-lights-out", "07-night-shift", "08-music-room"];

function run(roomId: string, rotation: number, botRole: Role) {
  const letGo: string[] = [];
  const room = rooms.find((r) => r.id === roomId) as (typeof rooms)[0];
  const roles = rolesFor(rotation) as [Role, Role, Role];
  const botSeat = roles.indexOf(botRole) as Seat;
  const person = ([0, 1, 2] as const).find((s) => s !== botSeat && roles[s] !== "blind") as Seat;
  const humans = new Set<Seat>([person]);
  const world = createWorld(room, 1);
  const bots: Partial<Record<Seat, BotSeat>> = {};
  for (const s of [0, 1, 2] as const)
    if (!humans.has(s)) bots[s] = { memory: createBotMemory(s, humans, roles), inbox: [] };
  const cooldowns = { until: {} };
  // the person stands beside the bot and leads it for ten ticks, then lets go
  world.players[person].pos = {
    ...world.players[botSeat].pos,
    x: world.players[botSeat].pos.x + 0.8,
  };
  world.holding[botSeat] = person;
  const trace: { t: number; x: number; y: number }[] = [];
  for (let t = 0; t < 400; t++) {
    const turn = botsAct(room, world, roles, bots, cooldowns, t * TICK_MS, (s) => `Bot ${s}`);
    const mv = t < LEAD ? { x: 1, y: 0 } : { x: 0, y: 0 };
    const t0 = t;
    step(world, { ...turn.inputs, [person]: { seq: t + 1, move: mv, act: false } }, TICK_MS);
    if (t < LEAD)
      for (const e of world.events)
        if (e.kind === "hold" && e.leader === null)
          letGo.push(`tick ${t0}: the bot let go at ${JSON.stringify(world.players[botSeat].pos)}`);
    if (t === LEAD) releaseAll(world); // the person lets go (Act on a station tile would press the part)
    trace.push({ t, ...world.players[botSeat].pos });
  }
  return { world, trace, letGo };
}

describe("a bot let go of by a person goes back to work (Task 48)", () => {
  for (const id of ROOMS) {
    for (const rotation of [0, 1, 2]) {
      for (const botRole of ["blind", "deaf", "mute"] as Role[]) {
        it(`${id} (rotation ${rotation}): a ${botRole} bot after release`, () => {
          const { trace } = run(id, rotation, botRole);
          const at = trace[LEAD + 3] as { x: number; y: number };
          const end = trace[399] as { x: number; y: number };
          const moved = Math.hypot(end.x - at.x, end.y - at.y);
          // a Can't-see bot has no sight to walk by: it stays until a teammate calls it on
          if (botRole === "blind") return;
          expect(moved, "the bot stood where it was let go").toBeGreaterThan(1.5);
        });
      }
    }
  }
});

// (c) a bot answers a mark aimed at it: a mark on a switch is pressed by the deaf bot. The lamps
// are in another room, so the bot can read nothing for itself: the mark is all it has.
describe("a Can't-hear bot answers a teammate's mark (Task 48)", () => {
  const GRID = [
    "####################",
    "#1.....Q.....#.....#",
    "#2...........#.....#",
    "#3...........#.....#",
    "####################",
  ];
  const r = roomWith(
    GRID,
    {
      Q1: {
        type: "switches",
        buttons: [
          [3, 1],
          [4, 1],
          [5, 1],
        ],
        cols: 3,
        lamps: [
          [15, 1],
          [16, 1],
          [17, 1],
        ],
      },
    },
    {
      beats: [{ name: "b", x: [0, 19], intent: { blind: "b", deaf: "d", mute: "m" } }],
      hints: { jobs: [{ beat: 1, station: "Q1", prefer: "deaf" }] },
    },
  );
  const roles: [Role, Role, Role] = ["blind", "deaf", "mute"];
  const mark = (x: number) =>
    ({
      method: "mark",
      id: "x",
      at: { x: x + 0.5, y: 1.5 },
      from: { seat: 2, role: "mute", nickname: "P" },
      sentAt: 0,
    }) as ChannelMessage;

  it("walks to the button a teammate marked and presses it", () => {
    const world = createWorld(r, 1);
    const humans = new Set<Seat>();
    const bot: BotSeat = { memory: createBotMemory(1, humans, roles), inbox: [] };
    const pressed: string[] = [];
    for (let t = 0; t < 300; t++) {
      if (t === 10) bot.inbox.push(mark(4));
      const turn = botsAct(r, world, roles, { 1: bot }, { until: {} }, t * TICK_MS, (s) => `B${s}`);
      step(world, turn.inputs, TICK_MS);
      for (const e of world.events) if (e.kind === "station") pressed.push(JSON.stringify(e));
    }
    expect(pressed.length, "no button was pressed after the mark").toBeGreaterThan(0);
    expect(world.stations.Q1?.input[1], "the marked button, not another, was pressed").toBeTruthy();
  });
});

// The person leads: the bot's Act while towed would let go of their hand, so it never presses one.
describe("a bot led by a person's hand never lets go of it itself (Task 48)", () => {
  for (const id of ROOMS) {
    for (const rotation of [0, 1, 2]) {
      for (const botRole of ["deaf", "mute"] as Role[]) {
        it(`${id} (rotation ${rotation}): a ${botRole} bot keeps hold`, () => {
          expect(run(id, rotation, botRole).letGo).toEqual([]);
        });
      }
    }
  }
});

// The gear a bot took is the gear it hands on: a person who picks the plan's give job cannot give
// what a bot holds, so the give follows the take (room 4: a Can't-speak bot holds the stethoscope).
describe("a bot that took a piece of gear hands it over even when a person has the give job (Task 48)", () => {
  const room4 = rooms.find((r) => r.id === "04-the-safe") as (typeof rooms)[0];
  // the layouts where a bot plays Can't hear or Can't speak and takes the stethoscope
  for (const people of [[0, 1], [0], [1], [0, 2]] as Seat[][]) {
    it(`room 4, people on seats ${people.join(" and ")}: Can't see ends up holding the stethoscope`, () => {
      const roles: [Role, Role, Role] = ["blind", "deaf", "mute"];
      const humans = new Set<Seat>(people);
      const world = createWorld(room4, 1);
      const bots: Partial<Record<Seat, BotSeat>> = {};
      for (const s of [0, 1, 2] as const)
        if (!humans.has(s)) bots[s] = { memory: createBotMemory(s, humans, roles), inbox: [] };
      const cooldowns = { until: {} };
      for (let t = 0; t < 1200; t++) {
        const turn = botsAct(room4, world, roles, bots, cooldowns, t * TICK_MS, (s) => `Bot ${s}`);
        step(world, turn.inputs, TICK_MS); // the people stand where they spawned
      }
      const gear = world.gear.find((g) => g.item === "stethoscope");
      expect(gear?.heldBy, "who holds the stethoscope").toBe(0);
    });
  }
});

// A door out of sight is never in the view, and a bot with only the exit left walks to the nearest
// tile it can reach and waits there. Solving the stations is heard by the whole team, with a bearing.
describe("a bot at its exit job leaves through a door that opened out of its sight (Task 48)", () => {
  const room4 = rooms.find((r) => r.id === "04-the-safe") as (typeof rooms)[0];
  it("room 4: once both safes are solved a Can't-speak bot walks through D1 to the exit", () => {
    const roles: [Role, Role, Role] = ["blind", "deaf", "mute"];
    const humans = new Set<Seat>([0, 1]);
    const world = createWorld(room4, 1);
    const bot: BotSeat = { memory: createBotMemory(2, humans, roles), inbox: [] };
    bot.memory.ptr[2] = 4; // its queue's last job: the exit (the earlier ones are done)
    world.players[2].pos = { x: 17.5, y: 4.5 };
    world.players[0].pos = { x: 24.5, y: 1.5 };
    world.players[1].pos = { x: 23.5, y: 1.5 };
    const cooldowns = { until: {} };
    for (let t = 0; t < 600; t++) {
      const turn = botsAct(
        room4,
        world,
        roles,
        { 2: bot },
        cooldowns,
        t * TICK_MS,
        (s) => `Bot ${s}`,
      );
      step(world, turn.inputs, TICK_MS);
      // the people solve both safes as the sim does: solved, and the team-wide event for the next view
      if (t === 100)
        for (const o of room4.objects.filter((x) => x.kind === "station")) {
          const st = world.stations[o.id];
          if (!st) continue;
          st.solved = true;
          const at = { x: (o.tiles[0]?.x ?? 0) + 0.5, y: (o.tiles[0]?.y ?? 0) + 0.5 };
          world.events.push({ kind: "station", id: o.id, result: "solved", at });
        }
    }
    expect(world.doorOpen.D1, "the exit door opened").toBe(true);
    expect(world.players[2].pos.y, "the bot is through the door, not in the corridor").toBeLessThan(
      4,
    );
  });
});

// Room 7's ink is only a number: the wire to cut. A bot that reads it with the torch is the only one
// who can, so it tells the team by marking that wire; a mark is a message Can't speak may send.
describe("a bot that reads room 7's ink marks the wire it names (Task 48)", () => {
  const room7 = rooms.find((r) => r.id === "07-night-shift") as (typeof rooms)[0];
  const wireTiles = (id: string) =>
    ((room7.objects.find((o) => o.id === id)?.params?.wires ?? []) as [number, number][]).map(
      ([x, y]) => ({ x, y }),
    );
  for (const botRole of ["deaf", "mute"] as Role[]) {
    it(`a ${botRole} bot with the torch, at the first ink, marks the wire the ink names`, () => {
      const roles: [Role, Role, Role] =
        botRole === "deaf" ? ["blind", "deaf", "mute"] : ["blind", "mute", "deaf"];
      const botSeat = roles.indexOf(botRole) as Seat;
      const humans = new Set<Seat>(([0, 1, 2] as const).filter((s) => s !== botSeat));
      const world = createWorld(room7, 1);
      const bot: BotSeat = { memory: createBotMemory(botSeat, humans, roles), inbox: [] };
      // it is holding the torch and has worked its way to the ink
      const torch = world.gear.find((g) => g.item === "uv");
      if (torch) Object.assign(torch, { heldBy: botSeat, at: null });
      world.players[botSeat].pos = { x: 2.5, y: 5.5 };
      const sent: { method: string; at?: { x: number; y: number } }[] = [];
      const cooldowns = { until: {} };
      for (let t = 0; t < 400; t++) {
        const turn = botsAct(
          room7,
          world,
          roles,
          { [botSeat]: bot },
          cooldowns,
          t * TICK_MS,
          (s) => `Bot ${s}`,
        );
        for (const s of turn.sent) if (s.message.method === "mark") sent.push(s.message as never);
        step(world, turn.inputs, TICK_MS);
      }
      const answer = world.stations.Q1?.answer[0] as number;
      const want = wireTiles("Q1")[answer];
      expect(sent.length, "it sent a mark").toBeGreaterThan(0);
      expect(
        sent.some(
          (m) => Math.floor(m.at?.x ?? -1) === want?.x && Math.floor(m.at?.y ?? -1) === want?.y,
        ),
        "the mark is on the wire the ink names",
      ).toBe(true);
    });
  }
});
