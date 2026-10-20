import { describe, expect, it } from "vitest";
import { TILT, toScreen } from "./render/project.ts";
import { camera, draw, type Scene } from "./render.ts";
import { MAP, ROLE_COLOR, WORLD } from "./tokens.ts";

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

describe("toScreen", () => {
  const cam = { scale: 10, ox: 5, oy: 7 };

  it("puts tile (0, 0) at the camera origin and squashes depth by TILT.depth", () => {
    expect(toScreen(cam, 0, 0)).toEqual({ x: 5, y: 7 });
    const p = toScreen(cam, 2, 3);
    expect(p.x).toBeCloseTo(25, 6);
    expect(p.y).toBeCloseTo(7 + 3 * 10 * TILT.depth, 6);
  });

  it("puts a wall's top TILT.wall tiles above its foot", () => {
    const foot = toScreen(cam, 1, 1);
    const top = toScreen(cam, 1, 1, TILT.wall);
    expect(top.x).toBe(foot.x);
    expect(foot.y - top.y).toBeCloseTo(TILT.wall * cam.scale, 6);
  });
});

describe("camera", () => {
  it("fit shows the whole room, walls and all, centred", () => {
    const cam = camera(scene({ layout: "fit", w: 1180, h: 500 }));
    expect(cam.scale).toBeCloseTo(1180 / 48, 6);
    expect(toScreen(cam, 0, 0).x).toBeGreaterThanOrEqual(0);
    expect(toScreen(cam, 48, 0).x).toBeLessThanOrEqual(1180 + 1e-6);
    expect(toScreen(cam, 0, 0, TILT.wall).y).toBeGreaterThanOrEqual(0); // the north wall's top
    expect(toScreen(cam, 0, 9).y).toBeLessThanOrEqual(500 + 1e-6);
  });

  it("follow is about 18 tiles wide on desktop and 7 on a phone", () => {
    expect(camera(scene({ w: 1180, h: 600 })).scale).toBeCloseTo(1180 / 18, 6);
    expect(camera(scene({ w: 343, h: 500 })).scale).toBeCloseTo(343 / 7, 6);
  });

  it("follow keeps the window inside the room and your avatar inside the window", () => {
    for (const [w, h] of [
      [343, 300],
      [1180, 300],
    ] as const) {
      const s = scene({ w, h });
      const cam = camera(s);
      const me = toScreen(cam, s.self?.x ?? 0, s.self?.y ?? 0);
      expect(me.x).toBeGreaterThanOrEqual(0);
      expect(me.x).toBeLessThanOrEqual(w);
      expect(me.y).toBeGreaterThanOrEqual(0);
      expect(me.y).toBeLessThanOrEqual(h);
      expect(toScreen(cam, 0, 0).x).toBeLessThanOrEqual(1e-6); // no sky left of the room
      expect(toScreen(cam, 48, 0).x).toBeGreaterThanOrEqual(w - 1e-6);
      expect(toScreen(cam, 0, 0, TILT.wall).y).toBeLessThanOrEqual(1e-6); // nor above its north wall
    }
  });

  it("follow tracks the team centroid", () => {
    const here = camera(scene({}));
    const away = camera(
      scene({
        entities: [player(0, 20.5, 4.5), player(1, 21.5, 5.5), player(2, 22.5, 6.5)],
        self: { x: 21.5, y: 5.5 },
      }),
    );
    expect(away.ox).toBeLessThan(here.ox);
  });

  it("follow keeps your own avatar on screen when the others are far away (spread clamp)", () => {
    const s = scene({
      entities: [player(0, 40.5, 4.5), player(1, 2.5, 5.5), player(2, 40.5, 6.5)],
      self: { x: 2.5, y: 5.5 },
    });
    const px = toScreen(camera(s), 2.5, 5.5).x;
    expect(px).toBeGreaterThanOrEqual(0);
    expect(px).toBeLessThanOrEqual(s.w);
    const far = {
      ...s,
      self: { x: 40.5, y: 5.5 },
      entities: [player(0, 2.5, 4.5), player(1, 40.5, 5.5), player(2, 2.5, 6.5)],
    };
    const fx = toScreen(camera(far), 40.5, 5.5).x;
    expect(fx).toBeGreaterThanOrEqual(0);
    expect(fx).toBeLessThanOrEqual(s.w);
  });
});

