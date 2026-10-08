import { describe, expect, it } from "vitest";
import { camera, type Scene } from "./render.ts";

const ROOM = [
  "#".repeat(48),
  ...Array.from({ length: 7 }, () => `#${".".repeat(46)}#`),
  "#".repeat(48),
];

const player = (seat: number, x: number, y: number) => ({
  id: `P${seat}`,
  kind: "player" as const,
  pos: { x, y },
  seat: seat as 0 | 1 | 2,
});

const scene = (over: Partial<Scene>): Scene => ({
  w: 343,
  h: 500,
  role: "deaf",
  seat: 1,
  roles: ["blind", "deaf", "mute"],
  tiles: ROOM,
  entities: [player(0, 2.5, 4.5), player(1, 2.5, 5.5), player(2, 2.5, 6.5)],
  self: { x: 2.5, y: 5.5 },
  layout: "follow",
  ...over,
});

describe("camera", () => {
  it("desktop fits the whole room, centred", () => {
    const cam = camera(scene({ layout: "fit", w: 1180, h: 500 }));
    expect(cam.scale).toBeCloseTo(1180 / 48, 6);
    expect(cam.ox).toBeGreaterThanOrEqual(0);
    expect(cam.oy).toBeGreaterThanOrEqual(0);
    expect(48 * cam.scale + cam.ox).toBeLessThanOrEqual(1180 + 1e-6);
    expect(9 * cam.scale + cam.oy).toBeLessThanOrEqual(500 + 1e-6);
  });

  it("phone shows a window of the room and keeps it inside the room", () => {
    const cam = camera(scene({}));
    expect(cam.scale).toBeGreaterThan(343 / 48);
    expect(cam.ox).toBeLessThanOrEqual(0 + 1e-6); // never shows space left of the room
  });

  it("phone follows the team centroid", () => {
    const here = camera(scene({}));
    const away = camera(
      scene({
        entities: [player(0, 20.5, 4.5), player(1, 21.5, 5.5), player(2, 22.5, 6.5)],
        self: { x: 21.5, y: 5.5 },
      }),
    );
    expect(away.ox).toBeLessThan(here.ox);
  });

  it("phone keeps your own avatar on screen when the others are far away (spread clamp)", () => {
    const s = scene({
      entities: [player(0, 40.5, 4.5), player(1, 2.5, 5.5), player(2, 40.5, 6.5)],
      self: { x: 2.5, y: 5.5 },
    });
    const cam = camera(s);
    const px = (s.self?.x ?? 0) * cam.scale + cam.ox;
    expect(px).toBeGreaterThanOrEqual(0);
    expect(px).toBeLessThanOrEqual(s.w);
    const far = camera({
      ...s,
      self: { x: 40.5, y: 5.5 },
      entities: [player(0, 2.5, 4.5), player(1, 40.5, 5.5), player(2, 2.5, 6.5)],
    });
    const fx = 40.5 * far.scale + far.ox;
    expect(fx).toBeGreaterThanOrEqual(0);
    expect(fx).toBeLessThanOrEqual(s.w);
  });
});
