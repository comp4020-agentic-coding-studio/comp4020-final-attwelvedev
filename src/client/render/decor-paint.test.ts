import { afterEach, describe, expect, it } from "vitest";
import { mix, setContrast, WORLD } from "../tokens.ts";
import { wall } from "./blocks.ts";
import { drawSlide } from "./chamber.ts";
import { type DecorItem, type DecorKind, KIND_FACES, LIT, THEME_KINDS } from "./decor.ts";
import { MUTE } from "./decor-paint/civic.ts";
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

// The rules (DESIGN.md §4.9, ADR 0029): decor shows real things with a job, and never a clue, a game
// object or glass. These guard rules 2 to 6 over every kind, face and look.
const alphaOf = (style: unknown): number => {
  if (typeof style !== "string") return 1;
  const hex = /^#[0-9a-f]{8}$/i.exec(style);
  if (hex) return Number.parseInt(style.slice(7, 9), 16) / 255;
  const rgba = /rgba?\(([^)]*)\)/i.exec(style);
  if (rgba) {
    const parts = (rgba[1] as string).split(/[\s,/]+/).filter(Boolean);
    if (parts.length >= 4) {
      const a = parts[3] as string;
      return a.endsWith("%") ? Number.parseFloat(a) / 100 : Number.parseFloat(a);
    }
  }
  return 1;
};
const FILLS = new Set(["fill", "fillRect"]);
const STROKES = new Set(["stroke", "strokeRect"]);

