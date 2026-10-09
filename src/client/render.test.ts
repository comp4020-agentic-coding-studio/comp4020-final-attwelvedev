import { describe, expect, it } from "vitest";
import { camera, draw, type Scene } from "./render.ts";

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

// A canvas that remembers what it was asked to draw.
function recorder() {
  const calls: { name: string; args: unknown[] }[] = [];
  const ctx = new Proxy(
    {},
    {
      get:
        (_t, name) =>
        (...args: unknown[]) => {
          calls.push({ name: String(name), args });
        },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe("a hazard's sight reaching out of the dark", () => {
  it("is drawn as the cone it is: a filled, hatched, outlined polygon, nothing else of the hazard", () => {
    const poly = [
      { x: 20, y: 3 },
      { x: 24, y: 3.5 },
      { x: 24, y: 5.5 },
      { x: 20, y: 6 },
    ];
    const sight = { id: "G1", kind: "sight" as const, pos: { x: 20, y: 3 }, polys: [poly] };
    const s = scene({ layout: "fit", w: 1180, h: 500, entities: [...scene({}).entities, sight] });
    const { ctx, calls } = recorder();
    draw(ctx, s);
    const cam = camera(s);
    const corner = (p: { x: number; y: number }) => [
      cam.ox + p.x * cam.scale,
      cam.oy + p.y * cam.scale,
    ];
    const at = (name: string, p: { x: number; y: number }) =>
      calls.some(
        (c) =>
          c.name === name &&
          Math.abs((c.args[0] as number) - (corner(p)[0] as number)) < 1e-6 &&
          Math.abs((c.args[1] as number) - (corner(p)[1] as number)) < 1e-6,
      );
    expect(at("moveTo", poly[0] as { x: number; y: number })).toBe(true);
    for (const p of poly.slice(1)) expect(at("lineTo", p)).toBe(true);
    expect(calls.some((c) => c.name === "clip")).toBe(true); // hatched inside it
    expect(calls.some((c) => c.name === "stroke")).toBe(true); // and outlined
    // no body of a guard is drawn for it (a diamond is a path closed with four lineTo calls)
  });
});
