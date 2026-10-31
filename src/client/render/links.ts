import type { Vec } from "../../game/types.ts";

const STEPS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const centre = (t: Vec): Vec => ({ x: t.x + 0.5, y: t.y + 0.5 });

// The wire from a station's anchor to its remote part (a safe's back, a music box's tune), as points
// in tile space: along wall tiles from one beside the anchor to one beside the remote part, found
// by breadth-first search. With no such wall route, or one more than twice the Manhattan distance
// (it would wander round a room for a short gap), it is a straight line. No remote tile, no wire.
export function linkPath(tiles: readonly string[], anchor: Vec, remote: Vec | undefined): Vec[] {
  if (!remote) return [];
  const straight = [centre(anchor), centre(remote)];
  const wall = (x: number, y: number) => tiles[y]?.[x] === "#";
  const key = (x: number, y: number) => `${x},${y}`;
  const beside = (t: Vec) =>
    STEPS.map(([dx, dy]) => ({ x: t.x + dx, y: t.y + dy })).filter((n) => wall(n.x, n.y));
  const starts = beside(anchor);
  const goals = new Set(beside(remote).map((t) => key(t.x, t.y)));
  if (starts.length === 0 || goals.size === 0) return straight;
  const prev = new Map<string, Vec | null>();
  const queue: Vec[] = [];
  for (const s of starts) {
    prev.set(key(s.x, s.y), null);
    queue.push(s);
  }
  for (let i = 0; i < queue.length; i++) {
    const t = queue[i] as Vec;
    if (goals.has(key(t.x, t.y))) {
      const route: Vec[] = [];
      for (let n: Vec | null | undefined = t; n; n = prev.get(key(n.x, n.y))) route.unshift(n);
      const manhattan = Math.abs(anchor.x - remote.x) + Math.abs(anchor.y - remote.y);
      if (route.length > 2 * manhattan) return straight;
      return [centre(anchor), ...route.map(centre), centre(remote)];
    }
    for (const [dx, dy] of STEPS) {
      const x = t.x + dx;
      const y = t.y + dy;
      if (wall(x, y) && !prev.has(key(x, y))) {
        prev.set(key(x, y), t);
        queue.push({ x, y });
      }
    }
  }
  return straight;
}
