import { describe, expect, it } from "vitest";
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
