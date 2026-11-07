import { describe, expect, it } from "vitest";
import type { EntityView } from "../../net/protocol.ts";
import type { Fx } from "../fx.ts";
import { WORLD } from "../tokens.ts";
import { drawDoorOpening, drawFlat, drawStanding } from "./blocks.ts";
import { drawInspectionPlate } from "./chamber.ts";
import { drawPlayer } from "./figures.ts";
import type { Scene } from "./index.ts";
import {
  arc,
  ease,
  hop,
  pivot,
  pop,
  puff,
  ripple,
  shake,
  sink,
  slide,
  squash,
  swing,
  unfurl,
} from "./motion.ts";
import type { Camera } from "./project.ts";
import { drawBell, drawLever } from "./signals.ts";
import { drawStationFloor } from "./stations.ts";

describe("motion primitives: each ends where its object rests (FR15)", () => {
  it("maps every ease 0 → 0 and 1 → 1", () => {
    for (const [name, f] of Object.entries(ease)) {
      expect(f(0), name).toBeCloseTo(0, 9);
      expect(f(1), name).toBeCloseTo(1, 9);
    }
  });

  it("hits each primitive's end values at t = 0 and 1", () => {
    expect(sink(0)).toBe(0);
    expect(sink(1)).toBe(1);
    expect(squash(0)).toEqual({ sx: 1, sy: 1 });
    expect(squash(1).sx).toBeCloseTo(1, 9);
    expect(squash(1).sy).toBeCloseTo(1, 9);
    expect(pivot(0, 2)).toBe(0);
    expect(pivot(1, 2)).toBeCloseTo(0, 9);
    expect(swing(0, 15, 3)).toBe(0);
    expect(swing(1, 15, 3)).toBe(0);
    expect(slide(0)).toBe(0);
    expect(slide(1)).toBe(1);
    expect(shake(0, 4)).toBe(0);
    expect(shake(1, 4)).toBe(0);
    expect(hop(0, 5)).toBe(0);
    expect(hop(1, 5)).toBeCloseTo(0, 9);
    const a = { x: 1, y: 2 };
    const b = { x: 4, y: 6 };
    expect(arc(0, a, b, 1)).toEqual(a);
    expect(arc(1, a, b, 1)).toEqual(b);
    expect(pop(0)).toBeCloseTo(0, 9);
    expect(pop(1)).toBe(1);
    expect(unfurl(0)).toBe(0);
    expect(unfurl(1)).toBe(1);
    expect(ripple(0)).toBe(0);
    expect(ripple(1)).toBe(1);
  });

  it("moves in the middle: a hop is up, a swing and a shake swing", () => {
    expect(hop(0.5, 5)).toBeCloseTo(5, 9);
    expect(Math.abs(swing(1 / 12, 15, 3))).toBeGreaterThan(5);
    expect(Math.abs(shake(1 / 12, 4))).toBeGreaterThan(2);
    expect(squash(0.5).sy).toBeLessThan(1);
  });

  it("fades every puff to nothing by its end, whatever its shape", () => {
    for (const shape of ["side", "line", "trail", "curtain", "burst"] as const) {
      expect(puff(0, shape).length, shape).toBeGreaterThan(0);
      expect(
        puff(0, shape).every((p) => p.a > 0),
        shape,
      ).toBe(true);
      expect(
        puff(1, shape).every((p) => p.a === 0),
        shape,
      ).toBe(true);
    }
  });
});

// The drawers: each moves its own object from its live fx, and draws its end state under reduced
// motion (a recorder canvas, as in src/client/render.test.ts, cut to what these read).
interface Op {
  name: string;
  args: unknown[];
  fillStyle: unknown;
  strokeStyle: unknown;
}
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
        if (name === "save") return () => saved.push({ ...state });
        if (name === "restore") return () => Object.assign(state, saved.pop());
        if (name === "createLinearGradient" || name === "createRadialGradient")
          return () => ({ addColorStop() {} });
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

const cam = { scale: 64, ox: 0, oy: 0 } as Camera;
const base = (over: Partial<Scene> = {}): Scene => ({
  w: 640,
  h: 640,
  role: "deaf",
  seat: 1,
  roles: ["blind", "deaf", "mute"],
  tiles: null,
  entities: [],
  self: null,
  layout: "fit",
  nowMs: 1000,
  ...over,
});
const fx = (f: Partial<Fx> & Pick<Fx, "kind">, age: number) =>
  [{ pos: { x: 2.5, y: 2.5 }, tone: "ui" as const, ...f, age }] as Scene["fx"];
const trace = (draw: (ctx: CanvasRenderingContext2D) => void) => {
  const { ctx, ops } = recorder();
  draw(ctx);
  return ops;
};
const minY = (ops: Op[], name: string) =>
  Math.min(...ops.filter((o) => o.name === name).map((o) => o.args[1] as number));

