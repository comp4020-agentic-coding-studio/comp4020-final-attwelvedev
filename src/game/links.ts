import type { Vec } from "./types.ts";

const STEPS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const centre = (t: Vec): Vec => ({ x: t.x + 0.5, y: t.y + 0.5 });

// The wire from a station's anchor to its remote part (a safe's back, a music box's tune), as points
// in tile space: along wall tiles (a door in a wall counts) from one beside the anchor to one beside the remote part, found
// by breadth-first search. With no such wall route, or one more than twice the Manhattan distance
// (it would wander round a room for a short gap), it is a straight line. No remote tile, no wire.
export function linkPath(tiles: readonly string[], anchor: Vec, remote: Vec | undefined): Vec[] {
  if (!remote) return [];
  const straight = [centre(anchor), centre(remote)];
  // a door in a wall row is part of that wall to a wire (it runs over the lintel), so a secret door
  // between a corridor and a chamber does not break the run
  const wall = (x: number, y: number) => tiles[y]?.[x] === "#" || tiles[y]?.[x] === "D";
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

// The part of a station that `linkOf` reads: its type, whether it is a cache's, and where its parts stand.
export interface LinkStation {
  type: string;
  cache?: true;
  parts: { key: string; at: Vec[] }[];
}

// Whether a wall, glass pane or vent tile lies on the straight line between two tiles' centres
// (not counting the two tiles themselves): sampled finely enough to touch every tile it crosses.
function wallBetween(tiles: readonly string[], a: Vec, b: Vec): boolean {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 8);
  for (let i = 1; i < steps; i++) {
    const x = Math.floor(a.x + 0.5 + ((b.x - a.x) * i) / steps);
    const y = Math.floor(a.y + 0.5 + ((b.y - a.y) * i) / steps);
    if ((x === a.x && y === a.y) || (x === b.x && y === b.y)) continue;
    if ("#=%".includes(tiles[y]?.[x] ?? ".")) return true;
  }
  return false;
}

// A station's wire as points in tile space, or null when it has none (drawn by `drawLink`).
export function linkOf(st: LinkStation, tiles: readonly string[] | undefined): Vec[] | null {
  const at = (key: string) => st.parts.find((p) => p.key === key)?.at[0];
  const anchor = at("anchor");
  const remote = at(st.type === "dial" ? "back" : "tune");
  if (!anchor || !remote || !tiles || (st.type !== "dial" && st.type !== "bells")) return null;
  // a safe's back box is wired only when something solid is between it and the dial (the same open
  // floor needs no wire to be understood); a music box's tune box always is
  if (st.type === "dial" && (st.cache || !wallBetween(tiles, anchor, remote))) return null;
  const path = linkPath(tiles, anchor, remote);
  if (st.type === "bells") {
    // the wire meets the bells in the middle of them, not at the first bell
    const bells = st.parts.find((p) => p.key === "bells")?.at ?? [];
    if (bells.length > 0 && path.length > 0)
      path[0] = {
        x: bells.reduce((n, t) => n + t.x, 0) / bells.length + 0.5,
        y: bells.reduce((n, t) => n + t.y, 0) / bells.length + 0.5,
      };
  }
  return path.length < 2 ? null : path;
}
