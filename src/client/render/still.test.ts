// Once the room is cleared nobody walks on (FR2): a cleared scene draws every figure at rest, however
// stale a `moving` reached it (own, teammates, a spectator's view, Can't see's own screen).

import { describe, expect, it } from "vitest";
import { draw, type Scene } from "../render.ts";
import { ROLE_COLOR, WORLD } from "../tokens.ts";

// A canvas that remembers what it was asked to draw, and the fill each call was made with (the
// recorder in src/client/render.test.ts, cut to what this file reads).
interface Op {
  name: string;
  args: unknown[];
  fillStyle: unknown;
}
function recorder() {
  const ops: Op[] = [];
  const state: Record<string, unknown> = {
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    lineWidth: 1,
    lineDash: [],
  };
  const saved: Record<string, unknown>[] = [];
  const ctx = new Proxy(
    {},
    {
      get: (_t, name) => {
        if (String(name) in state) return state[String(name)];
        if (name === "save") return () => saved.push({ ...state });
        if (name === "restore") return () => Object.assign(state, saved.pop());
        if (name === "setLineDash") return (dash: unknown) => (state.lineDash = dash);
        if (name === "createLinearGradient") return () => ({ addColorStop() {} });
        if (name === "measureText") return () => ({ width: 10 });
        return (...args: unknown[]) => ops.push({ name: String(name), args, ...state } as Op);
      },
      set: (_t, name, value) => {
        state[String(name)] = value;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, ops };
}

const ROOM = [
  "#".repeat(9),
  ...Array.from({ length: 7 }, () => `#${".".repeat(7)}#`),
  "#".repeat(9),
];
const walker = (seat: 0 | 1 | 2, x: number, y: number) => ({
  id: `P${seat}`,
  kind: "player" as const,
  pos: { x, y },
  seat,
  facing: { x: 1, y: 0 },
  moving: true,
});
const sighted = (over: Partial<Scene>): Scene => ({
  w: 400,
  h: 300,
  role: "deaf",
  seat: 1,
  roles: ["blind", "deaf", "mute"],
  tiles: ROOM,
  entities: [walker(0, 2.5, 3.5), walker(1, 4.5, 3.5), walker(2, 6.5, 3.5)],
  self: { x: 4.5, y: 3.5 },
  layout: "fit",
  own: { facing: { x: 1, y: 0 }, moving: true, blocked: false },
  ...over,
});
const blindOwn = (over: Partial<Scene>): Scene => ({
  ...sighted({ role: "blind", seat: 0, tiles: null, entities: [], self: null }),
  own: { facing: { x: 1, y: 0 }, moving: true, blocked: false },
  ...over,
});

// Each figure's pill (its role-coloured rounded rect) and every puff of dust.
const pills = (s: Scene) => {
  const { ctx, ops } = recorder();
  draw(ctx, s);
  const colours = Object.values(ROLE_COLOR);
  return ops.filter((o) => o.name === "roundRect" && colours.includes(o.fillStyle as string));
};
const dust = (s: Scene) => {
  const { ctx, ops } = recorder();
  draw(ctx, s);
  return ops.filter((o) => o.name === "arc" && o.fillStyle === WORLD.floorFront).length;
};

const MID_HOP = 100; // sin(0.1 s × 2π × 2.5 Hz) = 1: the top of a hop

describe("a cleared scene draws every figure at rest (FR2)", () => {
  it("draws each sighted figure, own and teammates, where it stands at rest, with no dust", () => {
    const rest = pills(sighted({ nowMs: 0 }));
    expect(rest.length).toBe(3);
    // walking, not cleared, they hop: the test can see a hop
    expect(pills(sighted({ nowMs: MID_HOP })).map((o) => o.args)).not.toEqual(
      rest.map((o) => o.args),
    );
    const cleared = sighted({ nowMs: MID_HOP, cleared: true });
    expect(pills(cleared).map((o) => o.args)).toEqual(rest.map((o) => o.args));
    expect(dust(cleared)).toBe(0);
  });

  it("draws a spectator's view at rest", () => {
    const watching = { spectator: true, noSelf: true, own: undefined, self: null };
    const rest = pills(sighted({ ...watching, nowMs: 0 }));
    const cleared = sighted({ ...watching, nowMs: MID_HOP, cleared: true });
    expect(pills(cleared).map((o) => o.args)).toEqual(rest.map((o) => o.args));
    expect(dust(cleared)).toBe(0);
  });

  it("draws Can't see's own figure at rest", () => {
    const rest = pills(blindOwn({ nowMs: 0 }));
    expect(rest.length).toBe(1);
    expect(pills(blindOwn({ nowMs: MID_HOP })).map((o) => o.args)).not.toEqual(
      rest.map((o) => o.args),
    );
    const cleared = blindOwn({ nowMs: MID_HOP, cleared: true });
    expect(pills(cleared).map((o) => o.args)).toEqual(rest.map((o) => o.args));
    expect(dust(cleared)).toBe(0);
  });
});
