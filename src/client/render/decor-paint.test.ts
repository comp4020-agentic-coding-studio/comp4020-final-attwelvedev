import { afterEach, describe, expect, it } from "vitest";
import { setContrast, WORLD } from "../tokens.ts";
import { wall } from "./blocks.ts";
import { drawSlide } from "./chamber.ts";
import { type DecorItem, type DecorKind, KIND_FACES, LIT, THEME_KINDS } from "./decor.ts";
import { PAINTERS, paintDecor } from "./decor-paint.ts";
import { type Camera, setRise } from "./project.ts";

// A canvas that records each call with the state it was made in (after render.test.ts's recorder),
// and the stops and alpha of each gradient made.
interface Op {
  name: string;
  args: unknown[];
  fillStyle: unknown;
  strokeStyle: unknown;
  globalAlpha: number;
}
function recorder() {
  const ops: Op[] = [];
  const grads: { kind: string; stops: [number, string][] }[] = [];
  const state = { fillStyle: "" as unknown, strokeStyle: "" as unknown, globalAlpha: 1 } as Record<
    string,
    unknown
  >;
  const saved: Record<string, unknown>[] = [];
  const ctx = new Proxy(
    {},
    {
      get: (_t, name) => {
        if (String(name) in state) return state[String(name)];
        if (name === "save")
          return () => {
            saved.push({ ...state });
            ops.push({ name: "save", args: [], ...state } as unknown as Op);
          };
        if (name === "restore")
          return () => {
            Object.assign(state, saved.pop());
            ops.push({ name: "restore", args: [], ...state } as unknown as Op);
          };
        if (name === "createLinearGradient" || name === "createRadialGradient")
          return () => {
            const g = { kind: String(name), stops: [] as [number, string][] };
            grads.push(g);
            return { addColorStop: (o: number, c: string) => g.stops.push([o, c]) };
          };
        return (...args: unknown[]) => {
          ops.push({ name: String(name), args, ...state } as unknown as Op);
        };
      },
      set: (_t, name, value) => {
        state[String(name)] = value;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, ops, grads };
}

const W = 48;
const H = 52;
const KINDS = [...new Set(Object.values(THEME_KINDS).flat())] as DecorKind[];
const items = (): DecorItem[] =>
  KINDS.flatMap((kind) =>
    KIND_FACES[kind].flatMap((face) =>
      [0, 1, 2, 3].map((variant) => ({
        x: 0,
        y: 0,
        face,
        kind,
        variant,
        ...(LIT.has(kind) ? { lit: true as const } : {}),
      })),
    ),
  );
const paint = (item: DecorItem) => {
  const r = recorder();
  paintDecor(r.ctx, item, W, H);
  return r;
};
const DRAWS = new Set(["fill", "fillRect", "stroke", "strokeRect", "drawImage", "fillText"]);

afterEach(() => setContrast(false));

describe("paintDecor", () => {
  it("every kind clips to its face rect before it paints anything", () => {
    for (const item of items()) {
      const { ops } = paint(item);
      const clip = ops.findIndex((o) => o.name === "clip");
      const rect = ops.findIndex((o) => o.name === "rect");
      const first = ops.findIndex((o) => DRAWS.has(o.name));
      expect(clip, item.kind).toBeGreaterThan(-1);
      expect(ops[rect]?.args, item.kind).toEqual([0, 0, W, H]);
      expect(rect).toBeLessThan(clip);
      expect(first, item.kind).toBeGreaterThan(clip);
      // the clip is undone at the end: the last op is its restore
      expect(ops.at(-1)?.name).toBe("restore");
    }
  });

  it("a lit item's glow is a radial gradient of WORLD.sconce at ≤ 0.35 alpha", () => {
    for (const item of items().filter((i) => i.lit)) {
      const { ops, grads } = paint(item);
      const radial = grads.filter((g) => g.kind === "createRadialGradient");
      expect(radial.length, item.kind).toBeGreaterThan(0);
      for (const g of radial)
        for (const [, c] of g.stops) expect(c.slice(0, 7), item.kind).toBe(WORLD.sconce);
      const glowFills = ops.filter(
        (o) => o.name === "fillRect" && typeof o.fillStyle === "object" && o.fillStyle !== null,
      );
      expect(glowFills.length).toBeGreaterThan(0);
      for (const o of glowFills) expect(o.globalAlpha).toBeLessThanOrEqual(0.35);
    }
    // an unlit item makes no glow
    for (const item of items().filter((i) => !i.lit))
      expect(paint(item).grads.filter((g) => g.kind === "createRadialGradient")).toEqual([]);
  });

  it("no decor painter ever strokes in WORLD.line", () => {
    for (const item of items()) {
      const { ops } = paint(item);
      for (const o of ops) {
        if (o.name === "stroke" || o.name === "strokeRect")
          expect(o.strokeStyle).not.toBe(WORLD.line);
        if (DRAWS.has(o.name)) expect(o.fillStyle, item.kind).not.toBe(WORLD.line);
      }
    }
  });

  it("in high contrast paintDecor draws nothing", () => {
    setContrast(true);
    for (const item of items()) expect(paint(item).ops, item.kind).toEqual([]);
  });
});

describe("decor in the wall", () => {
  const cam: Camera = { scale: 48, ox: 0, oy: 0 };
  afterEach(() => setRise(1));

  it("decor is drawn inside its wall's save/restore, after the wall's own fills", () => {
    setRise(1);
    const front: DecorItem = { x: 2, y: 3, face: "front", kind: "cladding", variant: 0 };
    const bare = recorder();
    wall(bare.ctx, cam, 2, 3, true);
    const r = recorder();
    // the wall itself is called inside the caller's save/restore (render/index.ts)
    r.ctx.save();
    wall(r.ctx, cam, 2, 3, true, { front });
    r.ctx.restore();
    // the wall's own ops come first, unchanged; the decor follows, before the caller's restore
    const names = r.ops.map((o) => o.name);
    const wallOps = bare.ops.map((o) => o.name);
    expect(names.slice(1, 1 + wallOps.length)).toEqual(wallOps);
    const clip = names.indexOf("clip");
    expect(clip).toBeGreaterThan(wallOps.length);
    expect(names.at(-1)).toBe("restore");
    expect(names.slice(clip).filter((n) => DRAWS.has(n)).length).toBeGreaterThan(0);
    // and a wall with no decor paints none
    expect(wallOps).not.toContain("clip");
  });

  it("a sliding secret wall draws its decor shorter at age 0.5 than at 0", () => {
    setRise(1);
    const front: DecorItem = { x: 3, y: 5, face: "front", kind: "cladding", variant: 0 };
    const clipH = (age: number) => {
      const r = recorder();
      drawSlide(r.ctx, { x: 3.5, y: 5.5 }, cam, age, false, { front });
      const rect = r.ops.find((o) => o.name === "rect");
      return (rect?.args[3] as number) ?? -1;
    };
    expect(clipH(0)).toBeGreaterThan(0);
    expect(clipH(0.5)).toBeLessThan(clipH(0));
    expect(clipH(0.5)).toBeGreaterThan(0);
  });
});

// The banned list (FR12): no painter makes a dial or bell face, slats or rails, or a note head.
describe("banned shapes", () => {
  // kinds allowed a bigger circle, each with its reason: none today. (A sconce's bulb is 0.1 of the
  // face across, under the limit.)
  const BIG_ARC_OK: Partial<Record<DecorKind, string>> = {};
  it("no painter draws a circle of radius ≥ 0.15 of the face", () => {
    for (const item of items()) {
      if (BIG_ARC_OK[item.kind]) continue;
      for (const o of paint(item).ops) {
        if (o.name === "arc") expect(o.args[2] as number, item.kind).toBeLessThan(0.15 * W);
        if (o.name === "ellipse") {
          // a near-round ellipse is a circle too
          const [rx, ry] = o.args.slice(2, 4) as number[];
          if (
            Math.abs((rx as number) - (ry as number)) <
            0.2 * Math.max(rx as number, ry as number)
          )
            expect(Math.max(rx as number, ry as number), item.kind).toBeLessThan(0.15 * W);
        }
      }
    }
  });

  it("no painter draws more than 2 horizontal lines across half the face, but the staff's 5", () => {
    for (const item of items()) {
      const lines = paint(item).ops.filter(
        (o) =>
          o.name === "fillRect" &&
          (o.args[2] as number) > W / 2 &&
          (o.args[3] as number) <= 2 &&
          typeof o.fillStyle === "string",
      );
      expect(lines.length, item.kind).toBeLessThanOrEqual(item.kind === "staff" ? 5 : 2);
    }
  });

  it("the staff draws no filled ellipse or circle (it carries no notes)", () => {
    for (const item of items().filter((i) => i.kind === "staff")) {
      const names = paint(item).ops.map((o) => o.name);
      expect(names).not.toContain("ellipse");
      expect(names).not.toContain("arc");
    }
  });

  it("an unlit sconce draws no gradient, and a lit one does", () => {
    for (const v of [0, 1, 2, 3]) {
      const dim = paint({ x: 0, y: 0, face: "front", kind: "sconceDim", variant: v });
      expect(dim.grads).toEqual([]);
      const lit = paint({ x: 0, y: 0, face: "front", kind: "sconce", variant: v, lit: true });
      expect(lit.grads.length).toBeGreaterThan(0);
    }
  });

  it("no painter draws a single leaf wider than 0.2 of the face", () => {
    for (const item of items().filter((i) => ["ivy", "planter", "fern"].includes(i.kind)))
      for (const o of paint(item).ops)
        if (o.name === "ellipse")
          expect(2 * Math.max(o.args[2] as number, o.args[3] as number), item.kind).toBeLessThan(
            0.2 * W,
          );
  });

  it("the trellis is diagonal only: no horizontal or vertical stroke segment", () => {
    for (const v of [0, 1]) {
      const { ops } = paint({ x: 0, y: 0, face: "front", kind: "trellis", variant: v });
      const moves = ops.filter((o) => o.name === "moveTo" || o.name === "lineTo");
      expect(moves.length).toBeGreaterThan(0);
      for (let i = 0; i < moves.length; i += 2) {
        const [x0, y0] = (moves[i]?.args ?? []) as number[];
        const [x1, y1] = (moves[i + 1]?.args ?? []) as number[];
        expect(x0).not.toBe(x1);
        expect(y0).not.toBe(y1);
      }
    }
  });

  it("every theme kind has a painter", () => {
    for (const k of KINDS) expect(PAINTERS[k], k).toBeTypeOf("function");
  });
});