describe("each object's drawer moves it from its own fx (FR15, FR17)", () => {
  it("a door with an active door fx at age 0.5 draws its leaves apart and lower than at age 0", () => {
    const at = { x: 2.5, y: 2.5 };
    const leaves = (t: number) =>
      trace((c) => drawDoorOpening(c, cam, at, t)).filter(
        (o) => o.name === "fillRect" && o.fillStyle === WORLD.doorFront,
      );
    const start = leaves(0);
    const mid = leaves(0.5);
    expect(mid.length).toBeGreaterThan(0);
    // lower: the face's top is further down the screen, and shorter
    expect(Math.min(...mid.map((o) => o.args[1] as number))).toBeGreaterThan(
      Math.min(...start.map((o) => o.args[1] as number)),
    );
    expect(Math.max(...mid.map((o) => o.args[3] as number))).toBeLessThan(
      Math.max(...start.map((o) => o.args[3] as number)),
    );
    // apart: each leaf is drawn after a translate away from the seam
    const shifts = trace((c) => drawDoorOpening(c, cam, at, 0.5))
      .filter((o) => o.name === "translate")
      .map((o) => o.args[0] as number);
    expect(shifts.some((x) => x < 0) && shifts.some((x) => x > 0)).toBe(true);
  });

  it("a rung bell is still once its 1.2 s fx is over, though its state is still on", () => {
    const bell: EntityView = { id: "b1", kind: "bell", pos: { x: 2.5, y: 2.5 }, state: "on" };
    const angle = (scene: Scene) =>
      trace((c) => drawBell(c, bell, cam, scene)).find((o) => o.name === "rotate")?.args[0];
    expect(angle(base({ fx: fx({ kind: "bell", targetId: "b1" }, 1 / 12) }))).not.toBe(0);
    expect(angle(base({ fx: [] })), "after its fx: still").toBe(0);
    expect(angle(base({ fx: [], nowMs: 1300 })), "at any time").toBe(0);
  });

  it("on cleared every visible figure is drawn higher at age 0.25 than at 0", () => {
    for (const seat of [0, 1, 2] as const) {
      const p: EntityView = { id: `P${seat}`, kind: "player", seat, pos: { x: 2.5, y: 3.5 } };
      const top = (age: number) =>
        minY(
          trace((c) =>
            drawPlayer(
              c,
              p,
              cam,
              base({ cleared: true, noSelf: true, fx: fx({ kind: "hop", targetId: p.id }, age) }),
            ),
          ),
          "arc",
        );
      expect(top(0.25), `seat ${seat}`).toBeLessThan(top(0));
    }
  });

  it("reduced motion: each drawer draws its end state at age 0", () => {
    const still = (draw: (c: CanvasRenderingContext2D, s: Scene) => void, f: Scene["fx"]) => {
      const moving = trace((c) => draw(c, base({ reducedMotion: true, fx: f })));
      const rest = trace((c) => draw(c, base({ reducedMotion: true, fx: [] })));
      expect(moving.map((o) => [o.name, JSON.stringify(o.args)])).toEqual(
        rest.map((o) => [o.name, JSON.stringify(o.args)]),
      );
    };
    const plate: EntityView = {
      id: "p1",
      kind: "plate",
      pos: { x: 2.5, y: 2.5 },
      state: "pressed",
    };
    still((c, s) => drawFlat(c, plate, cam, s), fx({ kind: "press", targetId: "p1" }, 0));
    const crate: EntityView = { id: "B1", kind: "crate", pos: { x: 2.5, y: 2.5 } };
    still((c, s) => drawStanding(c, crate, cam, s), fx({ kind: "crate", targetId: "B1" }, 0));
    const flag: EntityView = {
      id: "K1",
      kind: "checkpoint",
      pos: { x: 2.5, y: 2.5 },
      state: "reached",
    };
    still((c, s) => drawStanding(c, flag, cam, s), fx({ kind: "unfurl", targetId: "K1" }, 0));
    const lever: EntityView = { id: "L1", kind: "lever", pos: { x: 2.5, y: 2.5 }, state: "on" };
    still((c, s) => drawLever(c, lever, cam, s), fx({ kind: "lever", targetId: "L1" }, 0));
    const p: EntityView = { id: "P0", kind: "player", seat: 0, pos: { x: 2.5, y: 2.5 } };
    still((c, s) => drawPlayer(c, p, cam, s), fx({ kind: "hop", targetId: "P0" }, 0.25));
    still((c, s) => drawPlayer(c, p, cam, s), fx({ kind: "caught", targetId: "P0" }, 0));
  });

  it("the inspection plate draws the same pressed or not", () => {
    const parts = [
      { key: "anchor" as const, at: [{ x: 2, y: 2 }] },
      { key: "back" as const, at: [{ x: 4, y: 2 }] },
    ];
    const safe = (on: boolean): EntityView => ({
      id: "Q1",
      kind: "station",
      pos: { x: 2.5, y: 2.5 },
      station: {
        type: "dial",
        shows: on ? [1] : [],
        solved: false,
        parts,
        cache: true,
      } as NonNullable<EntityView["station"]>,
    });
    // someone standing on the plate, and not: the plate's own drawing does not dip
    const standing: EntityView = { id: "P0", kind: "player", seat: 0, pos: { x: 4.5, y: 2.5 } };
    const plate = (e: EntityView, who: EntityView[]) =>
      trace((c) => drawStationFloor(c, e, cam, base({ entities: who }))).filter(
        (o) => o.fillStyle === WORLD.steel || o.strokeStyle === WORLD.line,
      );
    expect(plate(safe(true), [standing])).toEqual(plate(safe(false), []));
    expect(
      trace((c) => drawInspectionPlate(c, { x: 4, y: 2 }, cam)).length,
      "it is drawn",
    ).toBeGreaterThan(0);
  });
});
