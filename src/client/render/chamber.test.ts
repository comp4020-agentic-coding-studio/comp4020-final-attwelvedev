import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EntityView } from "../../net/protocol.ts";

const drawItem = vi.fn();
vi.mock("./items.ts", () => ({ drawItem: (...a: unknown[]) => drawItem(...a) }));

import { WORLD } from "../tokens.ts";
import { drawInspectionPlate, drawKeepsake, drawSlide } from "./chamber.ts";
import { type Camera, setRise } from "./project.ts";

const cam: Camera = { scale: 48, ox: 0, oy: 0 };
const keep: EntityView = {
  id: "Q1.keep",
  kind: "keepsake",
  pos: { x: 9.5, y: 8.5 },
  keep: "watch",
};

function recorder() {
  const calls: string[] = [];
  const fills: { style: unknown; h: number; w: number; alpha: number }[] = [];
  let alpha = 1;
  let style: unknown = "";
  const ctx = new Proxy(
    {},
    {
      get: (_t, name) => {
        if (name === "createLinearGradient" || name === "createRadialGradient")
          return () => ({ addColorStop() {} });
        return (...a: unknown[]) => {
          calls.push(String(name));
          if (name === "fillRect")
            fills.push({ style, h: a[3] as number, w: a[2] as number, alpha });
        };
      },
      set: (_t, name, value) => {
        if (name === "fillStyle") style = value;
        if (name === "globalAlpha") alpha = value as number;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, fills };
}

beforeEach(() => {
  drawItem.mockClear();
  setRise(1);
});

describe("drawKeepsake: the item standing in an open vault", () => {
  it("draws the item with drawItem, on a plinth, at the entity's tile", () => {
    const { ctx, calls } = recorder();
    drawKeepsake(ctx, keep, cam);
    expect(drawItem).toHaveBeenCalledTimes(1);
    expect(drawItem.mock.calls[0]?.[1]).toBe("watch");
    expect(calls).toContain("fill"); // the plinth and its contact shadow are drawn too
  });

  it("is a standing object that does not bob: the same frame at any time", () => {
    const a = recorder();
    const b = recorder();
    drawKeepsake(a.ctx, keep, cam);
    drawKeepsake(b.ctx, keep, cam);
    expect(drawItem.mock.calls[0]?.slice(2)).toEqual(drawItem.mock.calls[1]?.slice(2));
  });

  it("draws nothing for an entity without an item", () => {
    const { ctx } = recorder();
    drawKeepsake(ctx, { ...keep, keep: undefined }, cam);
    expect(drawItem).not.toHaveBeenCalled();
  });
});

describe("drawSlide: a secret door sinking into the floor", () => {
  const heightAt = (age: number, reduced = false) => {
    const { ctx, fills } = recorder();
    drawSlide(ctx, { x: 3.5, y: 5.5 }, cam, age, reduced);
    return fills;
  };

  const frontH = (age: number, reduced = false) =>
    heightAt(age, reduced)
      .filter((f) => f.style === WORLD.doorFront)
      .reduce((m, f) => Math.max(m, f.h), 0);

  it("is a full wall at the start and lower and lower as it ages", () => {
    expect(frontH(0.05)).toBeGreaterThan(frontH(0.5));
    expect(frontH(0.5)).toBeGreaterThan(frontH(0.95));
    expect(frontH(0.95)).toBeGreaterThanOrEqual(0);
  });

  it("does not slide under reduced motion: the wall stays full height and only fades", () => {
    expect(frontH(0.1, true)).toBeGreaterThan(0);
    expect(frontH(0.1, true)).toBe(frontH(0.9, true));
  });
});

describe("drawInspectionPlate: a flush plate filling a cache dial's back tile", () => {
  // the tile's own footprint on screen, from the same projection the game uses
  const tile = { x: 3, y: 8 };
  const spans = () => {
    const { ctx, calls, fills } = recorder();
    const rects: number[][] = [];
    const orig = ctx.roundRect.bind(ctx);
    void orig;
    return { ctx, calls, fills, rects };
  };

  it("fills the whole tile with a subtle floor-grey and two rivets, with no ring round it", () => {
    const { ctx, calls, fills } = spans();
    drawInspectionPlate(ctx, tile, cam);
    // two rivets and nothing else round: the wear ring (a third ellipse) is gone
    expect(calls.filter((c) => c === "ellipse")).toHaveLength(2);
    expect(calls).toContain("fillRect");
    expect(fills).toHaveLength(1);
    // it fills the tile edge to edge: one tile wide, one tile deep in the 3/4 projection
    expect(fills[0]?.w).toBeCloseTo(cam.scale, 0);
  });

  it("is faint (the floor shows through) and uses the steel token, so it follows high contrast", () => {
    const { ctx, calls, fills } = spans();
    drawInspectionPlate(ctx, tile, cam);
    expect(calls).toContain("save");
    expect(fills[0]?.style).toBe(WORLD.steel);
    expect(fills[0]?.alpha).toBeLessThan(0.6);
    expect(fills[0]?.alpha).toBeGreaterThan(0.1);
  });
});
