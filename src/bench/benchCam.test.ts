import { describe, expect, it } from "vitest";
import { LIVE, toScreen } from "../client/render/project.ts";
import { benchCam } from "./benchCam.ts";

// The bench times what play does. A camera that only pans sideways never moves the horizon, so the
// sky's repaint on a vertical pan (backdrop.ts) would never be timed.
describe("the frame bench's camera", () => {
  const cam = { scale: 48, ox: 100, oy: 200 };
  const frames = Array.from({ length: 121 }, (_, f) => benchCam(cam, f));

  it("pans sideways", () => {
    const xs = frames.map((c) => c.ox);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(cam.scale);
  });

  it("pans vertically too, by at least a tile, so the horizon moves", () => {
    const ys = frames.map((c) => c.oy);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThanOrEqual(cam.scale);
    const horizons = new Set(frames.map((c) => toScreen(c, 0, 0, LIVE.wall).y));
    expect(horizons.size).toBeGreaterThanOrEqual(2);
  });
});
