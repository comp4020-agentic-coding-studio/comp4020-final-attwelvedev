import type { Vec } from "../types.ts";

// Grid navigation for bots. A tile is a cell; a player moves one tile in
// STEP_TICKS (4 tiles/s at 20 Hz), so a plan is one step per 5 ticks.
export interface Grid {
  width: number;
  height: number;
  blocked(x: number, y: number): boolean;
}

export type Step = "wait" | "up" | "down" | "left" | "right";
export const STEP_TICKS = 5;
const MOVES: readonly { step: Exclude<Step, "wait">; dx: number; dy: number }[] = [
  { step: "right", dx: 1, dy: 0 },
  { step: "left", dx: -1, dy: 0 },
  { step: "down", dx: 0, dy: 1 },
  { step: "up", dx: 0, dy: -1 },
];
export const DELTA: Record<Step, Vec> = {
  wait: { x: 0, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const inside = (g: Grid, x: number, y: number) => x >= 0 && y >= 0 && x < g.width && y < g.height;

// Distance in steps from `from` to every tile it can reach (-1 = unreachable).
function distances(g: Grid, from: Vec): Int32Array {
  const dist = new Int32Array(g.width * g.height).fill(-1);
  const queue = [from.y * g.width + from.x];
  dist[queue[0] as number] = 0;
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head] as number;
    const x = at % g.width;
    const y = Math.floor(at / g.width);
    for (const m of MOVES) {
      const nx = x + m.dx;
      const ny = y + m.dy;
      if (!inside(g, nx, ny) || g.blocked(nx, ny)) continue;
      const next = ny * g.width + nx;
      if (dist[next] !== -1) continue;
      dist[next] = (dist[at] as number) + 1;
      queue.push(next);
    }
  }
  return dist;
}

// The shortest way, start and goal included; null when the goal cannot be reached.
export function findPath(g: Grid, from: Vec, to: Vec): Vec[] | null {
  if (!inside(g, to.x, to.y) || g.blocked(to.x, to.y)) return null;
  const parent = new Int32Array(g.width * g.height).fill(-2);
  const start = from.y * g.width + from.x;
  parent[start] = -1;
  const queue = [start];
  const goal = to.y * g.width + to.x;
  for (let head = 0; head < queue.length && parent[goal] === -2; head++) {
    const at = queue[head] as number;
    const x = at % g.width;
    const y = Math.floor(at / g.width);
    for (const m of MOVES) {
      const nx = x + m.dx;
      const ny = y + m.dy;
      if (!inside(g, nx, ny) || g.blocked(nx, ny)) continue;
      const next = ny * g.width + nx;
      if (parent[next] !== -2) continue;
      parent[next] = at;
      queue.push(next);
    }
  }
  if (parent[goal] === -2) return null;
  const path: Vec[] = [];
  for (let at = goal; at !== -1; at = parent[at] as number) {
    path.push({ x: at % g.width, y: Math.floor(at / g.width) });
  }
  return path.reverse();
}

// Where to wait when the goal itself cannot be reached yet (a crate or a door
// is in the way): the reachable tile nearest to it.
export function nearestReachable(g: Grid, from: Vec, to: Vec): Vec {
  const dist = distances(g, from);
  let best = from;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 0; i < dist.length; i++) {
    if (dist[i] === -1) continue;
    const x = i % g.width;
    const y = Math.floor(i / g.width);
    const score = Math.hypot(x - to.x, y - to.y) * 1000 + (dist[i] as number);
    if (score < bestScore) {
      bestScore = score;
      best = { x, y };
    }
  }
  return best;
}

export interface PlanRequest extends Grid {
  from: Vec;
  to: Vec;
  tick: number; // the tick the first step starts on
  danger(x: number, y: number, tick: number): boolean; // passing through
  rest?(x: number, y: number, tick: number): boolean; // standing still on the middle of it (default: danger)
  dwell?: number; // the goal must stay safe this many steps after arriving (default 6)
  maxSteps?: number; // how far ahead it looks (default 240, one minute)
}

// A time-expanded search: the earliest way to the goal in which, at every step,
// neither the tile it leaves nor the tile it enters is dangerous from one tick
// before the step to one tick after it. Null when there is none inside the horizon.
export function planSafe(req: PlanRequest): Step[] | null {
  const { width, height, from, to, tick } = req;
  const maxSteps = req.maxSteps ?? 240;
  const dwell = req.dwell ?? 6;
  const cells = width * height;
  if (!inside(req, to.x, to.y) || req.blocked(to.x, to.y)) return null;

  const resting = req.rest ?? req.danger;
  const occupied = (x: number, y: number, step: number, still: boolean): boolean => {
    const start = tick + step * STEP_TICKS;
    const unsafe = still ? resting : req.danger;
    for (let t = start - 1; t <= start + STEP_TICKS; t++) if (unsafe(x, y, t)) return true;
    return false;
  };
  const goalHolds = (step: number): boolean => {
    const start = tick + step * STEP_TICKS;
    for (let t = start - 1; t <= start + dwell * STEP_TICKS; t++) {
      if (resting(to.x, to.y, t)) return false;
    }
    return true;
  };

  const states = (maxSteps + 1) * cells;
  const parent = new Int32Array(states).fill(-2);
  const how = new Uint8Array(states);
  const names: Step[] = ["wait", "right", "left", "down", "up"];
  const heap: number[] = [];
  const push = (key: number) => {
    heap.push(key);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if ((heap[p] as number) <= (heap[i] as number)) break;
      [heap[p], heap[i]] = [heap[i] as number, heap[p] as number];
      i = p;
    }
  };
  const pop = (): number => {
    const top = heap[0] as number;
    const last = heap.pop() as number;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && (heap[l] as number) < (heap[m] as number)) m = l;
        if (r < heap.length && (heap[r] as number) < (heap[m] as number)) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i] as number, heap[m] as number];
        i = m;
      }
    }
    return top;
  };
  const h = (x: number, y: number) => Math.abs(x - to.x) + Math.abs(y - to.y);
  // order by f, then h (move before waiting), then the state itself
  const keyOf = (step: number, x: number, y: number, state: number) =>
    (step + h(x, y)) * 1e10 + h(x, y) * 1e8 + state;

  const startState = from.y * width + from.x;
  parent[startState] = -1;
  push(keyOf(0, from.x, from.y, startState));
  while (heap.length > 0) {
    const state = pop() % 1e8;
    const step = Math.floor(state / cells);
    const cell = state % cells;
    const x = cell % width;
    const y = Math.floor(cell / width);
    if (x === to.x && y === to.y && goalHolds(step)) {
      const out: Step[] = [];
      for (let at = state; parent[at] !== -1; at = parent[at] as number) {
        out.push(names[how[at] as number] as Step);
      }
      return out.reverse();
    }
    if (step >= maxSteps) continue;
    for (let k = 0; k < 5; k++) {
      const dx = k === 0 ? 0 : (MOVES[k - 1] as (typeof MOVES)[number]).dx;
      const dy = k === 0 ? 0 : (MOVES[k - 1] as (typeof MOVES)[number]).dy;
      const nx = x + dx;
      const ny = y + dy;
      if (!inside(req, nx, ny) || req.blocked(nx, ny)) continue;
      const next = (step + 1) * cells + ny * width + nx;
      if (parent[next] !== -2) continue;
      if (
        k === 0
          ? occupied(x, y, step, true)
          : occupied(x, y, step, false) || occupied(nx, ny, step, false)
      )
        continue;
      parent[next] = state;
      how[next] = k;
      push(keyOf(step + 1, nx, ny, next));
    }
  }
  return null;
}
