import type { Room } from "../rooms/format.ts";
import { step } from "../sim/step.ts";
import { createWorld, TICK_MS, type World } from "../sim/world.ts";
import type { Role, Seat } from "../types.ts";
import { createBotMemory } from "./brain.ts";
import { type BotSeat, botsAct } from "./crew.ts";

export interface SolveResult {
  world: World;
  cleared: boolean;
  ticks: number;
  caught: number;
  refused: number; // a bot's message the router turned down: bots must keep their own cooldowns
  messages: number;
}

// Three bots in the room, no humans, the channel router in the loop: the room solver.
export function solveRoom(
  room: Room,
  roles: readonly [Role, Role, Role],
  budgetS = 600,
  humans: ReadonlySet<Seat> = new Set(),
): SolveResult {
  const world = createWorld(room);
  const cooldowns = { until: {} };
  const bots: Partial<Record<Seat, BotSeat>> = {};
  for (const seat of [0, 1, 2] as const) {
    if (!humans.has(seat)) bots[seat] = { memory: createBotMemory(seat, humans, roles), inbox: [] };
  }
  let caught = 0;
  let refused = 0;
  let messages = 0;
  const budget = Math.round((budgetS * 1000) / TICK_MS);
  while (world.tick < budget && world.status !== "cleared") {
    const now = world.tick * TICK_MS;
    const full = world.tick === 0 ? new Set<Seat>([0, 1, 2]) : new Set<Seat>();
    const turn = botsAct(room, world, roles, bots, cooldowns, now, (s) => `Bot ${s}`, full);
    refused += turn.refused;
    messages += turn.sent.length;
    step(world, turn.inputs, TICK_MS);
    caught += world.events.filter((e) => e.kind === "caught").length;
  }
  return {
    world,
    cleared: world.status === "cleared",
    ticks: world.tick,
    caught,
    refused,
    messages,
  };
}