describe("the rules", () => {
  it("rule 2: no painter writes text", () => {
    for (const item of items())
      for (const o of paint(item).ops)
        expect(["fillText", "strokeText"], item.kind).not.toContain(o.name);
  });

  it("rule 6: no painter fills or strokes in WORLD.line, the mark of a solid thing", () => {
    for (const item of items())
      for (const o of paint(item).ops) {
        if (STROKES.has(o.name)) expect(o.strokeStyle, item.kind).not.toBe(WORLD.line);
        if (FILLS.has(o.name)) expect(o.fillStyle, item.kind).not.toBe(WORLD.line);
      }
  });

  it("rule 5: no painter draws in glass's colours, and no gradient but the glow", () => {
    const glassy = [WORLD.glass, WORLD.glassFront];
    for (const item of items()) {
      const { ops, grads } = paint(item);
      for (const o of ops) {
        if (FILLS.has(o.name)) expect(glassy, item.kind).not.toContain(o.fillStyle);
        if (STROKES.has(o.name)) expect(glassy, item.kind).not.toContain(o.strokeStyle);
      }
      // a sheen band is a gradient across a face: the only gradient decor makes is a lit item's glow
      for (const g of grads) {
        expect(g.kind, item.kind).toBe("createRadialGradient");
        for (const [, c] of g.stops) expect(c.slice(0, 7), item.kind).toBe(WORLD.sconce);
      }
    }
  });

  it("rule 5: nothing is translucent (under 0.9 alpha) but a glow", () => {
    for (const item of items())
      for (const o of paint(item).ops) {
        const isGlow = typeof o.fillStyle === "object" && o.fillStyle !== null;
        if (FILLS.has(o.name) && !isGlow)
          expect(o.globalAlpha * alphaOf(o.fillStyle), item.kind).toBeGreaterThanOrEqual(0.9);
        if (STROKES.has(o.name))
          expect(o.globalAlpha * alphaOf(o.strokeStyle), item.kind).toBeGreaterThanOrEqual(0.9);
      }
  });

  it("rule 4: a glow is drawn only inside the face's clip, at or under 0.35 alpha", () => {
    for (const item of items()) {
      const { ops } = paint(item);
      const clip = ops.findIndex((o) => o.name === "clip");
      ops.forEach((o, i) => {
        if (!FILLS.has(o.name) || typeof o.fillStyle !== "object" || o.fillStyle === null) return;
        expect(i, item.kind).toBeGreaterThan(clip);
        expect(o.globalAlpha, item.kind).toBeLessThanOrEqual(0.35);
      });
    }
  });

  // rule 2: the manuscript shows staves, bar lines and a clef; a note head (a filled ellipse or
  // circle) would read as a tune to play
  it("the manuscript draws bar lines and a clef and no filled ellipse or circle", () => {
    for (const v of [0, 1]) {
      const { ops } = paint({ x: 0, y: 0, face: "front", kind: "manuscript", variant: v });
      const names = ops.map((o) => o.name);
      expect(names).not.toContain("ellipse");
      expect(names).not.toContain("arc");
      expect(names).toContain("quadraticCurveTo"); // the clef
      const bars = ops.filter(
        (o) => o.name === "fillRect" && (o.args[2] as number) < 1 && (o.args[3] as number) > 2,
      );
      expect(bars.length).toBeGreaterThanOrEqual(8); // 4 bar lines a stave, 2 or 3 staves
    }
  });

  it("an unlit sconce draws no gradient, and a lit lamp does", () => {
    for (const v of [0, 1, 2, 3]) {
      const dim = paint({ x: 0, y: 0, face: "front", kind: "sconceDim", variant: v });
      expect(dim.grads).toEqual([]);
      const lit = paint({ x: 0, y: 0, face: "front", kind: "bankerLamp", variant: v, lit: true });
      expect(lit.grads.length).toBeGreaterThan(0);
    }
  });

  // rule 2: a painting's colours are code colours mixed at least 70 % toward the wall, so no code
  // (a colour order, a pair) can be read off one
  it("the gallery's paintings use no code colour at more than 30 % strength", () => {
    expect(MUTE).toBeGreaterThanOrEqual(0.7);
    const codes = [
      WORLD.codeRed,
      WORLD.codeBlue,
      WORLD.codeYellow,
      WORLD.codeGreen,
      WORLD.codeWhite,
    ];
    const strong = codes.flatMap((k) => [0, 0.1, 0.2, 0.3].map((t) => mix(k, WORLD.wallFront, t)));
    for (const v of [0, 1, 2, 3]) {
      const { ops } = paint({ x: 0, y: 0, face: "front", kind: "painting", variant: v, lit: true });
      for (const o of ops.filter((o) => FILLS.has(o.name)))
        expect(strong, `variant ${v}`).not.toContain(o.fillStyle);
    }
  });

  // rule 3: no slats or rails. A band is a string-filled fillRect wider than half the face and at
  // most 2 px tall; three or more on one item read as slats. Kinds allowed more, each with its reason:
  const BANDS_OK: Partial<Record<DecorKind, string>> = {};
  // Fills whose rows overlap or touch are one band: a rod drawn as a body with a lit edge and a shade
  // edge (litBox) is one rail to the eye, not three. A thin fill inside a taller one drawn before it
  // is that box's own edge (a strap's, a frame's), not a rail across the face.
  const bandsOf = (ops: Op[]): [number, number][] => {
    const rects = ops.flatMap((o, i) =>
      o.name === "fillRect" && typeof o.fillStyle === "string"
        ? [
            {
              i,
              x: o.args[0] as number,
              y: o.args[1] as number,
              w: o.args[2] as number,
              h: o.args[3] as number,
            },
          ]
        : [],
    );
    const inBox = (r: (typeof rects)[number]) =>
      rects.some(
        (b) =>
          b.i < r.i &&
          b.h > 2 &&
          b.x <= r.x + 0.01 &&
          b.x + b.w >= r.x + r.w - 0.01 &&
          b.y <= r.y + 0.01 &&
          b.y + b.h >= r.y + r.h - 0.01,
      );
    const rows = rects
      .filter((r) => r.w > W / 2 && r.h <= 2 && !inBox(r))
      .map((r) => [r.y, r.y + r.h] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    const out: [number, number][] = [];
    for (const [y0, y1] of rows) {
      const last = out.at(-1);
      if (last && y0 <= last[1] + 0.01) last[1] = Math.max(last[1], y1);
      else out.push([y0, y1]);
    }
    return out;
  };
  it("rule 3: no item draws more than 2 horizontal bands across half its face", () => {
    for (const item of items()) {
      if (BANDS_OK[item.kind]) continue;
      const bands = bandsOf(paint(item).ops);
      expect(
        bands.length,
        `${item.kind} ${item.face} ${item.variant} ${JSON.stringify(bands)}`,
      ).toBeLessThanOrEqual(2);
    }
  });

  // rule 3: no dial or gauge face. A near-round arc or ellipse (|rx − ry| < 0.2 of the larger) of
  // radius 0.15 of the face's width or more reads as one. Kinds allowed a bigger one, with a reason:
  const ROUND_OK: Partial<Record<DecorKind, string>> = {
    violin:
      "its lower bout is the instrument's body (0.15 by 0.13 of the face), crossed by the strings and neck: a violin, not a dial",
  };
  it("rule 3: no item draws a near-round circle of radius ≥ 0.15 of its face", () => {
    for (const item of items()) {
      if (ROUND_OK[item.kind]) continue;
      for (const o of paint(item).ops) {
        const [rx, ry] =
          o.name === "arc"
            ? [o.args[2] as number, o.args[2] as number]
            : o.name === "ellipse"
              ? [o.args[2] as number, o.args[3] as number]
              : [0, 0];
        const r = Math.max(rx, ry);
        if (r > 0 && Math.abs(rx - ry) < 0.2 * r)
          expect(r, `${item.kind} ${item.face} ${item.variant} (${rx} by ${ry})`).toBeLessThan(
            0.15 * W,
          );
      }
    }
  });

  it("every theme kind has a painter", () => {
    for (const k of KINDS) expect(PAINTERS[k], k).toBeTypeOf("function");
  });
});
