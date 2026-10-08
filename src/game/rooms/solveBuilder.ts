import { laserOn, laserParams } from "../sim/hazards.ts";
import { step } from "../sim/step.ts";
import { createWorld, SPEED_TPS, TICK_MS, type World } from "../sim/world.ts";
import type { Seat } from "../types.ts";
import type { Room } from "./format.ts";

// A step in one player's route. `go` walks to a tile-centre point, along x
// first and then y; `wait` holds still until the condition is true of the world.
export type Move = { go: [number, number] } | { wait: (w: World) => boolean };
export type Plan = Record<Seat, Move[]>;

// One run of identical inputs: `moves[seat]` held for `n` ticks.
export interface Run {
  n: number;
  moves: [[number, number], [number, number], [number, number]];
}
export interface Script {
  room: string;
  runs: Run[];
}

const STEP_LEN = (SPEED_TPS * TICK_MS) / 1000;
const MAX_TICKS = 6000;

// Is the laser off for at least `ticks` more ticks, starting now?
export function laserOffFor(room: Room, id: string, ticks: number): (w: World) => boolean {
  const laser = room.objects.find((o) => o.id === id);
  return (w) =>
    laser !== undefined &&
    Array.from({ length: ticks }, (_, i) => w.tick + 1 + i).every(
      (t) => !laserOn(laserParams(laser), t),
    );
}

// The same plan, but each seat stands still for `ticks` the first time it reaches
// x. A team really does wait at the places a plan only passes through, so this is
// how a test asks "is it safe to stand here for a while?".
export function withLinger(plan: Plan, x: number, ticks: number): Plan {
  const out = { 0: [] as Move[], 1: [] as Move[], 2: [] as Move[] };
  for (const seat of [0, 1, 2] as const) {
    let started = -1;
    const wait = (w: World) => {
      if (started < 0) started = w.tick;
      return w.tick - started >= ticks;
    };
    const steps = plan[seat];
    const at = steps.findIndex((m) => "go" in m && m.go[0] === x);
    out[seat] = at < 0 ? [...steps] : [...steps.slice(0, at + 1), { wait }, ...steps.slice(at + 1)];
  }
  return out;
}

// Plays the plan through the real simulation and records what each seat held
// each tick. The simulation is deterministic, so replaying the recording gives
// the same run. Throws if the room is not cleared, or the team is caught.
export function buildScript(room: Room, plan: Plan): Script {
  const world = createWorld(room);
  const at: Record<Seat, number> = { 0: 0, 1: 0, 2: 0 };
  const runs: Run[] = [];
  let seq = 0;
  for (let tick = 0; tick < MAX_TICKS && world.status !== "cleared"; tick++) {
    const moves: Run["moves"] = [
      [0, 0],
      [0, 0],
      [0, 0],
    ];
    const inputs: Parameters<typeof step>[1] = {};
    for (const seat of [0, 1, 2] as const) {
      const move = decide(world, plan[seat], at, seat);
      moves[seat] = move;
      inputs[seat] = { seq: ++seq, move: { x: move[0], y: move[1] }, act: false };
    }
    step(world, inputs, TICK_MS);
    const caught = world.events.find((e) => e.kind === "caught");
    if (caught?.kind === "caught") {
      throw new Error(`${room.id}: caught by ${caught.by} at tick ${world.tick}`);
    }
    const last = runs[runs.length - 1];
    if (last?.moves.every((m, i) => m[0] === moves[i]?.[0] && m[1] === moves[i]?.[1])) {
      last.n++;
    } else runs.push({ n: 1, moves });
  }
  if (world.status !== "cleared") {
    const where = world.players
      .map((p) => `(${p.pos.x.toFixed(1)},${p.pos.y.toFixed(1)})`)
      .join(" ");
    throw new Error(
      `${room.id}: not cleared in ${MAX_TICKS} ticks; players ${where}; steps ${JSON.stringify(at)}; pressed ${JSON.stringify(world.pressed)}; doors ${JSON.stringify(world.doorOpen)}; seq ${JSON.stringify(world.seqProgress)}`,
    );
  }
  return { room: room.id, runs };
}

function decide(
  world: World,
  route: Move[],
  at: Record<Seat, number>,
  seat: Seat,
): [number, number] {
  for (;;) {
    const move = route[at[seat]];
    if (!move) return [0, 0];
    if ("wait" in move) {
      if (!move.wait(world)) return [0, 0];
      at[seat]++;
      continue;
    }
    const p = world.players[seat].pos;
    const dx = move.go[0] - p.x;
    const dy = move.go[1] - p.y;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
      at[seat]++;
      continue;
    }
    return Math.abs(dx) >= 1e-6
      ? [Math.sign(dx) * Math.min(1, Math.abs(dx) / STEP_LEN), 0]
      : [0, Math.sign(dy) * Math.min(1, Math.abs(dy) / STEP_LEN)];
  }
}

// Replays a recording; returns the world at the end.
export function replay(room: Room, script: Script): { world: World; caught: boolean } {
  const world = createWorld(room);
  let seq = 0;
  let caught = false;
  for (const run of script.runs) {
    for (let i = 0; i < run.n; i++) {
      const inputs: Parameters<typeof step>[1] = {};
      for (const seat of [0, 1, 2] as const) {
        const m = run.moves[seat];
        inputs[seat] = { seq: ++seq, move: { x: m[0], y: m[1] }, act: false };
      }
      step(world, inputs, TICK_MS);
      if (world.events.some((e) => e.kind === "caught")) caught = true;
    }
  }
  return { world, caught };
}
