import type { ChannelMessage } from "../channels.ts";
import { type RoleView, viewFor } from "../perception.ts";
import type { Room } from "../rooms/format.ts";
import { step } from "../sim/step.ts";
import { createWorld, TICK_MS, type World } from "../sim/world.ts";
import type { PlayerInput, Role, Seat } from "../types.ts";
import { createBotMemory } from "./brain.ts";
import { type BotSeat, botsAct } from "./crew.ts";

// The home page's attract mode: three bots playing a room, one tick at a time, so
// the page can show each seat exactly what its role is sent (the same viewFor the
// server uses). The bots are the solver's bots, played less perfectly: each role
// moves at its own pace, now and then stops to think, and a callout
// shows a moment late. The run is deterministic for a given seed.
export interface AttractTick {
  views: [RoleView, RoleView, RoleView]; // by seat
  heard: { message: ChannelMessage; receivers: Seat[] }[];
  cleared: boolean;
}

export interface Attract {
  world: World;
  next(): AttractTick;
}

export const ATTRACT_NAMES = ["Ana", "Bo", "Cy"] as const;

// How each role plays: the share of ticks it moves on (a slower player skips
// ticks rather than taking shorter steps, so it still lands on the tile centres
// the bots steer by), and how often it stops to think. Can't see feels their way,
// so is slowest. It never stops on its own: Can't hear steers it tile by tile and
// expects it to move the moment it is told, so a pause strands it between tiles.
export const HUMAN: Record<Role, { pace: number; pauseChance: number }> = {
  blind: { pace: 0.6, pauseChance: 0 },
  deaf: { pace: 0.9, pauseChance: 0.01 },
  mute: { pace: 0.8, pauseChance: 0.015 },
};
export const SAY_DELAY_MS: [number, number] = [300, 800]; // a callout shows on the feeds this long after it was meant
const PAUSE_MS: [number, number] = [250, 800];

// mulberry32: a small seeded generator, so a run is the same every time it is replayed
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createAttract(room: Room, roles: readonly [Role, Role, Role], seed = 1): Attract {
  const world = createWorld(room);
  const rand = random(seed);
  const between = ([lo, hi]: [number, number]) => lo + (hi - lo) * rand();
  const cooldowns = { until: {} };
  // Messages are delivered the tick they are sent (the bots steer by that); only the
  // feeds hear them late, so a callout lands on screen a moment after it was meant.
  const pending: { message: ChannelMessage; receivers: Seat[]; at: number }[] = [];
  const bots: Record<Seat, BotSeat> = {
    0: { memory: createBotMemory(0, new Set(), roles), inbox: [] },
    1: { memory: createBotMemory(1, new Set(), roles), inbox: [] },
    2: { memory: createBotMemory(2, new Set(), roles), inbox: [] },
  };
  const pausedUntil = [0, 0, 0];
  const owed = [0, 0, 0]; // each seat's progress toward its next moving tick

  // A bot's input as a person would play it: slower, and now and then not at all.
  // A held input is dropped whole, so the bot's own model of the room is not fooled.
  function humanise(
    seat: Seat,
    input: PlayerInput | undefined,
    now: number,
  ): PlayerInput | undefined {
    if (!input || (input.move.x === 0 && input.move.y === 0)) return input;
    const how = HUMAN[roles[seat]];
    const still = { ...input, move: { x: 0, y: 0 } };
    if (now < (pausedUntil[seat] ?? 0)) return still;
    if (rand() < how.pauseChance) {
      pausedUntil[seat] = now + between(PAUSE_MS);
      return still;
    }
    owed[seat] = (owed[seat] ?? 0) + how.pace;
    if ((owed[seat] ?? 0) < 1) return still;
    owed[seat] = (owed[seat] ?? 0) - 1;
    return input;
  }

  return {
    world,
    next() {
      const now = world.tick * TICK_MS;
      const first = world.tick === 0;
      const heard = pending.filter((p) => p.at <= now);
      for (const said of heard) pending.splice(pending.indexOf(said), 1);
      const turn = botsAct(
        room,
        world,
        roles,
        bots,
        cooldowns,
        now,
        (s) => ATTRACT_NAMES[s],
        first ? new Set<Seat>([0, 1, 2]) : new Set(),
      );
      for (const s of turn.sent) {
        pending.push({
          message: s.message,
          receivers: s.receivers,
          at: now + between(SAY_DELAY_MS),
        });
      }
      const inputs: Partial<Record<Seat, PlayerInput>> = {};
      for (const seat of [0, 1, 2] as const) inputs[seat] = humanise(seat, turn.inputs[seat], now);
      step(world, inputs, TICK_MS);
      const view = (seat: Seat) => viewFor(world, seat, roles[seat], first);
      return {
        views: [view(0), view(1), view(2)],
        heard: heard.map(({ message, receivers }) => ({ message, receivers })),
        cleared: world.status === "cleared",
      };
    },
  };
}
