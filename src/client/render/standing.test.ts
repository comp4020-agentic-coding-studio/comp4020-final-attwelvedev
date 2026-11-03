import { describe, expect, it } from "vitest";
import { inLight, lightPolygon } from "../../game/light.ts";
import type { EntityView } from "../../net/protocol.ts";
import { camera, draw, type Scene } from "../render.ts";
import { WORLD } from "../tokens.ts";
import { LIVE, toScreen } from "./project.ts";

// The user's rule for what stands (a safe, a box, a figure): it is cut by the exact light, and the cut
// goes straight up. A point on the thing is drawn only if the ground directly under it is lit, with no
// strips left clear inside it and nothing lit "through" it from floor in front, and the mist is never
// painted over it. Measured on the real draw's recorded canvas calls: the clip active when the safe's
// body is drawn is replayed and compared, point by point, with the light polygon.

interface Op {
  name: string;
  args: unknown[];
  fillStyle?: string;
  globalAlpha?: number;
}
type P = { x: number; y: number };

function recorder() {
  const ops: Op[] = [];
  const state: Record<string, unknown> = {
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    lineWidth: 1,
  };
  const saved: Record<string, unknown>[] = [];
  const ctx = new Proxy(
    {},
    {
      get: (_t, name) => {
        if (String(name) in state) return state[String(name)];
        // a save and a restore are in the trace, and a restore puts back the alpha and colours it saved
        if (name === "save")
          return () => {
            saved.push({ ...state });
            ops.push({ name: "save", args: [], ...state } as Op);
          };
        if (name === "restore")
          return () => {
            Object.assign(state, saved.pop());
            ops.push({ name: "restore", args: [], ...state } as Op);
          };
        if (name === "createLinearGradient") return () => ({ addColorStop() {} });
        if (name === "measureText") return () => ({ width: 10 });
        return (...args: unknown[]) => {
          ops.push({ name: String(name), args, ...state } as Op);
        };
      },
      set: (_t, name, value) => {
        state[String(name)] = value;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, ops };
}

// The subpaths drawn since the last beginPath before op `end`.
function pathBefore(ops: Op[], end: number): P[][] {
  let start = end - 1;
  while (start >= 0 && ops[start]?.name !== "beginPath") start--;
  const out: P[][] = [];
  let cur: P[] = [];
  const flush = () => {
    if (cur.length > 1) out.push(cur);
    cur = [];
  };
  for (const o of ops.slice(start + 1, end)) {
    const a = o.args as number[];
    if (o.name === "moveTo") {
      flush();
      cur = [{ x: a[0] as number, y: a[1] as number }];
    } else if (o.name === "lineTo") cur.push({ x: a[0] as number, y: a[1] as number });
    else if (o.name === "closePath") flush();
    else if (o.name === "rect") {
      flush();
      const [x, y, w, h] = a as [number, number, number, number];
      out.push([
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ]);
    }
  }
  flush();
  return out;
}

function winding(poly: P[], x: number, y: number): number {
  let w = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j] as P;
    const b = poly[i] as P;
    const side = (b.x - a.x) * (y - a.y) - (x - a.x) * (b.y - a.y);
    if (a.y <= y) {
      if (b.y > y && side > 0) w++;
    } else if (b.y <= y && side < 0) w--;
  }
  return w;
}
const covered = (polys: P[][], rule: "nonzero" | "evenodd", p: P): boolean => {
  const sum = polys.reduce((n, q) => n + winding(q, p.x, p.y), 0);
  const cross = polys.reduce((n, q) => n + (winding(q, p.x, p.y) !== 0 ? 1 : 0), 0);
  return rule === "evenodd" ? cross % 2 === 1 : sum !== 0;
};

// Every clip still open at op `at` (a save/restore pair closes the clips made inside it).
function clipsAt(ops: Op[], at: number): P[][][] {
  const stack: P[][][][] = [[]];
  ops.slice(0, at).forEach((o, i) => {
    if (o.name === "save") stack.push([...(stack[stack.length - 1] as P[][][])]);
    else if (o.name === "restore") stack.pop();
    else if (o.name === "clip") (stack[stack.length - 1] as P[][][]).push(...[pathBefore(ops, i)]);
  });
  return stack[stack.length - 1] as P[][][];
}
const drawnAt = (ops: Op[], at: number, p: P) =>
  clipsAt(ops, at).every((polys) => covered(polys, "nonzero", p));

const distToEdge = (poly: readonly P[], q: P): number => {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j] as P;
    const b = poly[i] as P;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / len));
    best = Math.min(best, Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy)));
  }
  return best;
};

// A corridor one tile wide (x = 5) under a two-row room, as in room 4: from the corridor the cone widens
// up the room, its edge crosses the safe at (6, 1) at an angle that moves with the viewer, and the floor
// round the safe is veiled where the cone does not reach (so a veil over the safe would show).
const TILES = [
  "############",
  "#..........#",
  "#...#......#",
  "#####.######",
  "#####.######",
  "#####.######",
  "############",
];
const SAFE: EntityView = {
  id: "Q1",
  kind: "station",
  pos: { x: 6.5, y: 1.5 },
  station: {
    type: "dial",
    shows: [0],
    solved: false,
    parts: [{ key: "anchor", at: [{ x: 6, y: 1 }] }],
  },
};
const SEEN = Array.from({ length: TILES.length }, (_, y) => `${y}:0-11`);
const sceneAt = (x: number, y: number): Scene => ({
  layout: "fit",
  w: 600,
  h: 320,
  role: "deaf",
  seat: 1,
  roles: ["blind", "deaf", "mute"],
  tiles: TILES,
  seen: SEEN,
  entities: [SAFE],
  self: { x, y },
});

