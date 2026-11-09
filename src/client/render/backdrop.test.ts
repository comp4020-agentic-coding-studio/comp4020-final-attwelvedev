import { afterEach, describe, expect, it } from "vitest";
import { setContrast } from "../tokens.ts";
import { drawBackdrop } from "./backdrop.ts";
import type { Scene } from "./index.ts";

// One frame's canvas: what it was asked to draw, and the gradients it made. Its transform says a
// device pixel ratio of 2, as a phone's does.
function frameCtx() {
  const ops: string[] = [];
  const gradients: string[] = [];
  const ctx = new Proxy(
    {},
    {
      get: (_t, name) => {
        if (name === "getTransform") return () => ({ a: 2 });
        if (name === "createLinearGradient" || name === "createRadialGradient")
          return () => {
            gradients.push(String(name));
            return { addColorStop: () => {} };
          };
        return (..._args: unknown[]) => ops.push(String(name));
      },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, ops, gradients };
}

// skyImage paints its sky on a canvas of its own: here a canvas whose context records nothing.
const realDocument = globalThis.document;
let made = 0;
function stubDocument() {
  made = 0;
  (globalThis as { document?: unknown }).document = {
    createElement: () => {
      made++;
      return { width: 0, height: 0, getContext: () => frameCtx().ctx };
    },
  };
}
afterEach(() => {
  (globalThis as { document?: unknown }).document = realDocument;
  setContrast(false);
});

// The frames of a pan: still for 2 frames, then the camera moves (the horizon with it) by 3 px a frame for 8, then
// still again for 2. Each test uses its own size, as the module keeps the last sky between tests.
function pan(w: number) {
  const scene: Scene = {
    w,
    h: 400,
    role: "deaf",
    seat: 1,
    roles: ["blind", "deaf", "mute"],
    tiles: ["....", "....", "...."],
    entities: [],
    self: null,
    layout: "fit",
  };
  const oys = [150, 150, ...Array.from({ length: 8 }, (_, i) => 153 + i * 3), 177, 177];
  return oys.map((oy) => {
    const f = frameCtx();
    drawBackdrop(f.ctx, scene, { scale: 40, ox: 20, oy });
    return f;
  });
}

describe("the sky through a vertical pan (FR4)", () => {
  it("once its image is built, every frame of a pan draws the sky with its glow, and it is repainted once the camera stops", () => {
    stubDocument();
    const frames = pan(401);
    // frame 0 is the first sight of this sky: it is built on frame 1, once the key held still
    expect(made).toBeGreaterThanOrEqual(1);
    frames.slice(1).forEach((f, i) => {
      expect(f.ops.includes("drawImage"), `frame ${i + 1} draws the sky image`).toBe(true);
    });
    // a second image at the new horizon, once it settled
    expect(made).toBe(2);
  });

  it("in high contrast no frame draws an image or a radial gradient", () => {
    stubDocument();
    setContrast(true);
    for (const [i, f] of pan(402).entries()) {
      expect(f.ops.includes("drawImage"), `frame ${i}`).toBe(false);
      expect(f.gradients.includes("createRadialGradient"), `frame ${i}`).toBe(false);
    }
  });
});
