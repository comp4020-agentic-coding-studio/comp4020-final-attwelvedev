import { describe, expect, it, vi } from "vitest";
import type { Scene } from "./index.ts";
import { drawEdgePills } from "./pops.ts";
import { fromScreen } from "./project.ts";

// B3 (playtest 3): a face sent through a wall showed its edge pill in the top-right corner, cut off.
// Measured: the pill sat on the right edge, but the face's white plate hangs above it, so a pill on
// the top edge (or clamped to a top corner) put the face above the frame. A sender out of sight is
// not among the entities; only the message's `from` says where they are. For a sender north, south,
// east, west and in each corner, at 1280 and 375: the pill is on the edge facing them, and the pill
// and its face lie wholly inside the frame.

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// A recording canvas: every rounded rectangle (the pill, then the face's plate) and every image.
function recorder() {
  const rects: Rect[] = [];
  const images: Rect[] = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(
    {},
    {
      get: (_t, name) => {
        if (String(name) in state) return state[String(name)];
        if (name === "measureText") return (t: string) => ({ width: t.length * 6 });
        if (name === "roundRect")
          return (x: number, y: number, w: number, h: number) => rects.push({ x, y, w, h });
        if (name === "drawImage")
          return (_img: unknown, x: number, y: number, w: number, h: number) =>
            images.push({ x, y, w, h });
        return () => {};
      },
      set: (_t, name, value) => {
        state[String(name)] = value;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, rects, images };
}

const SIZES = [
  { name: "1280", w: 1280, h: 800 },
  { name: "375", w: 375, h: 700 },
];
// tiles of 40 px from the frame's top left: the viewer is in the middle of the frame
const cam = { scale: 40, ox: 0, oy: 0 };

const inside = (r: Rect, w: number, h: number) =>
  r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h;

describe("a face from a sender out of sight: its edge pill faces them, whole", () => {
  vi.stubGlobal("Path2D", class {});

  for (const size of SIZES) {
    // where each sender is, as the floor point under a screen point well off the frame
    const at = (sx: number, sy: number) => fromScreen(cam, sx, sy);
    const [cx, cy, off] = [size.w / 2, size.h / 2, 2000];
    const senders = {
      north: at(cx, cy - off),
      south: at(cx, cy + off),
      east: at(cx + off, cy),
      west: at(cx - off, cy),
      "north-east": at(cx + off, cy - off),
      "north-west": at(cx - off, cy - off),
    };
    for (const [where, from] of Object.entries(senders)) {
      it(`${size.name}: a sender ${where}`, () => {
        const { ctx, rects, images } = recorder();
        const scene = {
          w: size.w,
          h: size.h,
          seat: 1,
          roles: ["blind", "deaf", "mute"],
          entities: [], // out of sight: no entity is sent for them
          pops: [{ seat: 2, fade: 1, from, name: "Cy", img: {} }],
        } as unknown as Scene;
        drawEdgePills(ctx, scene, cam as never);
        const [pill, plate] = rects;
        const [face] = images;
        if (!pill || !plate || !face) throw new Error("no pill with a face");
        const cx = pill.x + pill.w / 2;
        const cy = pill.y + pill.h / 2;
        if (where.includes("north")) expect(cy, "on the top half").toBeLessThan(size.h / 2);
        if (where === "south") expect(cy, "on the bottom half").toBeGreaterThan(size.h / 2);
        if (where.includes("east")) expect(cx, "on the right half").toBeGreaterThan(size.w / 2);
        if (where.includes("west")) expect(cx, "on the left half").toBeLessThan(size.w / 2);
        if (where === "north" || where === "south")
          expect(Math.abs(cx - size.w / 2), "centred across").toBeLessThan(1);
        if (where === "east" || where === "west")
          expect(Math.abs(cy - size.h / 2), "centred down").toBeLessThan(1);
        for (const [what, r] of [
          ["pill", pill],
          ["face plate", plate],
          ["face", face],
        ] as const) {
          expect(inside(r, size.w, size.h), `${what} ${JSON.stringify(r)} inside the frame`).toBe(
            true,
          );
        }
      });
    }
  }
});
