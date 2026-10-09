import { describe, expect, it } from "vitest";
import type { ChannelMessage } from "../channels.ts";
import { type RoleView, viewFor } from "../perception.ts";
import { loadRooms } from "../rooms/load.ts";
import { step } from "../sim/step.ts";
import { createWorld, TICK_MS } from "../sim/world.ts";
import type { Role, Seat } from "../types.ts";
import { createBotMemory, think } from "./brain.ts";
import { type BotSeat, botsAct } from "./crew.ts";

const rooms = loadRooms();
const room = (id: string) => rooms.find((r) => r.id === id) ?? (rooms[0] as (typeof rooms)[0]);
const ROLES3: [Role, Role, Role] = ["blind", "deaf", "mute"];

const callout = (c: string, from: Seat = 1): ChannelMessage =>
  ({
    family: "say",
    kind: "callout",
    callout: c,
    from: { seat: from, role: "deaf", nickname: "Bot" },
    sentAt: 0,
  }) as ChannelMessage;

const blindView = (tick: number, sounds: RoleView["sounds"] = []): RoleView => ({
  tick,
  ack: 0,
  room: "01-loading-dock",
  role: "blind",
  full: false,
  you: { seat: 0 },
  tiles: undefined,
  entities: [],
  sounds,
  status: "playing",
  elapsedMs: tick * TICK_MS,
  alarm: false,
  dark: false,
});

describe("a Can't-see bot", () => {
  const r = room("01-loading-dock");

  it("does nothing until it is told something, and never needs tiles or entities", () => {
    const m = createBotMemory(0);
    for (let t = 1; t < 40; t++) {
      const turn = think(r, blindView(t), [], m, t * TICK_MS);
      expect(turn.input.move).toEqual({ x: 0, y: 0 });
      expect(turn.send).toBeNull();
    }
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
      kind: "text",
      text: "go left now",
    } as unknown as ChannelMessage;
    expect(think(r, blindView(1), [text], m, 50).input.move).toEqual({ x: 0, y: 0 });
  });
});

// A run of the real simulation with bots in the chosen seats; `watch` sees every tick.
function play(
  roomId: string,
  roles: [Role, Role, Role],
  seats: Seat[],
  ticks: number,
  watch: (tick: number, sent: ReturnType<typeof botsAct>["sent"]) => void = () => {},
) {
  const r = room(roomId);
  const world = createWorld(r);
  const bots: Partial<Record<Seat, BotSeat>> = {};
  const humans = new Set<Seat>(([0, 1, 2] as const).filter((s) => !seats.includes(s)));
  for (const s of seats) bots[s] = { memory: createBotMemory(s, humans, roles), inbox: [] };
  const cooldowns = { until: {} };
  let caught = 0;
  for (let i = 0; i < ticks && world.status !== "cleared"; i++) {
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
    const run = play("01-loading-dock", ROLES3, [0, 1, 2], 600, (_tick, sent) => {
      for (const s of sent) {
        if (s.message.family !== "say" || s.message.kind !== "callout") continue;
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
    const run = play("01-loading-dock", ROLES3, [0, 1, 2], 600, (_t, sent) => {
      for (const s of sent)
        if (s.message.family === "say" && s.message.kind === "callout") said.add(s.message.callout);
    });
    expect(run.world.status).toBe("cleared");
    expect(said.has("right")).toBe(true);
    expect(said.has("stop") || said.has("wait")).toBe(true);
  });

  it("says a phrase now and then, at most one every 10 s", () => {
    const texts: number[] = [];
    play("02-cameras-lasers", ROLES3, [0, 1, 2], 2000, (_t, sent) => {
      for (const s of sent)
        if (s.message.family === "say" && s.message.kind === "text") texts.push(s.message.sentAt);
    });
    expect(texts.length).toBeGreaterThan(0);
    for (let i = 1; i < texts.length; i++)
      expect((texts[i] as number) - (texts[i - 1] as number)).toBeGreaterThanOrEqual(10_000);
  });
});

describe("a Can't-speak bot", () => {
  it("never says anything, whatever it sees", () => {
    const r = room("01-loading-dock");
    const world = createWorld(r);
    const m = createBotMemory(2, new Set(), ROLES3);
    for (let i = 0; i < 400; i++) {
      const turn = think(r, viewFor(world, 2, "mute", true), [], m, world.tick * TICK_MS);
      expect(turn.send === null || turn.send.family !== "say").toBe(true);
      step(world, { 2: turn.input }, TICK_MS);
    }
  });

  it("plays a sound clip when the blind teammate is on the wrong side of a closed door", () => {
    const r = room("01-loading-dock");
    const world = createWorld(r);
    world.players[0].pos = { x: 20.5, y: 4.5 }; // blind, west of the door at x = 31
    world.players[2].pos = { x: 35.5, y: 4.5 }; // mute, east of it
    const m = createBotMemory(2, new Set(), ROLES3);
    const turn = think(r, viewFor(world, 2, "mute", true), [], m, 20_000);
    expect(turn.send).toMatchObject({ family: "sound" });
    // and not again straight away: sound has a cooldown, and the bot keeps its own
    expect(think(r, viewFor(world, 2, "mute", true), [], m, 20_050).send).toBeNull();
  });

  it("sends a face when the room is cleared", () => {
    const r = room("01-loading-dock");
    const world = createWorld(r);
    world.status = "cleared";
    const m = createBotMemory(2, new Set(), ROLES3);
    expect(think(r, viewFor(world, 2, "mute", true), [], m, 0).send).toMatchObject({
      family: "show",
      kind: "face",
    });
    expect(think(r, viewFor(world, 2, "mute", true), [], m, 50).send).toBeNull();
  });
});

describe("a seeing bot among hazards", () => {
  it("waits while the camera watches, and crosses its cone when it looks away", () => {
    const r = room("02-cameras-lasers");
    // seat 1 is the only bot; the others stay at spawn
    let stoodStill = 0;
    let watchedWhileStill = false;
    let lastX = 0;
    const roles = ROLES3;
    const world = createWorld(r);
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

  it("is never caught by a guard in room 2 or the dark of room 3, in any rotation", () => {
    for (const id of ["02-cameras-lasers", "03-vault"]) {
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
    const r = room("01-loading-dock");
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