// A canvas that remembers what it was asked to draw, and the state each call was made in.
interface Op {
  name: string;
  args: unknown[];
  fillStyle: unknown;
  strokeStyle: unknown;
  globalAlpha: number;
  lineWidth: number;
}
function recorder() {
  const ops: Op[] = [];
  const state = { fillStyle: "", strokeStyle: "", globalAlpha: 1, lineWidth: 1 } as Record<
    string,
    unknown
  >;
  const saved: Record<string, unknown>[] = [];
  const ctx = new Proxy(
    {},
    {
      get: (_t, name) => {
        if (name === "save") return () => saved.push({ ...state });
        if (name === "restore") return () => Object.assign(state, saved.pop());
        if (name === "createLinearGradient") return () => ({ addColorStop() {} });
        if (name === "measureText") return () => ({ width: 10 });
        return (...args: unknown[]) => {
          ops.push({ name: String(name), args, ...state } as unknown as Op);
        };
      },
      set: (_t, name, value) => {
        state[String(name)] = value;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, ops };
}

const grid = (rows: number, cols: number, walls: [number, number][] = [], ch = "#") =>
  Array.from({ length: rows }, (_, y) =>
    Array.from({ length: cols }, (_, x) =>
      walls.some(([wx, wy]) => wx === x && wy === y) ? ch : ".",
    ).join(""),
  );

describe("the 3/4 world", () => {
  it("draws a figure in row 5 after row 4's wall front and before row 6's", () => {
    const s = scene({
      layout: "fit",
      w: 400,
      h: 400,
      tiles: grid(7, 5, [
        [2, 4],
        [2, 6],
      ]),
      entities: [player(1, 2.5, 5.5)],
      self: { x: 2.5, y: 5.5 },
    });
    const { ctx, ops } = recorder();
    draw(ctx, s);
    const cam = camera(s);
    const front = (row: number) =>
      ops.findIndex(
        (o) =>
          o.name === "fillRect" &&
          o.fillStyle === WORLD.wallFront &&
          Math.abs((o.args[1] as number) - toScreen(cam, 2, row + 1, TILT.wall).y) < 1e-6,
      );
    const figure = ops.findIndex((o) => o.name === "fill" && o.fillStyle === ROLE_COLOR.deaf);
    expect(front(4)).toBeGreaterThanOrEqual(0);
    expect(front(6)).toBeGreaterThanOrEqual(0);
    expect(figure).toBeGreaterThan(front(4));
    expect(figure).toBeLessThan(front(6));
  });

  it("fades a wall in front of a figure to 35% and outlines the figure dashed behind it", () => {
    const s = scene({
      layout: "fit",
      w: 400,
      h: 400,
      tiles: grid(7, 5, [[2, 6]]),
      entities: [player(1, 2.5, 5.5)],
      self: { x: 2.5, y: 5.5 },
    });
    const { ctx, ops } = recorder();
    draw(ctx, s);
    const wall = ops.filter((o) => o.name === "fillRect" && o.fillStyle === WORLD.wallFront);
    expect(wall.some((o) => Math.abs(o.globalAlpha - 0.35) < 1e-9)).toBe(true);
    expect(ops.some((o) => o.name === "setLineDash" && (o.args[0] as number[]).length > 0)).toBe(
      true,
    );
  });

  it("draws a glass tile translucent, and a vent opaque", () => {
    const glass = recorder();
    draw(
      glass.ctx,
      scene({ layout: "fit", w: 300, h: 200, tiles: grid(3, 5, [[2, 1]], "="), entities: [] }),
    );
    const panes = glass.ops.filter(
      (o) => o.name === "fillRect" && o.fillStyle === WORLD.glassFront,
    );
    expect(panes.length).toBeGreaterThan(0);
    expect(panes.every((o) => o.globalAlpha < 1)).toBe(true);
    const vent = recorder();
    draw(
      vent.ctx,
      scene({ layout: "fit", w: 300, h: 200, tiles: grid(3, 5, [[2, 1]], "%"), entities: [] }),
    );
    const slats = vent.ops.filter((o) => o.name === "fillRect" && o.fillStyle === WORLD.ventFront);
    expect(slats.length).toBeGreaterThan(0);
    expect(slats.every((o) => o.globalAlpha === 1)).toBe(true);
  });

  it("says Alarm in sentence case when the alarm is on", () => {
    const { ctx, ops } = recorder();
    draw(ctx, scene({ alarm: true }));
    const words = ops.filter((o) => o.name === "fillText").map((o) => o.args[0]);
    expect(words).toContain("Alarm");
    expect(words).not.toContain("ALARM");
  });
});

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
    const { ctx, ops: calls } = recorder();
    draw(ctx, s);
    const cam = camera(s);
    const corner = (p: { x: number; y: number }) => {
      const at = toScreen(cam, p.x, p.y);
      return [at.x, at.y];
    };
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

// Which avatars are marked "you": a floor ring, the one 4 px stroke in the scene.
describe("the ring that marks you", () => {
  function rings(over: Partial<Scene>): number {
    const { ctx, ops } = recorder();
    draw(ctx, scene({ layout: "fit", w: 1180, h: 500, ...over }));
    return ops.filter((o) => o.name === "stroke" && o.lineWidth === MAP.selfRingPx).length;
  }

  it("rings the one seat a watcher follows", () => {
    expect(rings({ spectator: true, seat: 1 })).toBe(1);
  });

  it("rings nobody when a watcher takes in the whole room", () => {
    expect(rings({ spectator: true, seat: 0, noSelf: true })).toBe(0);
  });
});
