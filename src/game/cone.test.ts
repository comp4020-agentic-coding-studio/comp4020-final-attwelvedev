import { describe, expect, it } from "vitest";
import { visiblePolygon } from "./cone.ts";

const none = () => false;
const shape = (over = {}) => ({
  origin: { x: 5.5, y: 5.5 },
  facing: { x: 1, y: 0 },
  fovDeg: 60,
  range: 6,
  ...over,
});
const reach = (poly: { x: number; y: number }[]) => Math.max(...poly.map((p) => p.x));

describe("visiblePolygon: what a cone can actually see", () => {
  it("is a full wedge in open space: out to its range along the line it faces", () => {
    const poly = visiblePolygon(shape(), none);
    expect(poly[0]).toEqual({ x: 5.5, y: 5.5 }); // starts at its origin
    expect(reach(poly)).toBeGreaterThan(5.5 + 5.7);
    expect(reach(poly)).toBeLessThanOrEqual(5.5 + 6.0001);
  });

  it("opens to its field of view: the far edge spans about 2 * range * sin(fov/2)", () => {
    const poly = visiblePolygon(shape({ fovDeg: 60, range: 6 }), none);
    const ys = poly.map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(5.5);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(6.5); // 2 * 6 * sin(30deg) = 6
  });

  it("stops at a wall: nothing beyond it is lit", () => {
    const wall = (tx: number) => tx === 8; // a wall the whole height, at x = 8
    const poly = visiblePolygon(shape(), wall);
    expect(reach(poly)).toBeLessThan(8.05);
    expect(reach(poly)).toBeGreaterThan(7.5);
  });

  it("lands every ray exactly on a flat wall, so the lit edge along it is a straight line", () => {
    const wall = (tx: number) => tx === 8; // the wall's face is the line x = 8
    const poly = visiblePolygon(shape({ fovDeg: 80, range: 9 }), wall, 64);
    for (const p of poly.slice(1)) {
      expect(p.x, `ray ending at (${p.x}, ${p.y})`).toBeGreaterThan(7.995);
      expect(p.x).toBeLessThanOrEqual(8.0001);
    }
  });

  it("does the same on a wall seen from the side, and a wall above", () => {
    const south = visiblePolygon(
      shape({ facing: { x: 0, y: 1 }, origin: { x: 5.5, y: 2.5 }, fovDeg: 90 }),
      (_tx, ty) => ty === 6, // the face is y = 6
      64,
    );
    for (const p of south.slice(1)) {
      expect(p.y).toBeGreaterThan(5.995);
      expect(p.y).toBeLessThanOrEqual(6.0001);
    }
  });

  it("leaves a shadow behind a single block, and is lit beside it", () => {
    const block = (tx: number, ty: number) => tx === 8 && ty === 5; // one tile in its path
    const poly = visiblePolygon(shape({ range: 8 }), block);
    // straight ahead is cut short at the block...
    const ahead = poly.filter((p) => Math.abs(p.y - 5.5) < 0.2);
    expect(Math.max(...ahead.map((p) => p.x))).toBeLessThan(8.1);
    // ...while rays off to the side carry on past it
    expect(reach(poly)).toBeGreaterThan(11);
  });

  it("ignores the tile it stands on, so a guard on a hide spot still sees out", () => {
    const here = (tx: number, ty: number) => tx === 5 && ty === 5;
    expect(reach(visiblePolygon(shape(), here))).toBeGreaterThan(10);
  });

  it("follows the way it faces", () => {
    const south = visiblePolygon(shape({ facing: { x: 0, y: 1 } }), none);
    expect(Math.max(...south.map((p) => p.y))).toBeGreaterThan(5.5 + 5.7);
    expect(reach(south)).toBeLessThan(5.5 + 3.5); // not far east at all
  });
});
