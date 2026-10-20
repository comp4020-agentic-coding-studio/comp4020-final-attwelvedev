import type { Vec } from "../types.ts";
import { blocksSight } from "./sight.ts";
import type { World } from "./world.ts";

// The tiles a player standing at `from` can see: no range limit, stopped by walls,
// vents and closed doors, passing glass. A blocking tile is itself seen (you see the
// face of the wall), and hide spots and crates do not block (they only cover a hazard's
// view). Symmetric shadowcasting, so if you can see a floor tile, someone standing on it
// can see yours.
export interface Visible {
  has(tx: number, ty: number): boolean;
  tiles: string[]; // "x,y" keys, for the view
}

// The visible tiles as one string per row, "y:x0-x1,x2-x3", so a view stays small.
export function encodeSeen(tiles: Iterable<string>): string[] {
  const rows = new Map<number, number[]>();
  for (const key of tiles) {
    const [x, y] = key.split(",").map(Number) as [number, number];
    rows.set(y, [...(rows.get(y) ?? []), x]);
  }
  return [...rows.entries()]
    .sort(([a], [b]) => a - b)
    .map(([y, xs]) => {
      const runs: string[] = [];
      let start = 0;
      const sorted = xs.sort((a, b) => a - b);
      for (let i = 1; i <= sorted.length; i++) {
        if (i < sorted.length && sorted[i] === (sorted[i - 1] as number) + 1) continue;
        runs.push(`${sorted[start]}-${sorted[i - 1]}`);
        start = i;
      }
      return `${y}:${runs.join(",")}`;
    });
}

export function decodeSeen(rows: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const row of rows) {
    const [y, runs = ""] = row.split(":");
    for (const run of runs.split(",")) {
      const [x0, x1] = run.split("-").map(Number) as [number, number];
      for (let x = x0; x <= x1; x++) out.add(`${x},${y}`);
    }
  }
  return out;
}

const EPS = 1e-9;
const roundUp = (n: number): number => Math.floor(n + 0.5 + EPS);
const roundDown = (n: number): number => Math.ceil(n - 0.5 - EPS);

type Quadrant = (row: number, col: number) => [number, number];

export function visibleFrom(world: World, from: Vec): Visible {
  const ox = Math.floor(from.x);
  const oy = Math.floor(from.y);
  const { width, height } = world.room;
  const seen = new Set<string>();
  const reveal = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < width && y < height) seen.add(`${x},${y}`);
  };
  reveal(ox, oy);
  const quadrants: Quadrant[] = [
    (row, col) => [ox + col, oy - row], // north
    (row, col) => [ox + col, oy + row], // south
    (row, col) => [ox + row, oy + col], // east
    (row, col) => [ox - row, oy + col], // west
  ];
  const radius = Math.max(width, height);

  for (const at of quadrants) {
    const wall = (row: number, col: number): boolean => blocksSight(world, ...at(row, col));
    const scan = (depth: number, start: number, end: number): void => {
      if (depth > radius) return;
      let prev: "wall" | "floor" | null = null;
      for (let col = roundUp(depth * start); col <= roundDown(depth * end); col++) {
        const isWall = wall(depth, col);
        const symmetric = col >= depth * start - EPS && col <= depth * end + EPS;
        if (isWall || symmetric) reveal(...at(depth, col));
        if (prev === "wall" && !isWall) start = (2 * col - 1) / (2 * depth);
        if (prev === "floor" && isWall) scan(depth + 1, start, (2 * col - 1) / (2 * depth));
        prev = isWall ? "wall" : "floor";
      }
      if (prev === "floor") scan(depth + 1, start, end);
    };
    scan(1, -1, 1);
  }
  return { has: (tx, ty) => seen.has(`${tx},${ty}`), tiles: [...seen] };
}
