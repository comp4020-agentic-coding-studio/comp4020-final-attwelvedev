import { describe, expect, it } from "vitest";
import type { EntityView } from "../../net/protocol.ts";
import type { Fx } from "../fx.ts";
import { draw as drawScene, type Scene } from "../render.ts";
import { WORLD } from "../tokens.ts";
import { drawStationStanding } from "./stations.ts";

// A cut wire is drawn cut (G1, wire cut and station bob Task 3): two pieces with a gap and a hatch,
// never colour alone; the snip lifts the halves apart and settles; reduced motion draws the end state.

// The canvas calls a draw makes, by name, with their arguments and the colour each fill used.
function recorder() {
  const calls: { name: string; args: unknown[]; style: string }[] = [];
  const state: Record<string, unknown> = { fillStyle: "", strokeStyle: "", globalAlpha: 1 };
  const ctx = new Proxy(
    {},
    {
      get: (_t, name) => {
        const key = String(name);
        if (key in state) return state[key];
        if (key === "measureText") return () => ({ width: 10 });
        if (key === "createLinearGradient" || key === "createRadialGradient")
          return () => ({ addColorStop: () => {} });
        return (...args: unknown[]) =>
          calls.push({ name: key, args, style: String(state.fillStyle) });
      },
      set: (_t, name, value) => {
        state[String(name)] = value;
        return true;
      },
    },
  ) as CanvasRenderingContext2D;
  return { ctx, calls };
}

const panel = (cut?: number[]): EntityView => ({
  id: "Q1",
  kind: "station",
  pos: { x: 4.5, y: 1.5 },
  station: {
    type: "wires",
    shows: [0, 1, 2], // red, blue, yellow
    solved: false,
    parts: [
      { key: "anchor", at: [{ x: 4, y: 1 }] },
      {
        key: "wires",
        at: [
          { x: 3, y: 1 },
          { x: 4, y: 1 },
          { x: 5, y: 1 },
        ],
      },
    ],
    ...(cut ? { cut } : {}),
  },
});

const cam = { scale: 48, ox: 0, oy: 0 };
const snip = (age: number): Fx & { age: number } => ({
  kind: "snip",
  pos: { x: 4.5, y: 1.5 },
  tone: "ui",
  targetId: "Q1",
  age,
});
const draw = (e: EntityView, scene: Partial<Scene> = {}) => {
  const r = recorder();
  drawStationStanding(r.ctx, e, cam, { players: [], ...scene } as unknown as Scene, 1);
  return r.calls;
};
const fills = (calls: ReturnType<typeof draw>, colour: string) =>
  calls.filter((c) => c.name === "fill" && c.style === colour).length;
const clips = (calls: ReturnType<typeof draw>) => calls.filter((c) => c.name === "clip").length;

describe("a cut wire on the panel", () => {
  it("draws a cut swatch as two pieces and a hatch, an uncut one as one piece", () => {
    const whole = draw(panel());
    const cut = draw(panel([1]));
    expect(fills(whole, WORLD.codeBlue)).toBe(1);
    expect(fills(cut, WORLD.codeBlue)).toBe(2);
    expect(fills(cut, WORLD.codeRed)).toBe(1);
    expect(fills(cut, WORLD.codeYellow)).toBe(1);
    // a swatch clips to its own piece: one more piece, and the hatch's own clip
    expect(clips(cut)).toBe(clips(whole) + 2);
  });

  it("the snip lifts the halves apart, and reduced motion draws the settled frame", () => {
    const settled = draw(panel([1]));
    expect(draw(panel([1]), { fx: [snip(0.5)] })).not.toEqual(settled);
    expect(draw(panel([1]), { fx: [snip(0.5)], reducedMotion: true })).toEqual(settled);
  });
});

describe("the snip's spark under reduced motion", () => {
  it("draws nothing: the cut state is all that shows", () => {
    const ROOM = [
      "#".repeat(9),
      ...Array.from({ length: 5 }, () => `#${".".repeat(7)}#`),
      "#".repeat(9),
    ];
    const scene = (fx: (Fx & { age: number })[]): Scene => ({
      w: 400,
      h: 300,
      role: "deaf",
      seat: 1,
      roles: ["blind", "deaf", "mute"],
      tiles: ROOM,
      entities: [panel([1])],
      self: { x: 4.5, y: 3.5 },
      layout: "fit",
      reducedMotion: true,
      fx,
    });
    const spark = {
      kind: "spark" as const,
      pos: { x: 4.5, y: 1.5 },
      tone: "ui" as const,
      age: 0.3,
    };
    // the spark's eight rays are eight moveTo/lineTo pairs: count the lines drawn
    const lines = (s: Scene) => {
      const r = recorder();
      drawScene(r.ctx, s);
      return r.calls.filter((c) => c.name === "lineTo").length;
    };
    lines(scene([])); // warm the atlas
    expect(lines(scene([spark]))).toBe(lines(scene([])));
    expect(lines({ ...scene([spark]), reducedMotion: false })).toBe(lines(scene([])) + 8);
  });
});