function frame(x: number, y: number) {
  const s = sceneAt(x, y);
  const { ctx, ops } = recorder();
  draw(ctx, s);
  const cam = camera(s);
  const light = lightPolygon({ x, y }, TILES);
  // the body's front face is the one fillRect in the steel front colour
  const body = ops.findIndex((o) => o.name === "fillRect" && o.fillStyle === WORLD.steelFront);
  return { ops, cam, light, body };
}

const VIEWERS: P[] = [];
for (let y = 3.05; y <= 5.45; y += 0.2)
  for (let x = 5.05; x <= 5.95; x += 0.1) VIEWERS.push({ x, y });

// Points on the safe's two faces, each with the ground point directly under it. The body is a box at
// x 6.1 to 6.9, y 1.15 to 1.85, LIVE.block high: the front face stands on y = 1.85, the top is at the
// box's height and covers y 1.15 to 1.85.
function samples(cam: ReturnType<typeof camera>): { screen: P; ground: P }[] {
  const out: { screen: P; ground: P }[] = [];
  for (let x = 6.15; x <= 6.85; x += 0.1) {
    for (let z = 0.05; z < LIVE.block; z += 0.1)
      out.push({ screen: toScreen(cam, x, 1.85, z), ground: { x, y: 1.85 } });
    for (let gy = 1.2; gy <= 1.8; gy += 0.1)
      out.push({ screen: toScreen(cam, x, gy, LIVE.block), ground: { x, y: gy } });
  }
  return out;
}

describe("what stands is cut by the light's own column", () => {
  it("draws a point of the safe exactly when the ground under it is lit", () => {
    const wrong: string[] = [];
    let lit = 0;
    let dark = 0;
    for (const v of VIEWERS) {
      const { ops, cam, light, body } = frame(v.x, v.y);
      for (const { screen, ground } of samples(cam)) {
        if (distToEdge(light, ground) < 0.04) continue; // on the edge itself either answer is fair
        const want = inLight(light, ground);
        if (want) lit++;
        else dark++;
        // a safe none of whose ground is lit is not drawn at all, which is the same as cut everywhere
        const drawn = body > -1 && drawnAt(ops, body, screen);
        if (drawn !== want)
          wrong.push(
            `viewer ${v.x.toFixed(2)},${v.y.toFixed(2)} ground ${ground.x.toFixed(2)},${ground.y.toFixed(2)} should be ${want ? "drawn" : "cut"}`,
          );
      }
    }
    // the sweep must have met both a lit and an unlit part of the safe, or this proved nothing
    expect(lit, "samples in the light").toBeGreaterThan(50);
    expect(dark, "samples out of the light").toBeGreaterThan(50);
    expect(wrong.slice(0, 5), `${wrong.length} points wrong`).toEqual([]);
  });

  // The user (the pink rectangle over a figure): the mist painted after what stands veiled a lit thing, and
  // a hole cut in it for the thing was a rectangle wider than the thing. So the floor is veiled FIRST and
  // what stands is drawn over it, never under a veil. The scene has veiled floor behind the safe's top
  // (the pillar's shadow and the room's far side), so a veil painted last would cover it.
  it("veils the floor before it draws the safe, so a lit safe is never veiled", () => {
    let overVeil = 0;
    const late: string[] = [];
    for (const v of VIEWERS) {
      const { ops, cam, light, body } = frame(v.x, v.y);
      const floorVeils = ops.flatMap((o, i) =>
        o.name === "fill" && o.fillStyle === WORLD.mist && o.args[0] === "evenodd" ? [i] : [],
      );
      expect(floorVeils.length, "the floor is veiled once").toBe(1);
      for (const { screen, ground } of samples(cam)) {
        if (distToEdge(light, ground) < 0.04 || !inLight(light, ground)) continue;
        const under = {
          x: (screen.x - cam.ox) / cam.scale,
          y: (screen.y - cam.oy) / (cam.scale * LIVE.depth),
        };
        if (distToEdge(light, under) > 0.04 && !inLight(light, under)) overVeil++;
      }
      if (body > -1 && (floorVeils[0] as number) > body)
        late.push(`viewer ${v.x.toFixed(2)},${v.y.toFixed(2)}`);
    }
    expect(overVeil, "lit parts of the safe whose pixels lie over veiled floor").toBeGreaterThan(
      20,
    );
    expect(late.slice(0, 3), `${late.length} frames veil the floor after the safe`).toEqual([]);
  });

  // The user: the feathered edge was ugly (visible steps across the dial). The cut is exact: a thing is
  // drawn once, at full strength, and what the cone's edge crosses is cut on the edge itself, never faded.
  it("draws the safe once at full strength, cut on the edge and never faded", () => {
    const { ops, body } = frame(5.5, 4.5);
    expect(body, "the safe is drawn").toBeGreaterThan(-1);
    const draws = ops.flatMap((o, i) =>
      o.name === "fillRect" && (o.fillStyle === WORLD.steel || o.fillStyle === WORLD.steelFront)
        ? [i]
        : [],
    );
    expect(draws.length, "the body's top and front are each drawn once").toBe(2);
    for (const i of draws) expect(ops[i]?.globalAlpha, "at full strength").toBe(1);
  });
});
