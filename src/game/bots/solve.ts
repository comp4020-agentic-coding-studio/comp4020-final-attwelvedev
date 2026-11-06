import { cacheOf, type Room, secretDoors } from "../rooms/format.ts";
import { forceUncover } from "../sim/stations.ts";
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
  sentBy: [number, number, number]; // messages each seat got through the router
}

// Three bots in the room, no humans, the channel router in the loop: the room solver.
export function solveRoom(
  room: Room,
  roles: readonly [Role, Role, Role],
  budgetS = 600,
  opts: {
    humans?: ReadonlySet<Seat>;
    // Stand in for the person who uncovers a cache (ADR 0024): on the first tick any seat reaches the
    // chamber's columns, the harness makes the same world change an Act on the motif tile makes.
    // The bots never uncover one themselves.
    // `true`: at the chamber's columns; a number: at that column (where a person would find the motif
    // tile on the way, once the beat's gear has changed hands and the doors have opened).
    uncoverWhenReached?: true | number;
  } = {},
): SolveResult {
  const humans = opts.humans ?? new Set<Seat>();
  const world = createWorld(room, 1, [...roles]);
  const sentBy: [number, number, number] = [0, 0, 0];
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
    for (const s of turn.sent) sentBy[s.from]++;
    step(world, turn.inputs, TICK_MS);
    if (opts.uncoverWhenReached) uncoverWhenReached(room, world, opts.uncoverWhenReached);
    caught += world.events.filter((e) => e.kind === "caught").length;
  }
  return {
    world,
    cleared: world.status === "cleared",
    ticks: world.tick,
    caught,
    refused,
    messages,
    sentBy,
  };
}

// For each cache not yet uncovered: once any seat stands in the columns of its chamber (a person
// finds the motif tile on the way there, after the beat's gear has changed hands), uncover it,
// credited to the nearest seat.
function uncoverWhenReached(room: Room, world: World, when: true | number): void {
  for (const d of secretDoors(room)) {
    const spec = room.objects.find((o) => o.id === d.id);
    const c = spec ? cacheOf(spec) : null;
    if (!c || world.cacheUncovered.includes(d.id)) continue;
    const dist = (s: Seat) =>
      Math.hypot(
        world.players[s].pos.x - c.chamber.door.x,
        world.players[s].pos.y - c.chamber.door.y,
      );
    const near = ([0, 1, 2] as const)
      .filter(
        (s) => Math.floor(world.players[s].pos.x) >= (when === true ? c.chamber.rect[0] : when),
      )
      .sort((a, b) => dist(a) - dist(b))[0];
    if (near !== undefined) forceUncover(world, d.id, near);
  }
}
