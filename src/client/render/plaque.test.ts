import { describe, expect, it } from "vitest";
import type { EntityView } from "../../net/protocol.ts";
import { camera, draw, type Scene } from "../render.ts";
import { plaqueBox } from "./stations.ts";

// A plaque's plate floats over its tile and is up to four tiles wide, so the cone's edge can fall
// across it. The plate is whole whenever its sign is in sight: the light never cuts its words.

interface Op {
  name: string;
  args: unknown[];
}
type P = { x: number; y: number };

function recorder() {
  const ops: Op[] = [];
  const state: Record<string, unknown> = { fillStyle: "", strokeStyle: "", globalAlpha: 1 };
  const ctx = new Proxy(
    {},
    {
      get: (_t, name) => {
        if (String(name) in state) return state[String(name)];
        if (name === "createLinearGradient" || name === "createRadialGradient")
          return () => ({ addColorStop() {} });
        if (name === "measureText") return (t: string) => ({ width: t.length * 6 });
        return (...args: unknown[]) => {
          ops.push({ name: String(name), args });
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

const winding = (poly: P[], x: number, y: number): number => {
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
};

// Whether every clip open at op `at` lets the point through.
function drawnAt(ops: Op[], at: number, p: P): boolean {
  const stack: P[][][][] = [[]];
  let path: P[][] = [];
  ops.slice(0, at).forEach((o) => {
    const a = o.args as number[];
    if (o.name === "save") stack.push([...(stack[stack.length - 1] as P[][][])]);
    else if (o.name === "restore") stack.pop();
    else if (o.name === "beginPath") path = [];
    else if (o.name === "moveTo") path.push([{ x: a[0] as number, y: a[1] as number }]);
    else if (o.name === "lineTo")
      path[path.length - 1]?.push({ x: a[0] as number, y: a[1] as number });
    else if (o.name === "clip") (stack[stack.length - 1] as P[][][]).push(path.map((q) => [...q]));
  });
  return (stack[stack.length - 1] as P[][][]).every(
    (polys) => polys.reduce((n, q) => n + winding(q, p.x, p.y), 0) !== 0,
  );
}

// A corridor under a wide room: from the corridor the cone's edge crosses the plate of a sign high on
// the room's right.
const TILES = [
  "##############",
  "#............#",
  "#............#",
  "#............#",
  "######.#######",
  "######.#######",
  "######.#######",
  "##############",
];
const TEXT = "Bare of red, the bundle gives up its second.";
const SIGN: EntityView = { id: "S1", kind: "sign", pos: { x: 9.5, y: 1.5 }, shows: [], text: TEXT };
const scene = (w: number): Scene => ({
  layout: "fit",
  w,
  h: 600,
  role: "deaf",
  seat: 1,
  roles: ["blind", "deaf", "mute"],
  tiles: TILES,
  seen: Array.from({ length: TILES.length }, (_, y) => `${y}:0-13`),
  entities: [SIGN],
  self: { x: 6.5, y: 5.5 },
});

describe("a plaque is never cut by the light", () => {
  it("draws every word of the plate, wherever the cone's edge falls across it", () => {
    for (const w of [1280, 375]) {
      const s = scene(w);
      const { ctx, ops } = recorder();
      draw(ctx, s);
      const box = plaqueBox(recorder().ctx, SIGN, camera(s), s);
      if (!box) throw new Error("no plate");
      const words = ops
        .map((o, i) => ({ o, i }))
        .filter(({ o }) => o.name === "fillText" && TEXT.includes(String(o.args[0])));
      expect(words.length, `the plate's lines at ${w}`).toBe(box.lines.length);
      const cut = words.filter(
        ({ o, i }) =>
          ![0.1, 0.5, 0.9].every((f) =>
            drawnAt(ops, i, { x: box.x + box.w * f, y: o.args[2] as number }),
          ),
      );
      expect(
        cut.map(({ o }) => o.args[0]),
        `lines cut by the light at ${w}`,
      ).toEqual([]);
    }
  });
});
