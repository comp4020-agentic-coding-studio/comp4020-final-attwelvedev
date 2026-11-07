import { beforeEach, describe, expect, it, vi } from "vitest";
import { linkOf } from "../game/links.ts";
import type { Vec } from "../game/types.ts";
import type { EntityView } from "../net/protocol.ts";
import { drawStanding } from "./render/blocks.ts";
import { HEIGHT } from "./render/column.ts";
import { drawPlayer } from "./render/figures.ts";
import { drawGear } from "./render/gear.ts";
import { drawHazard } from "./render/hazards.ts";
import { figureCover, wallAlpha } from "./render/occlusion.ts";
import { easeCamera, setRise, TILT, toScreen } from "./render/project.ts";
import { decodeSeen } from "./render/sight.ts";
import { drawBell, drawLampSwitch } from "./render/signals.ts";
import { camera, draw, type Scene } from "./render.ts";
import { COLOR, MAP, MIST, ROLE_COLOR, setContrast, WORLD } from "./tokens.ts";

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

  // spec/fixtures/perf/00-hub-size.room: a 60x30 hub with chambers in every corner, not a strip.
  // You in the far corner of one chamber, the others in the hub and the opposite chamber, so the
  // team's centroid pulls hard away from you on both axes.
  it("follow keeps you in frame at a chamber corner of a hub room, at both viewports", () => {
    const HUB = Array.from({ length: 30 }, (_, y) =>
      y === 0 || y === 29 ? "#".repeat(60) : `#${".".repeat(58)}#`,
    );
    for (const self of [
      { x: 1.5, y: 28.5 },
      { x: 58.5, y: 1.5 },
      { x: 58.5, y: 28.5 },
      { x: 1.5, y: 1.5 },
    ]) {
      for (const [w, h] of [
        [375, 560],
        [1280, 600],
      ] as const) {
        const s = scene({
          w,
          h,
          tiles: HUB,
          self,
          entities: [
            player(0, 30, 15),
            player(1, self.x, self.y),
            player(2, 59 - self.x, 29 - self.y),
          ],
        });
        const cam = camera(s);
        const me = toScreen(cam, self.x, self.y);
        const head = toScreen(cam, self.x, self.y, TILT.wall);
        expect(me.x).toBeGreaterThanOrEqual(0);
        expect(me.x).toBeLessThanOrEqual(w);
        expect(me.y).toBeLessThanOrEqual(h);
        expect(head.y).toBeGreaterThanOrEqual(0);
        expect(toScreen(cam, 0, 0).x).toBeLessThanOrEqual(1e-6); // no sky beside the room
        expect(toScreen(cam, 60, 0).x).toBeGreaterThanOrEqual(w - 1e-6);
      }
    }
  });
});

describe("easeCamera: the camera never snaps", () => {
  const walk = (teammatesAt: number | null, frames = 60 * 11) => {
    const speeds: number[] = [];
    let eased: ReturnType<typeof camera> | null = null;
    let prevOx: number | null = null;
    for (let f = 0; f < frames; f++) {
      const x = 2.5 + (f * 4) / 60; // walking east at 4 tiles a second, drawn at 60 fps
      const others = teammatesAt ?? x;
      const s = scene({
        w: 1280,
        h: 600,
        entities: [player(0, others, 4.5), player(1, x, 5.5), player(2, others, 6.5)],
        self: { x, y: 5.5 },
      });
      eased = easeCamera(eased, camera(s), 1000 / 60, s);
      if (prevOx !== null) speeds.push(eased.ox - prevOx);
      prevOx = eased.ox;
    }
    return speeds;
  };
  const jerk = (speeds: number[]) =>
    Math.max(...speeds.slice(1).map((v, i) => Math.abs(v - (speeds[i] as number))));

  it("changes speed gently when you walk past the point where the raw camera starts to follow", () => {
    // raw, the camera sits still then moves at full speed in one frame (4.7 px/frame at this size)
    expect(jerk(walk(2.5))).toBeLessThan(1.5);
  });

  it("is smooth with teammates walking beside you too", () => {
    expect(jerk(walk(null))).toBeLessThan(1.5);
  });

  // The game's own pipeline, frame by frame: you walk east at 4 tiles a second, your position steps
  // in 0.2-tile jumps at 20 Hz and what is drawn eases half way to it each frame (Game.tsx), the
  // teammates stay put on the left, and the camera is eased at 60 fps.
  const realWalk = (frames = 60 * 13) => {
    let self = 2.5;
    let shown = 2.5;
    let eased: ReturnType<typeof camera> | null = null;
    const out: { x: number; ox: number; speed: number; edge: number }[] = [];
    for (let f = 0; f < frames; f++) {
      const t = f / 60;
      if (Math.floor(t * 20) !== Math.floor((t - 1 / 60) * 20) && self < 45.5) self += 0.2;
      shown += (self - shown) * 0.5;
      const s = scene({
        w: 1250,
        h: 490,
        entities: [player(0, 2.5, 4.5), player(1, shown, 5.5), player(2, 2.5, 6.5)],
        self: { x: shown, y: 5.5 },
      });
      const prev: ReturnType<typeof camera> | null = eased;
      eased = easeCamera(eased, camera(s), 1000 / 60, s);
      const me = toScreen(eased, shown, 5.5).x;
      out.push({
        x: shown,
        ox: eased.ox,
        speed: prev ? eased.ox - prev.ox : 0,
        edge: Math.min(me, 1250 - me),
      });
    }
    return out;
  };

  it("starts to follow without a lurch: speed builds up over several frames, never in one", () => {
    const walk = realWalk();
    const worst = Math.max(
      ...walk.slice(1).map((e, i) => Math.abs(e.speed - (walk[i] as { speed: number }).speed)),
    );
    // the camera's speed may change by about a tenth of its cruise speed (6.8 px a frame here) from
    // one frame to the next, not the quarter to third a first-order ease gave in a real browser
    expect(worst).toBeLessThan(0.75);
  });

  it("builds that speed up gradually: it takes at least 15 frames to get to 90% of it", () => {
    const walk = realWalk();
    const first = walk.findIndex((e) => e.speed < -0.05);
    const full = Math.min(...walk.map((e) => e.speed));
    const at90 = walk.findIndex((e, i) => i > first && e.speed <= 0.9 * full);
    expect(at90 - first).toBeGreaterThanOrEqual(15);
  });

  it("only ever moves one way while you walk east, and comes to rest without overshooting", () => {
    const walk = realWalk();
    for (const e of walk) expect(e.speed).toBeLessThanOrEqual(1e-9);
    const rest = walk.at(-1) as { ox: number };
    expect(Math.min(...walk.map((e) => e.ox))).toBeGreaterThanOrEqual(rest.ox - 1e-6);
  });

  it("keeps your avatar well inside the window the whole way, lag included", () => {
    const walk = realWalk();
    // 14% of this 1250 px window is 175 px: never closer to the edge than a tenth of its width
    expect(Math.min(...walk.map((e) => e.edge))).toBeGreaterThan(125);
  });

  it("does the same on a phone: a 7-tile window, and the avatar still never nears the edge", () => {
    let self = 2.5;
    let shown = 2.5;
    let eased: ReturnType<typeof camera> | null = null;
    let edge = Number.POSITIVE_INFINITY;
    let lagging = 0;
    for (let f = 0; f < 60 * 13; f++) {
      const t = f / 60;
      if (Math.floor(t * 20) !== Math.floor((t - 1 / 60) * 20) && self < 45.5) self += 0.2;
      shown += (self - shown) * 0.5;
      const s = scene({
        w: 343,
        h: 400,
        entities: [player(0, 2.5, 4.5), player(1, shown, 5.5), player(2, 2.5, 6.5)],
        self: { x: shown, y: 5.5 },
      });
      eased = easeCamera(eased, camera(s), 1000 / 60, s);
      const me = toScreen(eased, shown, 5.5).x;
      edge = Math.min(edge, me, 343 - me);
      if (me > 343) lagging++;
    }
    expect(lagging, "frames with the avatar outside the window").toBe(0);
    expect(edge).toBeGreaterThan(343 * 0.1);
  });

  it("catches up: after standing still it settles exactly on the target", () => {
    const s = scene({
      w: 1280,
      h: 600,
      self: { x: 30.5, y: 5.5 },
      entities: [player(1, 30.5, 5.5)],
    });
    const target = camera(s);
    let eased = easeCamera(null, camera(scene({ w: 1280, h: 600 })), 16, s);
    for (let i = 0; i < 120; i++) eased = easeCamera(eased, target, 1000 / 60, s);
    expect(eased).toEqual(target); // snapped, so a still room is a still picture
  });

  it("is frame-rate independent: two 8 ms steps are about one 16 ms step", () => {
    // a gap well inside the jump limit, so this is a walk and not a teleport
    const near = scene({
      w: 1280,
      h: 600,
      self: { x: 10.5, y: 5.5 },
      entities: [player(1, 10.5, 5.5)],
    });
    const start = camera(scene({ w: 1280, h: 600 }));
    const one = easeCamera(start, camera(near), 16, near);
    const two = easeCamera(easeCamera(start, camera(near), 8, near), camera(near), 8, near);
    expect(Math.abs(one.ox - two.ox)).toBeLessThan(0.5);
  });

  it("takes the target outright after a jump, rather than sliding the room across the screen", () => {
    const far = scene({
      w: 1280,
      h: 600,
      self: { x: 40.5, y: 5.5 },
      entities: [player(1, 40.5, 5.5)],
    });
    const start = camera(scene({ w: 1280, h: 600 }));
    expect(easeCamera(start, camera(far), 16, far)).toEqual(camera(far));
  });

  it("takes the target outright with nothing to ease from, or when the window changed size", () => {
    const s = scene({ w: 1280, h: 600 });
    expect(easeCamera(null, camera(s), 16, s)).toEqual(camera(s));
    const small = scene({ w: 343, h: 500 });
    expect(easeCamera(camera(s), camera(small), 16, small)).toEqual(camera(small));
  });

  it("stays inside the room: easing between two valid windows is still a valid window", () => {
    const s = scene({
      w: 1280,
      h: 600,
      self: { x: 30.5, y: 5.5 },
      entities: [player(1, 30.5, 5.5)],
    });
    let cam = easeCamera(null, camera(scene({ w: 1280, h: 600 })), 16, s);
    for (let i = 0; i < 30; i++) {
      cam = easeCamera(cam, camera(s), 1000 / 60, s);
      expect(toScreen(cam, 0, 0).x).toBeLessThanOrEqual(1e-6);
      expect(toScreen(cam, 48, 0).x).toBeGreaterThanOrEqual(1280 - 1e-6);
    }
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
  lineDash: number[];
}
function recorder() {
  const ops: Op[] = [];
  const state = {
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    lineWidth: 1,
    lineDash: [] as number[],
  } as Record<string, unknown>;
  const saved: Record<string, unknown>[] = [];
  const ctx = new Proxy(
    {},
    {
      get: (_t, name) => {
        if (String(name) in state) return state[String(name)]; // a property reads back what was set
        // save and restore also go in the trace, so a test can tell which clip a draw is inside
        if (name === "save")
          return () => {
            saved.push({ ...state });
            ops.push({ name: "save", args: [], ...state } as unknown as Op);
          };
        if (name === "restore")
          return () => {
            Object.assign(state, saved.pop());
            ops.push({ name: "restore", args: [], ...state } as unknown as Op);
          };
        if (name === "setLineDash")
          return (...args: unknown[]) => {
            state.lineDash = args[0];
            ops.push({ name: "setLineDash", args, ...state } as unknown as Op);
          };
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

  it("fades the wall in front of a standing keepsake too, so an item on the bottom row can be seen", () => {
    const base = {
      layout: "fit" as const,
      w: 400,
      h: 400,
      tiles: grid(7, 5, [[2, 6]]),
      self: { x: 0.5, y: 0.5 },
    };
    const wallAlphas = (entities: EntityView[]) => {
      const { ctx, ops } = recorder();
      draw(ctx, scene({ ...base, entities }));
      return ops
        .filter((o) => o.name === "fillRect" && o.fillStyle === WORLD.wallFront)
        .map((o) => o.globalAlpha);
    };
    vi.stubGlobal("Path2D", class {}); // drawItem builds Path2Ds; the node test env has none
    const keep: EntityView = {
      id: "Q1.keep",
      kind: "keepsake",
      pos: { x: 2.5, y: 5.5 },
      keep: "watch",
    };
    expect(wallAlphas([player(1, 0.5, 0.5)]).every((a) => a === 1)).toBe(true);
    expect(wallAlphas([player(1, 0.5, 0.5), keep]).some((a) => a < 1)).toBe(true);
    vi.unstubAllGlobals();
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

  it("a scene with dusk: true draws the wall top in the dusk wall colour, with no alarm", () => {
    const topFills = (over: Partial<Scene>): string[] => {
      const { ctx, ops } = recorder();
      draw(ctx, scene({ layout: "fit", w: 300, h: 200, ...over }));
      return ops.filter((o) => o.name === "fillRect").map((o) => String(o.fillStyle));
    };
    const day = topFills({});
    const dayTop = WORLD.wallTop; // the day palette, read before the dusk draw repaints WORLD
    const dusk = topFills({ dusk: true });
    const duskTop = WORLD.wallTop;
    expect(duskTop).not.toBe(dayTop);
    expect(day).toContain(dayTop);
    expect(dusk).toContain(duskTop);
    expect(dusk).not.toContain(dayTop);
    // the next scene without dusk is the day palette again at once, not an ease back
    expect(topFills({})).toContain(dayTop);
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

describe("a sight of many pieces is one shape", () => {
  // The user (room 3's camera cone seen from far away): a sight is sent as the pieces of the hazard's cone that
  // the seat's light covers, and a cone cut along every ray of that light is a hundred pieces. Each used to be
  // filled, hatched and outlined on its own, so the seams between them showed as stacked bands. The pieces tile
  // one region: it is outlined once, and filled and hatched once, inside one clip.
  const strip = (n: number) =>
    Array.from({ length: n }, (_, i) => [
      { x: 20 + i * 0.2, y: 3 },
      { x: 20.2 + i * 0.2, y: 3 },
      { x: 20.2 + i * 0.2, y: 5 },
      { x: 20 + i * 0.2, y: 5 },
    ]);
  const drawn = (polys: { x: number; y: number }[][]) => {
    const sight = { id: "C1", kind: "sight" as const, pos: { x: 20, y: 3 }, polys };
    const s = scene({ layout: "fit", w: 1180, h: 500, entities: [...scene({}).entities, sight] });
    const { ctx, ops } = recorder();
    draw(ctx, s);
    return ops;
  };
  it("outlines a hundred pieces as often as one: once", () => {
    const hatched = (ops: Op[]) =>
      ops.filter((o) => o.name === "stroke" && o.globalAlpha === 0.75).length;
    expect(hatched(drawn(strip(1)))).toBe(1);
    expect(hatched(drawn(strip(100)))).toBe(1);
  });
  it("clips and fills a hundred pieces as often as one", () => {
    const clips = (ops: Op[]) => ops.filter((o) => o.name === "clip").length;
    expect(clips(drawn(strip(100)))).toBe(clips(drawn(strip(1))));
  });
});

describe("a sight of an idle camera is dashed, as the camera's own cone is up close", () => {
  // The user (room 3, far along the corridor): the active camera's cone showed from far away but the dashed idle
  // one did not. Up close an idle camera's cone is only a dashed outline; sent from far away as a sight it must
  // read the same way, not as a filled, hatched, solid one, so the idle state is in the shape and not the colour.
  const poly = [
    { x: 20, y: 3 },
    { x: 24, y: 3 },
    { x: 24, y: 6 },
    { x: 20, y: 6 },
  ];
  const drawn = (state: "watching" | "idle") => {
    const sight = { id: "C1", kind: "sight" as const, pos: poly[0] as never, polys: [poly], state };
    const s = scene({ layout: "fit", w: 1180, h: 500, entities: [...scene({}).entities, sight] });
    const { ctx, ops } = recorder();
    draw(ctx, s);
    return ops;
  };
  const dashed = (ops: Op[]) =>
    ops.some((o) => o.name === "setLineDash" && (o.args[0] as number[]).length > 0);
  it("is a dashed outline, not filled or hatched, while idle", () => {
    const ops = drawn("idle");
    expect(dashed(ops), "dashed").toBe(true);
    // nothing is filled in the cone's colour (the lit cone's tint is a fillRect, its hatch is strokes in it)
    const tinted = (o: Op) => o.fillStyle === WORLD.watch || o.fillStyle === WORLD.laser;
    expect(
      ops.filter((o) => o.name === "fillRect" && tinted(o)),
      "no tint",
    ).toEqual([]);
    expect(
      ops.filter(
        (o) =>
          o.name === "stroke" && (o.strokeStyle === WORLD.watch || o.strokeStyle === WORLD.laser),
      ),
      "no hatching or lit outline",
    ).toEqual([]);
  });
  it("stays filled, hatched and solid while watching", () => {
    const ops = drawn("watching");
    expect(
      ops.some((o) => o.name === "clip"),
      "hatched inside a clip",
    ).toBe(true);
    expect(dashed(ops), "not dashed").toBe(false);
  });
});

describe("a laser's emitter shows whether it is on, whatever of the beam is sent", () => {
  // A laser in a dark zone arrives with no beam tiles (the dark keeps its lane secret), so the
  // emitter is all a seat outside the dark can read the beam's timing from.
  const drawn = (state: "on" | "off") => {
    const laser = {
      id: "L1",
      kind: "laser" as const,
      pos: { x: 20.5, y: 3.5 },
      state,
      beam: [],
    };
    const s = scene({ layout: "fit", w: 1180, h: 500, entities: [...scene({}).entities, laser] });
    const { ctx, ops } = recorder();
    draw(ctx, s);
    const cam = camera(s);
    const lens = toScreen(cam, 20.5, 3.5, 0.6);
    // everything painted around the emitter's lens
    return ops.filter(
      (c) =>
        (c.name === "arc" || c.name === "fillRect" || c.name === "ellipse") &&
        Math.abs((c.args[0] as number) - lens.x) < 1e-6 &&
        Math.abs((c.args[1] as number) - lens.y) < cam.scale,
    );
  };

  it("draws the lens differently when the laser is on and when it is off", () => {
    const on = drawn("on");
    const off = drawn("off");
    expect(on.length).toBeGreaterThan(0);
    expect(JSON.stringify(on.map((c) => [c.name, c.args, c.fillStyle, c.globalAlpha]))).not.toBe(
      JSON.stringify(off.map((c) => [c.name, c.args, c.fillStyle, c.globalAlpha])),
    );
  });

  it("lights the lens in the laser colour only while it is on", () => {
    const lit = (state: "on" | "off") =>
      drawn(state).some(
        (c) => c.name === "arc" && c.fillStyle === WORLD.laser && c.globalAlpha >= 0.9,
      );
    expect(lit("on")).toBe(true);
    expect(lit("off")).toBe(false);
  });
});

describe("figures that move (FR31)", () => {
  const still = (over: Partial<Scene> = {}) =>
    scene({ layout: "fit", w: 400, h: 300, nowMs: 100, ...over });
  const walker = (over: Record<string, unknown>) => ({
    ...player(0, 2.5, 3.5),
    facing: { x: 1, y: 0 },
    ...over,
  });
  // where the deaf figure's pill is drawn: its first rounded rect in the role colour
  const pillOps = (s: Scene) => {
    const { ctx, ops } = recorder();
    draw(ctx, s);
    return ops.filter((o) => o.name === "roundRect" && o.fillStyle === ROLE_COLOR.deaf);
  };
  const me = (over: Record<string, unknown>) => [walker({ seat: 1, id: "P1", ...over })];

  it("hops while moving, by about 2 px, and stays put when still", () => {
    const rest = pillOps(still({ entities: me({ moving: false }), self: { x: 2.5, y: 3.5 } }));
    const hop = pillOps(still({ entities: me({ moving: true }), self: { x: 2.5, y: 3.5 } }));
    expect(rest.length).toBeGreaterThan(0);
    const dy = Math.abs((hop[0]?.args[1] as number) - (rest[0]?.args[1] as number));
    expect(dy).toBeGreaterThan(0.5);
    expect(dy).toBeLessThanOrEqual(2.001);
  });

  it("under reduced motion draws a moving figure at the same y as a still one", () => {
    const rest = pillOps(
      still({ reducedMotion: true, entities: me({ moving: false }), self: { x: 2.5, y: 3.5 } }),
    );
    const hop = pillOps(
      still({ reducedMotion: true, entities: me({ moving: true }), self: { x: 2.5, y: 3.5 } }),
    );
    expect(hop[0]?.args).toEqual(rest[0]?.args);
  });

  it("squashes toward the facing when blocked, and not under reduced motion", () => {
    const scales = (s: Scene) => {
      const { ctx, ops } = recorder();
      draw(ctx, s);
      return ops.filter((o) => o.name === "scale").map((o) => o.args);
    };
    const blocked = me({ moving: true, blocked: true });
    const squash = scales(still({ entities: blocked, self: { x: 2.5, y: 3.5 } }));
    expect(squash.some(([sx, sy]) => (sx as number) < 1 && (sy as number) === 1)).toBe(true);
    const calm = scales(
      still({ reducedMotion: true, entities: blocked, self: { x: 2.5, y: 3.5 } }),
    );
    expect(calm.length).toBe(0);
  });

  it("leans against a crate it is pushing", () => {
    const rotations = (entities: Scene["entities"]) => {
      const { ctx, ops } = recorder();
      draw(ctx, still({ entities, self: { x: 2.5, y: 3.5 } }));
      return ops.filter((o) => o.name === "rotate").map((o) => o.args[0] as number);
    };
    const crate = { id: "C1", kind: "crate" as const, pos: { x: 3.5, y: 3.5 } };
    const pushing = rotations([...me({ moving: true, blocked: true }), crate]);
    expect(pushing.some((a) => Math.abs(a - (8 * Math.PI) / 180) < 1e-6)).toBe(true);
    expect(rotations(me({ moving: true, blocked: true })).length).toBe(0); // a wall is a squash, not a lean
  });

  it("puffs dust while moving, and not when still", () => {
    const dust = (moving: boolean) => {
      const { ctx, ops } = recorder();
      draw(ctx, still({ entities: me({ moving }), self: { x: 2.5, y: 3.5 }, nowMs: 130 }));
      return ops.filter((o) => o.name === "arc" && o.fillStyle === WORLD.floorFront).length;
    };
    expect(dust(true)).toBeGreaterThan(0);
    expect(dust(false)).toBe(0);
  });

  it("looks toward the facing: the eyes move with it, even under reduced motion", () => {
    const eyes = (facing: { x: number; y: number }) => {
      const { ctx, ops } = recorder();
      draw(ctx, still({ reducedMotion: true, entities: me({ facing }), self: { x: 2.5, y: 3.5 } }));
      return ops
        .filter((o) => o.name === "arc" && o.fillStyle === WORLD.line)
        .map((o) => o.args[0] as number);
    };
    const east = eyes({ x: 1, y: 0 });
    const west = eyes({ x: -1, y: 0 });
    expect(east[0]).toBeGreaterThan(west[0] as number);
  });

  it("draws Can't see's own screen as black plus a dimmed figure, with no tiles", () => {
    const { ctx, ops } = recorder();
    draw(ctx, {
      ...scene({ role: "blind", seat: 0, tiles: null, entities: [], self: null }),
      own: { facing: { x: 0, y: 1 }, moving: false, blocked: false },
    });
    expect(ops.filter((o) => o.name === "fillRect" && o.fillStyle !== "#000000")).toEqual([]);
    const body = ops.filter((o) => o.name === "roundRect" && o.fillStyle === ROLE_COLOR.blind);
    expect(body.length).toBeGreaterThan(0);
    expect(body.every((o) => Math.abs(o.globalAlpha - 0.4) < 1e-9)).toBe(true);
    // centred in the canvas
    const args = body[0]?.args as number[];
    expect((args[0] as number) + (args[2] as number) / 2).toBeCloseTo(343 / 2, 0);
  });

  it("hops Can't see's figure while they move, and squashes it when blocked", () => {
    const blind = (own: { moving: boolean; blocked: boolean }) => {
      const { ctx, ops } = recorder();
      draw(ctx, {
        ...scene({ role: "blind", seat: 0, tiles: null, entities: [], self: null, nowMs: 100 }),
        own: { facing: { x: 1, y: 0 }, ...own },
      });
      return ops;
    };
    const y = (ops: Op[]) =>
      ops.find((o) => o.name === "roundRect" && o.fillStyle === ROLE_COLOR.blind)
        ?.args[1] as number;
    expect(y(blind({ moving: true, blocked: false }))).not.toBe(
      y(blind({ moving: false, blocked: false })),
    );
    expect(blind({ moving: true, blocked: true }).some((o) => o.name === "scale")).toBe(true);
  });
});

describe("decodeSeen", () => {
  it('reads "y:x0-x1,x2-x3" rows as inclusive runs of tiles', () => {
    const seen = decodeSeen(["2:3-5", "4:0-1,7-7"]);
    for (const [x, y] of [
      [3, 2],
      [4, 2],
      [5, 2],
      [0, 4],
      [1, 4],
      [7, 4],
    ] as const)
      expect(seen.has(x, y), `${x},${y}`).toBe(true);
    for (const [x, y] of [
      [2, 2],
      [6, 2],
      [3, 1],
      [2, 4],
      [8, 4],
    ] as const)
      expect(seen.has(x, y), `${x},${y}`).toBe(false);
  });
});

describe("mist, night and marks out of sight (FR5, FR7, FR8)", () => {
  const whole = (over: Partial<Scene>) =>
    scene({
      layout: "fit",
      w: 500,
      h: 300,
      entities: [],
      tiles: grid(5, 10),
      self: { x: 2.5, y: 2.5 }, // inside the room: the light is cast from where you stand
      ...over,
    });
  const veilOf = (s: Scene) => {
    const { ctx, ops } = recorder();
    draw(ctx, s);
    return ops.filter((o) => o.name === "fill" && o.fillStyle === WORLD.mist);
  };
  const ALLROWS = (rows: number, cols: number) =>
    Array.from({ length: rows }, (_, y) => `${y}:0-${cols - 1}`);

  it("veils at the mist alpha, as one region, where a block casts a shadow", () => {
    const veils = veilOf(whole({ tiles: grid(5, 10, [[5, 2]]), seen: ALLROWS(5, 10) }));
    expect(veils.length, "one fill for the floor, cut by the light").toBeGreaterThanOrEqual(1);
    expect(veils.every((o) => Math.abs(o.globalAlpha - MIST.alpha) < 1e-9)).toBe(true);
  });

  it("draws no mist for a watcher, who is sent no `seen` and sees the whole room clear", () => {
    expect(veilOf(whole({ tiles: grid(5, 10, [[5, 2]]) }))).toEqual([]);
  });

  describe("the edge of the light is the ray, not the tile", () => {
    // an open room with one block; the server sends every tile as seen
    const blockRoom = (over: Partial<Scene> = {}) =>
      whole({
        tiles: grid(8, 12, [[6, 4]]),
        seen: ALLROWS(8, 12),
        self: { x: 2.3, y: 4.5 },
        w: 600,
        h: 360,
        ...over,
      });
    const trace = (s: Scene) => {
      const { ctx, ops } = recorder();
      draw(ctx, s);
      return ops;
    };
    const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

    it("cuts the veil along the polygon through the block's corners", () => {
      const s = blockRoom();
      const corner = toScreen(camera(s), 6, 4); // the block's north-west corner
      const onPath = trace(s).some(
        (o) =>
          (o.name === "lineTo" || o.name === "moveTo") &&
          near(o.args[0] as number, corner.x) &&
          near(o.args[1] as number, corner.y),
      );
      expect(onPath, "a vertex of the veil's path is the corner").toBe(true);
    });

    it("veils the floor as one region cut by the light, not tile by tile, so the edge has no steps", () => {
      // a wedge of shadow behind the block crosses many tiles; each used to be its own rectangle, and
      // where one switched from "crossed by the edge" to "wholly dark" the edge stepped
      const s = blockRoom();
      const ops = trace(s);
      // the walls' veils are non-zero fills of their own; the floor's is the one even-odd fill
      const veils = ops.filter(
        (o) => o.name === "fill" && o.fillStyle === WORLD.mist && o.args[0] === "evenodd",
      );
      expect(veils.length, "one fill of the floor").toBe(1);
      expect(veils[0]?.args[0], "even-odd: the lit part is punched out").toBe("evenodd");
      const tileRects = ops.filter(
        (o) =>
          o.name === "fillRect" &&
          o.fillStyle === WORLD.mist &&
          near(o.args[2] as number, camera(s).scale + 0.5),
      );
      expect(tileRects, "no tile-sized rectangle of mist on top of it").toEqual([]);
      // The floor veil's clip is made from the floor tiles' rectangles; what stands is clipped to the
      // light as well (one clip per row, plus the plates), but those are made from the light polygon
      // (moveTo and lineTo), never from rectangles. So the clips built from rects are the mist's, and
      // there is one, however many tiles it covers.
      const rectClips = ops.filter((o, i) => {
        if (o.name !== "clip") return false;
        let k = i - 1;
        while (k >= 0 && ops[k]?.name !== "beginPath") k--;
        return ops.slice(k, i).some((x) => x.name === "rect");
      });
      expect(rectClips.length, "the floor is the one clip").toBe(1);
    });

    it("never veils a pixel twice: no seam where two veiled tiles meet", () => {
      // the floor veil is one path and the walls' another, each filled once; overlapping per-tile
      // rectangles doubled the alpha where they met, which at night was a pale outline round a tile
      const fills = trace(blockRoom()).filter(
        (o) => (o.name === "fill" || o.name === "fillRect") && o.fillStyle === WORLD.mist,
      );
      expect(fills.length).toBeLessThanOrEqual(2);
    });

    it("lights a floor tile the ray reaches even if the server's own tile set left it out", () => {
      // The server's `seen` is symmetric shadowcasting and leaves out whole tiles the exact ray lights
      // (the sight room: row 1, x = 15 to 18). The layout is sent whole to every sighted client, so the
      // floor and walls are drawn from the ray; only what STANDS on a tile is filtered by `seen`, and the
      // server does that before it is sent. So an unsent tile the ray reaches is clear, not veiled.
      const s = blockRoom({ seen: ALLROWS(8, 12).map((r) => (r.startsWith("1:") ? "1:0-5" : r)) });
      const reached = toScreen(camera(s), 9, 1); // open ground in plain light; "not sent" from x = 6
      const wholeTile = trace(s).filter(
        (o) =>
          o.name === "fillRect" &&
          o.fillStyle === WORLD.mist &&
          near(o.args[0] as number, reached.x),
      );
      expect(wholeTile, "no whole-tile veil on a tile the ray lights").toEqual([]);
      expect(
        trace(s).filter(
          (o) => o.name === "fill" && o.fillStyle === WORLD.mist && o.args[0] === "evenodd",
        ).length,
        "one fill of the floor",
      ).toBe(1);
    });

    it("veils the front of a wall the light never reaches, whole, and never its top", () => {
      // a wall behind the block, in its shadow
      const s = blockRoom({
        tiles: grid(8, 12, [
          [6, 4],
          [9, 4],
        ]),
      });
      const cam = camera(s);
      const top = toScreen(cam, 9, 4, TILT.wall);
      const topH = cam.scale * TILT.depth; // the top face, from the wall's top edge down; the front is the rest
      const frontH = cam.scale * TILT.wall;
      // the front is veiled as a path: its corners are the box's lower part, from where the top face ends
      const ops = trace(s);
      const at = (x: number, y: number) =>
        ops.some(
          (o) =>
            (o.name === "moveTo" || o.name === "lineTo") &&
            near(o.args[0] as number, x) &&
            near(o.args[1] as number, y),
        );
      const seam = top.y + topH;
      expect(
        at(top.x, seam) && at(top.x + cam.scale, seam) && at(top.x, seam + frontH),
        "the wall's front is veiled whole",
      ).toBe(true);
      expect(
        ops.some(
          (o) =>
            (o.name === "moveTo" || o.name === "lineTo") &&
            near(o.args[0] as number, top.x) &&
            near(o.args[1] as number, top.y),
        ),
        "nothing veils the wall's top",
      ).toBe(false);
    });

    it("does not veil a wall you are looking straight at: a ray lands on its face, so it is lit", () => {
      // a wall column beside you, in plain sight
      const s = whole({
        tiles: grid(5, 10, [
          [0, 0],
          [1, 0],
          [2, 0],
          [3, 0],
          [4, 0],
        ]),
        seen: ALLROWS(5, 10),
        self: { x: 3.5, y: 2.5 },
      });
      const cam = camera(s);
      const top = toScreen(cam, 2, 0, TILT.wall);
      const boxed = trace(s).some(
        (o) =>
          o.name === "rect" && near(o.args[0] as number, top.x) && near(o.args[1] as number, top.y),
      );
      expect(boxed, "the wall in sight is not boxed into the veil").toBe(false);
    });

    it("uses the same blockers the server does: glass passes sight, a vent and a wall stop it", () => {
      // a wall of one kind across the room, with the viewer on one side. What is behind it is veiled
      // when that kind stops sight, so there is a veil fill; behind glass the whole room is lit.
      const across = (ch: string) => {
        const tiles = Array.from({ length: 5 }, () => `...${ch}....`);
        const s = whole({ tiles, seen: ALLROWS(5, 8), self: { x: 1.5, y: 2.5 }, w: 480, h: 300 });
        const cam = camera(s);
        const behind = toScreen(cam, 5, 2);
        // the veil's clip is the floor; the light polygon is what is cut out. Is the point behind the
        // wall inside the polygon? The polygon's vertices are in the recorded lineTo calls.
        // (what stands is clipped to the same polygon too, so take the one the mist cuts out: the path that
        // follows its full-canvas rectangle)
        const ops = trace(s);
        const full = ops.findIndex(
          (o) =>
            o.name === "rect" && o.args[0] === 0 && o.args[1] === 0 && (o.args[2] as number) >= 480,
        );
        const closeAt = ops.findIndex((o, i) => i > full && o.name === "closePath");
        const verts = ops
          .slice(full, closeAt)
          .filter((o) => o.name === "moveTo" || o.name === "lineTo")
          .map((o) => ({ x: o.args[0] as number, y: o.args[1] as number }));
        let inside = false;
        for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
          const a = verts[i] as { x: number; y: number };
          const b = verts[j] as { x: number; y: number };
          if (
            a.y > behind.y + 4 !== b.y > behind.y + 4 &&
            behind.x < ((b.x - a.x) * (behind.y + 4 - a.y)) / (b.y - a.y) + a.x
          )
            inside = !inside;
        }
        return inside;
      };
      expect(across("="), "behind glass is in the light").toBe(true);
      expect(across("%"), "behind a vent is not").toBe(false);
      expect(across("#"), "behind a wall is not").toBe(false);
    });

    it("draws no mist for a watcher, or when you have no position to cast the light from", () => {
      expect(
        trace(whole({ seen: undefined, tiles: grid(8, 12, [[6, 4]]) })).some(
          (o) => o.name === "clip",
        ),
      ).toBe(false);
      expect(
        trace(blockRoom({ self: null })).some(
          (o) => o.name === "fill" && o.fillStyle === WORLD.mist,
        ),
      ).toBe(false);
    });
  });

  it("draws a dark zone as night with a rim, and nothing of the room's layout in it", () => {
    const tiles = grid(5, 10, [[4, 2]], " ");
    const { ctx, ops } = recorder();
    draw(ctx, whole({ tiles }));
    const night = ops.filter((o) => o.name === "fillRect" && o.fillStyle === WORLD.night);
    expect(night.length).toBeGreaterThan(0);
    expect(ops.some((o) => o.name === "fillRect" && o.fillStyle === WORLD.nightRim)).toBe(true);
  });

  it("draws a mark in an unseen tile at 35%, and one in sight at full strength", () => {
    const mark = {
      id: "S1",
      kind: "stamp" as const,
      pos: { x: 8.5, y: 3.5 },
      state: "door" as const,
      age: 0,
    };
    const plate = (s: Scene) => {
      const { ctx, ops } = recorder();
      draw(ctx, s);
      // the mark's own plate: a rounded rect on COLOR.ui
      return ops.filter((o) => o.name === "roundRect" && o.fillStyle === COLOR.ui);
    };
    const faint = plate(whole({ entities: [mark], seen: ["0:0-9"] }));
    expect(faint.length).toBeGreaterThan(0);
    expect(faint.every((o) => Math.abs(o.globalAlpha - 0.35) < 1e-9)).toBe(true);
    const clear = plate(whole({ entities: [mark], seen: ["3:0-9"] }));
    expect(clear.every((o) => o.globalAlpha === 1)).toBe(true);
  });

  describe("edge pills", () => {
    const img = {} as CanvasImageSource;
    const named = (s: Scene) => {
      const { ctx, ops } = recorder();
      draw(ctx, s);
      return ops.filter((o) => o.name === "fillText" && o.args[0] === "Cy");
    };
    const base = (over: Partial<Scene>) =>
      scene({
        layout: "fit",
        w: 400,
        h: 300,
        tiles: grid(6, 40),
        entities: [player(0, 20.5, 3.5), player(1, 20.5, 2.5)], // seat 2, Cy, is not in sight
        self: { x: 20.5, y: 2.5 },
        ...over,
      });

    it("puts a face from a sender out of sight at the edge of the screen on their side", () => {
      const right = named(
        base({ pops: [{ seat: 2, img, fade: 1, from: { x: 39.5, y: 3.5 }, name: "Cy" }] }),
      );
      expect(right.length).toBe(1);
      expect(right[0]?.args[1] as number).toBeGreaterThan(200); // the right half
      const left = named(
        base({ pops: [{ seat: 2, img, fade: 1, from: { x: 0.5, y: 3.5 }, name: "Cy" }] }),
      );
      expect(left[0]?.args[1] as number).toBeLessThan(200);
    });

    it("shows the sender's role shape on it, and a face only while the face lasts", () => {
      const withFace = (alone: boolean) => {
        const { ctx, ops } = recorder();
        draw(
          ctx,
          base({ pops: [{ seat: 2, img, fade: 1, from: { x: 39.5, y: 3.5 }, name: "Cy", alone }] }),
        );
        return ops;
      };
      expect(withFace(false).some((o) => o.name === "drawImage")).toBe(true);
      expect(withFace(true).some((o) => o.name === "drawImage")).toBe(false);
      expect(withFace(true).some((o) => o.fillStyle === ROLE_COLOR.mute)).toBe(true); // Cy's triangle
    });

    it("draws no pill for a sender who is in sight: their face pops over their head instead", () => {
      const inSight = base({
        entities: [player(0, 20.5, 3.5), player(1, 20.5, 2.5), player(2, 22.5, 2.5)],
        pops: [{ seat: 2, img, fade: 1, from: { x: 22.5, y: 2.5 }, name: "Cy" }],
      });
      expect(named(inSight)).toEqual([]);
    });

    it("pills a mark placed outside the screen, and not one on it", () => {
      const mark = (x: number) => ({
        pops: [
          { seat: 2 as const, fade: 1, from: { x, y: 3.5 }, name: "Cy", mark: "door" as const },
        ],
        layout: "follow" as const,
        w: 343,
        h: 300,
      });
      expect(named(base(mark(38.5))).length).toBe(1);
      expect(named(base(mark(20.5)))).toEqual([]);
    });

    it("pills a door that opened off screen, on its side, in the door's colour; on screen, none", () => {
      const door = (x: number): Partial<Scene> => ({
        pops: [{ seat: null, fade: 1, from: { x, y: 3.5 }, name: "Door", mark: "door" }],
        layout: "follow",
        w: 343,
        h: 300,
      });
      const drawn = (s: Scene) => {
        const { ctx, ops } = recorder();
        draw(ctx, s);
        return ops;
      };
      const off = drawn(base(door(38.5)));
      const pills = off.filter((o) => o.name === "roundRect" && o.strokeStyle === WORLD.door);
      expect(pills.length).toBe(1);
      expect(pills[0]?.args[0] as number, "on the right half").toBeGreaterThan(150);
      expect(off.some((o) => o.name === "fillText" && o.args[0] === "Door")).toBe(true);
      const left = drawn(base(door(0.5))).filter(
        (o) => o.name === "roundRect" && o.strokeStyle === WORLD.door,
      );
      expect(left[0]?.args[0] as number).toBeLessThan(150);
      const on = drawn(base(door(20.5))).filter(
        (o) => o.name === "roundRect" && o.strokeStyle === WORLD.door,
      );
      expect(on).toEqual([]);
    });
  });
});

describe("the world rises (FR25)", () => {
  const room = (rise: number | undefined) =>
    scene({
      layout: "fit",
      w: 500,
      h: 300,
      tiles: grid(5, 10, [[4, 2]]),
      entities: [],
      ...(rise === undefined ? {} : { rise }),
    });
  // the wall's front face: the fillRect drawn in the wall-front colour
  const frontOf = (s: Scene) => {
    const { ctx, ops } = recorder();
    draw(ctx, s);
    return ops.filter((o) => o.name === "fillRect" && o.fillStyle === WORLD.wallFront);
  };

  it("rise 0 draws walls with no height (the flat plan), and rise 1 full height", () => {
    const flat = frontOf(room(0));
    const full = frontOf(room(1));
    expect(flat.length).toBeGreaterThan(0);
    // fillRect height is the wall's height plus half a pixel of overlap against seams
    expect(flat.every((o) => (o.args[3] as number) < 1)).toBe(true);
    const cam = camera(room(1));
    expect(
      full.some((o) => Math.abs((o.args[3] as number) - (TILT.wall * cam.scale + 0.5)) < 1e-6),
    ).toBe(true);
  });

  it("rise 0 projects depth as a full tile, and rise 1 at 0.82", () => {
    for (const [rise, depth] of [
      [0, 1],
      [1, TILT.depth],
    ] as const) {
      const s = room(rise);
      draw(recorder().ctx, s); // a frame sets the projection it draws with
      const cam = camera(s);
      const dy = toScreen(cam, 0, 1).y - toScreen(cam, 0, 0).y;
      expect(dy / cam.scale, `rise ${rise}`).toBeCloseTo(depth, 6);
    }
  });

  it("is full height when no rise is given, and one frame's rise never leaks into the next", () => {
    draw(recorder().ctx, room(0));
    const next = frontOf(room(undefined));
    const cam = camera(room(undefined));
    expect(
      next.some((o) => Math.abs((o.args[3] as number) - (TILT.wall * cam.scale + 0.5)) < 1e-6),
    ).toBe(true);
  });

  it("halfway is between: a wall half its height", () => {
    const half = frontOf(room(0.5)).map((o) => o.args[3] as number);
    const cam = camera(room(0.5));
    expect(half.some((h) => Math.abs(h - (TILT.wall * 0.5 * cam.scale + 0.5)) < 1e-6)).toBe(true);
  });

  it("fades Can't see's own figure in as the world rises, over the first 400 ms of 900", () => {
    const body = (rise: number) => {
      const { ctx, ops } = recorder();
      draw(ctx, {
        ...scene({ role: "blind", seat: 0, tiles: null, entities: [], self: null, rise }),
        own: { facing: { x: 1, y: 0 }, moving: false, blocked: false },
      });
      return (
        ops.find((o) => o.name === "roundRect" && o.fillStyle === ROLE_COLOR.blind)?.globalAlpha ??
        -1
      );
    };
    expect(body(0)).toBeLessThan(0.01);
    expect(body(0.2)).toBeGreaterThan(0.01);
    expect(body(0.2)).toBeLessThan(0.4);
    expect(body(1)).toBeCloseTo(0.4, 9);
  });
});

describe("a wall in front of a figure fades by distance, smoothly (a radius, not a tile)", () => {
  const cam = { scale: 40, ox: 0, oy: 60 };
  const at = (x: number, y: number) => ({ x, y });
  // the projection is set by the frame being drawn, so a test of it starts from a risen world
  beforeEach(() => setRise(1));

  it("is 35% where it covers the figure, full strength far away, and between in the radius", () => {
    expect(wallAlpha(cam, 2, 6, [at(2.5, 5.5)])).toBeCloseTo(0.35, 6);
    expect(wallAlpha(cam, 12, 6, [at(2.5, 5.5)])).toBe(1);
    const near = wallAlpha(cam, 3, 6, [at(2.5, 5.5)]); // its centre is a tile from the figure: in the radius
    expect(near).toBeGreaterThan(0.35);
    expect(near).toBeLessThan(1);
  });

  it("changes a little at a time as the figure walks along the wall: no tile flips", () => {
    // a wall row two tiles south of the figure, walked past at 0.05 of a tile a step
    const row = [1, 2, 3, 4, 5, 6];
    let prev: number[] | null = null;
    let worst = 0;
    for (let x = 0.5; x <= 7.5; x += 0.05) {
      const now = row.map((wx) => wallAlpha(cam, wx, 6, [at(x, 5.5)]));
      if (prev)
        for (const [i, a] of now.entries())
          worst = Math.max(worst, Math.abs(a - (prev[i] as number)));
      prev = now;
    }
    // the old rule jumped 0.65 at a tile edge; a smooth radius moves a few percent per step
    expect(worst).toBeLessThan(0.1);
  });

  it("only fades walls south of the figure: one behind it covers nothing", () => {
    expect(wallAlpha(cam, 2, 4, [at(2.5, 5.5)])).toBe(1);
  });

  it("takes the nearest of several figures", () => {
    const both = wallAlpha(cam, 2, 6, [at(9.5, 5.5), at(2.5, 5.5)]);
    expect(both).toBeCloseTo(0.35, 6);
  });

  it("does nothing while the world is still flat (no wall height to see through)", () => {
    draw(recorder().ctx, { ...scene({ layout: "fit", w: 400, h: 300 }), rise: 0 });
    expect(wallAlpha(cam, 2, 6, [at(2.5, 5.5)])).toBe(1);
  });

  it("covers a figure by how much of it the walls in front hide, from none to all", () => {
    const walls = grid(8, 8, [
      [2, 6],
      [3, 6],
    ]);
    expect(figureCover(cam, at(2.5, 5.5), walls)).toBeGreaterThan(0.5);
    expect(figureCover(cam, at(6.5, 2.5), walls)).toBe(0);
    const edge = figureCover(cam, at(3.95, 5.5), walls); // half behind the wall's end
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(figureCover(cam, at(3.5, 5.5), walls));
  });
});

describe("the outline of a figure behind a wall is the figure (it cannot lag)", () => {
  const behind = (over: Partial<Scene>) =>
    scene({
      layout: "fit",
      w: 400,
      h: 300,
      nowMs: 130,
      tiles: grid(7, 5, [[2, 6]]),
      entities: [{ ...player(1, 2.5, 5.5), facing: { x: 1, y: 0 }, moving: true }],
      self: { x: 2.5, y: 5.5 },
      ...over,
    });
  const shapes = (s: Scene) => {
    const { ctx, ops } = recorder();
    draw(ctx, s);
    const pill = ops.filter((o) => o.name === "roundRect" && o.fillStyle === ROLE_COLOR.deaf);
    const ghost = ops.filter(
      (o) =>
        o.name === "roundRect" &&
        (o.lineDash as number[]).length > 0 &&
        o.strokeStyle === WORLD.line,
    );
    return { pill, ghost };
  };

  it("is drawn at your predicted position, not the server's", () => {
    // the server says x = 2.5, the client has already walked to x = 3.0
    const { pill, ghost } = shapes(behind({ self: { x: 3.0, y: 5.5 } }));
    expect(ghost.length).toBeGreaterThan(0);
    expect(ghost[0]?.args[0]).toBe(pill[0]?.args[0]);
  });

  it("hops with the figure, to the same pixel", () => {
    const { pill, ghost } = shapes(behind({}));
    expect(ghost[0]?.args.slice(0, 4)).toEqual(pill[0]?.args.slice(0, 4));
  });

  it("stands still with the figure under reduced motion too", () => {
    const { pill, ghost } = shapes(behind({ reducedMotion: true }));
    expect(ghost[0]?.args.slice(0, 4)).toEqual(pill[0]?.args.slice(0, 4));
  });

  it("is drawn after the wall, so the wall does not cover it", () => {
    const { ctx, ops } = recorder();
    draw(ctx, behind({}));
    const wallFront = ops.findLastIndex(
      (o) => o.name === "fillRect" && o.fillStyle === WORLD.wallFront,
    );
    const ghost = ops.findIndex(
      (o) =>
        o.name === "roundRect" &&
        (o.lineDash as number[]).length > 0 &&
        o.strokeStyle === WORLD.line,
    );
    expect(ghost).toBeGreaterThan(wallFront);
  });

  it("is absent when no wall is in front of the figure", () => {
    const { ghost } = shapes(behind({ tiles: grid(7, 5) }));
    expect(ghost).toEqual([]);
  });

  it("follows the squash and lean of the figure: the same transforms are applied to it", () => {
    const { ctx, ops } = recorder();
    draw(
      ctx,
      behind({
        entities: [{ ...player(1, 2.5, 5.5), facing: { x: 1, y: 0 }, moving: true, blocked: true }],
      }),
    );
    expect(ops.filter((o) => o.name === "scale").length).toBeGreaterThanOrEqual(2); // pill and outline
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

// Escape-room objects (phase 02 Task 8). A room with every new kind in it, drawn the ways a player
// can see it: phone and desktop scale, reduced motion, high contrast.
describe("stations, gear and signals", () => {
  const ROOM2 = [
    "############",
    "#..........#",
    "#.....H....#",
    "#..........#",
    "#..........#",
    "############",
  ];
  const at = (x: number, y: number) => ({ x, y });
  const station = (
    id: string,
    type: NonNullable<EntityView["station"]>["type"],
    pos: { x: number; y: number },
    shows: number[],
    parts: NonNullable<EntityView["station"]>["parts"],
    solved = false,
  ): EntityView => ({ id, kind: "station", pos, station: { type, shows, solved, parts } });
  const everything: EntityView[] = [
    station(
      "Q1",
      "dial",
      at(2.5, 1.5),
      [7],
      [
        { key: "anchor", at: [at(2, 1)] },
        { key: "pads", at: [at(1, 2), at(3, 2)] },
        { key: "back", at: [at(2, 3)] },
      ],
    ),
    station(
      "Q2",
      "wires",
      at(5.5, 1.5),
      [0, 1, 2, 3, 4, 5],
      [
        { key: "anchor", at: [at(5, 1)] },
        { key: "wires", at: [at(4, 1), at(5, 1), at(6, 1), at(7, 1), at(8, 1), at(9, 1)] },
      ],
    ),
    station(
      "Q3",
      "keypad",
      at(8.5, 3.5),
      [4, 2],
      [
        { key: "anchor", at: [at(8, 3)] },
        { key: "keys", at: [at(8, 3), at(9, 3), at(10, 3), at(8, 4), at(9, 4), at(10, 4)] },
      ],
    ),
    station(
      "Q4",
      "radio",
      at(1.5, 4.5),
      [3, 2],
      [
        { key: "anchor", at: [at(1, 4)] },
        { key: "pads", at: [at(2, 4), at(3, 4)] },
      ],
    ),
    station(
      "Q5",
      "switches",
      at(4.5, 4.5),
      [1, 0, 1],
      [
        { key: "anchor", at: [at(4, 4)] },
        { key: "buttons", at: [at(4, 4), at(5, 4), at(6, 4)] },
        { key: "lamps", at: [at(4, 3), at(5, 3), at(6, 3)] },
      ],
    ),
    station(
      "Q6",
      "bells",
      at(7.5, 2.5),
      [1, 0, 2],
      [
        { key: "anchor", at: [at(7, 2)] },
        { key: "bells", at: [at(7, 2), at(8, 2), at(9, 2), at(10, 2)] },
        { key: "tune", at: [at(10, 1)] },
      ],
    ),
    station(
      "Q7",
      "vault",
      at(3.5, 3.5),
      [],
      [
        { key: "anchor", at: [at(3, 3)] },
        { key: "sockets", at: [at(2, 3), at(4, 3)] },
      ],
      true,
    ),
    station(
      "Q8",
      "sync",
      at(9.5, 4.5),
      [],
      [
        { key: "anchor", at: [at(9, 4)] },
        { key: "keys", at: [at(9, 4), at(10, 4)] },
      ],
    ),
    { id: "g1", kind: "gear", pos: at(6.5, 2.5), item: "goggles" },
    { id: "g2", kind: "gear", pos: at(6.5, 2.5), item: "stethoscope" },
    { id: "H1", kind: "hatch", pos: at(6.5, 2.5) },
    { id: "b1", kind: "bell", pos: at(1.5, 1.5), state: "on" },
    { id: "l1", kind: "lamp", pos: at(10.5, 1.5) },
    { id: "u1", kind: "ink", pos: at(5.5, 3.5), text: "7 3" },
    { id: "uv0", kind: "uv", pos: at(5.5, 3.5), polys: [[at(4, 2), at(7, 2), at(7, 5), at(4, 5)]] },
    { ...player(0, 2.5, 3.5), item: "earpiece", heldBy: 1, dyed: true },
    { ...player(1, 3.5, 3.5), item: "uv", holding: 0, dyed: true },
    { ...player(2, 5.5, 2.5), item: "goggles", dyed: true },
  ];
  // the server sends a station's wire as an entity of its own (screenshots 105 to 107); a test scene adds the one it would
  const withWires = (over: Partial<Scene>): Partial<Scene> => {
    const tiles = over.tiles ?? ROOM2;
    const wires = (over.entities ?? []).flatMap((e): EntityView[] => {
      const route = e.station ? linkOf(e.station, tiles) : null;
      return route ? [{ id: `${e.id}.wire`, kind: "wire", pos: route[0] as Vec, route }] : [];
    });
    return { ...over, entities: [...(over.entities ?? []), ...wires] };
  };
  const room = (over: Partial<Scene> = {}) =>
    scene({
      tiles: ROOM2,
      entities: everything,
      self: { x: 3.5, y: 3.5 },
      nowMs: 1234,
      ...withWires({ ...over, entities: over.entities ?? everything }),
    });

  it.each([
    ["phone", { w: 343, h: 500 }],
    ["desktop", { w: 1280, h: 600 }],
    ["reduced motion", { reducedMotion: true }],
    ["high contrast", {}],
    ["no clock", { nowMs: undefined }],
  ] as const)("draws every new kind without throwing (%s)", (name, over) => {
    if (name === "high contrast") setContrast(true);
    const { ctx, ops } = recorder();
    expect(() => draw(ctx, room(over))).not.toThrow();
    // each station and each new kind left a mark of its own
    expect(ops.some((o) => o.fillStyle === WORLD.steel || o.fillStyle === WORLD.brass)).toBe(true);
    setContrast(false);
  });

  it("gives every code colour its pattern: wires 1-6 are six different patterned swatches", () => {
    const { ctx, ops } = recorder();
    draw(ctx, room({ w: 1280, h: 600 }));
    for (const k of [
      "codeRed",
      "codeBlue",
      "codeYellow",
      "codeGreen",
      "codeWhite",
      "codeBlack",
    ] as const)
      expect(
        ops.some((o) => o.name === "fill" && o.fillStyle === WORLD[k]),
        k,
      ).toBe(true);
    // the five patterns over the swatches are strokes in the line colour, never another fill colour
    expect(
      ops.filter((o) => o.name === "stroke" && o.strokeStyle === WORLD.line).length,
    ).toBeGreaterThan(20);
  });

  it("draws ink only inside a clip on the pool: its text is never filled outside one", () => {
    const { ctx, ops } = recorder();
    draw(ctx, room({ w: 1280, h: 600 }));
    let depth = 0;
    let clipped = 0; // the save depth at which the current clip was set; 0 = none
    const clips: number[] = [];
    for (const o of ops) {
      if (o.name === "save") depth++;
      if (o.name === "restore") {
        if (clips.at(-1) === depth) clips.pop();
        depth--;
      }
      if (o.name === "clip") clips.push(depth);
      clipped = clips.length;
      if (o.name === "fillText" && o.args[0] === "7 3") expect(clipped).toBeGreaterThan(0);
    }
    expect(ops.some((o) => o.name === "fillText" && o.args[0] === "7 3")).toBe(true);
  });

  it("draws no ink without a pool: an ink entity alone is not drawn", () => {
    const { ctx, ops } = recorder();
    draw(ctx, room({ entities: everything.filter((e) => e.kind !== "uv") }));
    expect(ops.some((o) => o.name === "fillText" && o.args[0] === "7 3")).toBe(false);
  });

  it("wires a dial to its back only where a wall is between them (Task 47)", () => {
    const dial = (back: { x: number; y: number }) =>
      station(
        "Q1",
        "dial",
        at(1.5, 1.5),
        [],
        [
          { key: "anchor", at: [at(1, 1)] },
          { key: "back", at: [back] },
        ],
      );
    const faint = (tiles: string[], back: { x: number; y: number }) => {
      const { ctx, ops } = recorder();
      draw(ctx, room({ tiles, entities: [dial(back), player(1, 3.5, 3.5)] }));
      return ops.filter(
        (o) =>
          o.name === "stroke" &&
          o.strokeStyle === WORLD.line &&
          o.globalAlpha < 1 &&
          o.lineDash.length > 0,
      ).length;
    };
    // room 4's first safe: the back box is on the same open floor (no wall tile on the line)
    expect(faint(grid(7, 12), at(4, 3)), "open floor: no wire").toBe(0);
    // room 4's second safe: a wall (a vent counts, it blocks sight and bodies) lies on the line
    expect(faint(grid(7, 12, [[3, 2]]), at(4, 3)), "through a wall: a wire").toBeGreaterThan(0);
    expect(faint(grid(7, 12, [[3, 2]], "%"), at(4, 3)), "through a vent: a wire").toBeGreaterThan(
      0,
    );
  });

  it("draws a cache dial's back tile as a flat inspection plate with no wire, and a safe's as a plinth (Task 66)", () => {
    const dial = (cache: boolean): EntityView => ({
      ...station(
        "Q1",
        "dial",
        at(1.5, 1.5),
        [],
        [
          { key: "anchor", at: [at(1, 1)] },
          { key: "back", at: [at(4, 3)] },
        ],
      ),
      station: {
        type: "dial",
        shows: [],
        solved: false,
        parts: [
          { key: "anchor", at: [at(1, 1)] },
          { key: "back", at: [at(4, 3)] },
        ],
        ...(cache ? { cache: true as const } : {}),
      },
    });
    const ops = (cache: boolean) => {
      const { ctx, ops } = recorder();
      // a wall lies between the dial and its back, which wires an ordinary safe
      draw(
        ctx,
        room({ tiles: grid(7, 12, [[3, 2]]), entities: [dial(cache), player(1, 3.5, 3.5)] }),
      );
      return ops;
    };
    const wire = (o: ReturnType<typeof ops>) =>
      o.filter(
        (x) =>
          x.name === "stroke" &&
          x.strokeStyle === WORLD.line &&
          x.globalAlpha < 1 &&
          x.lineDash.length > 0,
      ).length;
    // the plate is the one faint steel wash laid flat over the tile; the plinth is a block with no wash
    const plates = (o: ReturnType<typeof ops>) =>
      o.filter((x) => x.name === "fillRect" && x.fillStyle === WORLD.steel && x.globalAlpha < 0.6)
        .length;
    const cacheOps = ops(true);
    const safeOps = ops(false);
    expect(plates(cacheOps), "a cache dial draws the plate").toBe(1);
    expect(plates(safeOps), "an ordinary safe draws no plate").toBe(0);
    expect(wire(cacheOps), "no wire to a cache dial's plate").toBe(0);
    expect(wire(safeOps), "an ordinary safe is still wired through the wall").toBeGreaterThan(0);
  });

  it("ends a bells wire at the middle of the bells, not at the first bell (Task 47)", () => {
    const bells = [at(1, 1), at(2, 1), at(3, 1), at(4, 1)];
    const st = station(
      "Q1",
      "bells",
      at(1.5, 1.5),
      [],
      [
        { key: "anchor", at: [bells[0] as { x: number; y: number }] },
        { key: "bells", at: bells },
        { key: "tune", at: [at(2, 4)] },
      ],
    );
    const { ctx, ops } = recorder();
    draw(ctx, room({ tiles: grid(7, 12), entities: [st, player(1, 3.5, 3.5)] }));
    const cam = camera(room({ tiles: grid(7, 12), entities: [st, player(1, 3.5, 3.5)] }));
    const start = ops.find(
      (o) => o.name === "moveTo" && o.globalAlpha < 1 && o.lineDash.length > 0,
    );
    expect(start, "the wire starts somewhere").toBeDefined();
    const mid = toScreen(cam, 3, 1.5); // the mean of the bell tiles' centres: x 1.5..4.5 -> 3
    expect(Math.abs((start?.args[0] as number) - mid.x)).toBeLessThan(1e-6);
  });

  it("splatters a dyed figure with blotches, in dye colours", () => {
    const { ctx, ops } = recorder();
    draw(ctx, room({ w: 1280, h: 600 }));
    const dye = [WORLD.dyePink, WORLD.dyeMint, WORLD.dyeSky];
    expect(
      ops.filter((o) => o.name === "fill" && dye.includes(o.fillStyle as string)).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("joins a safe to its back box and a music box to its tune box with a wire (Task 35)", () => {
    const linked = (type: "dial" | "bells", key: "back" | "tune", to: { x: number; y: number }) =>
      station(
        "Q1",
        type,
        at(1.5, 1.5),
        [],
        [
          { key: "anchor", at: [at(1, 1)] },
          { key: key, at: [to] },
        ],
      );
    for (const [type, key] of [
      ["dial", "back"],
      ["bells", "tune"],
    ] as const) {
      const wired = recorder();
      // a wall tile on the straight line from the anchor (1,1) to the remote part (4,3): a dial's
      // back is wired only through a wall (Task 47)
      const walled = grid(7, 12, [[3, 2]]);
      draw(
        wired.ctx,
        room({ tiles: walled, entities: [linked(type, key, at(4, 3)), player(1, 3.5, 3.5)] }),
      );
      const bare = recorder();
      const alone = station("Q1", type, at(1.5, 1.5), [], [{ key: "anchor", at: [at(1, 1)] }]);
      draw(bare.ctx, room({ tiles: walled, entities: [alone, player(1, 3.5, 3.5)] }));
      const wires = (ops: { name: string; strokeStyle: unknown; globalAlpha: number }[]) =>
        ops.filter((o) => o.name === "stroke" && o.strokeStyle === WORLD.line && o.globalAlpha < 1);
      expect(wires(wired.ops).length, `${type}: a faint wire is stroked`).toBeGreaterThan(
        wires(bare.ops).length,
      );
    }
  });

  it("draws a practice lever thrown one way or the other, and dims its station while it is on (Task 38)", () => {
    // not room(): that one always draws the shared list of every kind, whatever it is given
    const own = (over: Partial<Scene>) =>
      scene({ tiles: ROOM2, self: { x: 3.5, y: 3.5 }, nowMs: 1234, w: 1280, h: 600, ...over });
    const keypad = (practice: boolean): EntityView => {
      const e = station(
        "Q2",
        "keypad",
        at(1.5, 1.5),
        [],
        [
          { key: "anchor", at: [at(1, 1)] },
          { key: "keys", at: [at(5, 1), at(6, 1), at(7, 1)] },
        ],
      );
      if (practice && e.station) e.station.practice = true;
      return e;
    };
    const lever = (on: boolean): EntityView => ({
      id: "v1",
      kind: "lever",
      pos: at(3.5, 3.5),
      ...(on ? { state: "on" as const } : {}),
    });
    const handle = (on: boolean) => {
      const { ctx, ops } = recorder();
      draw(ctx, own({ entities: [lever(on), player(1, 2.5, 2.5)] }));
      // the handle is the stroked line out of the lever's pivot (its moveTo), thrown to the left
      // (off) or the right (on); the figure drawn after it makes lines of its own
      const i = ops.findIndex(
        (o, k) => o.name === "moveTo" && ops[k + 1]?.name === "lineTo" && o.lineWidth >= 3,
      );
      const pivot = ops[i]?.args as number[];
      const end = ops[i + 1]?.args as number[];
      return [(end[0] as number) - (pivot[0] as number)];
    };
    const off = handle(false);
    const on = handle(true);
    expect(off, "the lever is drawn off").toBeDefined();
    expect(on, "the lever is drawn on").toBeDefined();
    expect(on[0]).toBeGreaterThan(off[0] as number); // thrown the other way

    const keyFills = (practice: boolean) => {
      const { ctx, ops } = recorder();
      draw(ctx, own({ entities: [keypad(practice), player(1, 3.5, 3.5)] }));
      return ops.filter((o) => o.name === "fillRect" && o.fillStyle === WORLD.steel);
    };
    const alphas = (practice: boolean) => keyFills(practice).map((o) => o.globalAlpha);
    expect(Math.max(...alphas(false))).toBe(1);
    expect(Math.max(...alphas(true)), "while practising the keys are dimmed").toBeLessThan(1);
  });

  it("draws a keypad's keys alone: its anchor is not a box (Task 35, room 8's stray box)", () => {
    // the anchor is only where the station is named; it stands apart from the keys, as room 8's does
    const keypad = station(
      "Q2",
      "keypad",
      at(1.5, 1.5),
      [],
      [
        { key: "anchor", at: [at(1, 1)] },
        { key: "keys", at: [at(5, 1), at(6, 1), at(7, 1)] },
      ],
    );
    const { ctx, ops } = recorder();
    draw(ctx, room({ entities: [keypad, player(1, 3.5, 3.5)] }));
    // a plinth is the only thing drawn with the steel front colour; the floor keys use the top only
    expect(ops.filter((o) => o.name === "fillRect" && o.fillStyle === WORLD.steelFront)).toEqual(
      [],
    );
  });

  it("draws a station's furniture without its state when only its parts are in sight", () => {
    const { ctx, ops } = recorder();
    const furniture = station(
      "Q5",
      "switches",
      at(4.5, 4.5),
      [],
      [
        { key: "anchor", at: [at(4, 4)] },
        { key: "buttons", at: [at(4, 4), at(5, 4), at(6, 4)] },
        { key: "lamps", at: [at(4, 3), at(5, 3), at(6, 3)] },
      ],
    );
    if (furniture.station) furniture.station.furniture = true;
    draw(ctx, room({ entities: [furniture, player(1, 3.5, 3.5)] }));
    expect(ops.some((o) => o.fillStyle === WORLD.steel)).toBe(true); // the buttons
    expect(ops.some((o) => o.fillStyle === WORLD.lamp)).toBe(false); // no lamp lit
  });
});

describe("clues drawn (escape-room Task 11)", () => {
  const ROOM3 = ["##########", "#........#", "#........#", "#........#", "##########"];
  const at = (x: number, y: number) => ({ x, y });
  const base = (entities: EntityView[]) =>
    scene({
      tiles: ROOM3,
      entities: [player(1, 2.5, 2.5), ...entities],
      self: { x: 2.5, y: 2.5 },
      w: 1280,
      h: 600,
    });
  const px = (font: unknown) => Number(/(\d+(?:\.\d+)?)px/.exec(String(font))?.[1] ?? 0);

  it("writes a sign's text on its plaque, in lines never below 11 px", () => {
    const text = "Red before blue, and never the last wire.";
    for (const w of [1280, 375]) {
      const { ctx, ops } = recorder();
      draw(ctx, { ...base([{ id: "S1", kind: "sign", pos: at(4.5, 1.5), shows: [], text }]), w });
      const lines = ops.filter((o) => o.name === "fillText" && /\w/.test(String(o.args[0])));
      expect(lines.map((o) => o.args[0]).join(" ")).toBe(text);
      for (const o of lines)
        expect(px((o as unknown as { font: unknown }).font)).toBeGreaterThanOrEqual(11);
    }
  });

  it("keeps a tall plaque's whole plate inside the canvas at any window height (Task 35)", () => {
    const text = "Cut the wire that matches the lamp, then the one after it, and never the last.";
    for (const h of [600, 300, 200, 140]) {
      for (const w of [1280, 375]) {
        const { ctx, ops } = recorder();
        draw(
          ctx,
          scene({
            tiles: ROOM3,
            entities: [
              player(1, 2.5, 2.5),
              { id: "S1", kind: "sign", pos: at(4.5, 1.5), shows: [], text },
            ],
            self: { x: 2.5, y: 2.5 },
            w,
            h,
          }),
        );
        const plate = ops.find((o) => o.name === "roundRect" && (o.args[4] as number) === 4);
        const [x, y, pw, ph] = (plate?.args ?? []) as number[];
        expect(plate, `${w}x${h}: a plate was drawn`).toBeDefined();
        expect(x, `${w}x${h}: left edge`).toBeGreaterThanOrEqual(0);
        expect(y, `${w}x${h}: top edge`).toBeGreaterThanOrEqual(0);
        expect((x ?? 0) + (pw ?? 0), `${w}x${h}: right edge`).toBeLessThanOrEqual(w);
        expect((y ?? 0) + (ph ?? 0), `${w}x${h}: bottom edge`).toBeLessThanOrEqual(h);
      }
    }
  });

  it("wraps UV ink to the light it sits in, at a readable size, so no line is cut by the rim (Task 37)", () => {
    const text = "More than one yellow wire: cut the first yellow wire.";
    for (const w of [1280, 375]) {
      const { ctx, ops } = recorder();
      // a recorder whose text is as wide as text is: 0.56 of the font size a character
      const font = () =>
        Number(
          /(\d+(?:\.\d+)?)px/.exec(String((ctx as unknown as { font: string }).font))?.[1] ?? 0,
        );
      (ctx as unknown as { measureText: (t: string) => { width: number } }).measureText = (t) => ({
        width: t.length * 0.56 * font(),
      });
      const scn = base([
        { id: "u1", kind: "ink", pos: at(4.5, 2.5), text },
        {
          id: "uv0",
          kind: "uv",
          pos: at(4.5, 2.5),
          polys: [[at(2, 0), at(7, 0), at(7, 5), at(2, 5)]],
        },
      ]);
      draw(ctx, { ...scn, w });
      const cam = camera({ ...scn, w });
      const lines = ops.filter(
        (o) => o.name === "fillText" && /\w/.test(String(o.args[0])) && o.fillStyle === WORLD.uvInk,
      );
      expect(lines.map((o) => o.args[0]).join(" "), `${w}: every word is still there`).toBe(text);
      const pool = 5 * cam.scale; // the lit pool is at most 5 tiles across
      for (const o of lines) {
        const px = Number(
          /(\d+(?:\.\d+)?)px/.exec(String((o as unknown as { font: string }).font))?.[1] ?? 0,
        );
        expect(px, `${w}: not below the plate minimum`).toBeGreaterThanOrEqual(11);
        expect(
          String(o.args[0]).length * 0.56 * px,
          `${w}: "${o.args[0]}" fits the pool`,
        ).toBeLessThanOrEqual(pool);
      }
    }
  });

  it("puts UV ink on the wall's face, inside the lit pool and not on its edge (Task 37)", () => {
    // the ink is on a wall tile (3, 3): the pool the server casts is floor only, so it ends at the
    // wall's top edge, y = 3. Every line of the ink must sit above that edge on screen.
    const text = "No red wires: cut the second wire.";
    for (const w of [1280, 375]) {
      const { ctx, ops } = recorder();
      const font = () =>
        Number(
          /(\d+(?:\.\d+)?)px/.exec(String((ctx as unknown as { font: string }).font))?.[1] ?? 0,
        );
      (ctx as unknown as { measureText: (t: string) => { width: number } }).measureText = (t) => ({
        width: t.length * 0.56 * font(),
      });
      const scn = {
        ...base([
          { id: "u1", kind: "ink", pos: at(2.5, 3.5), text },
          {
            id: "uv0",
            kind: "uv",
            pos: at(2.5, 2.5),
            polys: [[at(0.5, 0.5), at(4.5, 0.5), at(4.5, 3), at(0.5, 3)]],
          },
        ]),
        tiles: ["#######", "#.....#", "#.....#", "#######"],
        w,
      };
      draw(ctx, scn);
      const cam = camera(scn);
      const edge = toScreen(cam, 0, 3).y; // the pool's lower edge, on screen
      const lines = ops.filter((o) => o.name === "fillText" && o.fillStyle === WORLD.uvInk);
      expect(lines.length, `${w}: the ink is drawn`).toBeGreaterThan(0);
      for (const o of lines) {
        const px = Number(
          /(\d+(?:\.\d+)?)px/.exec(String((o as unknown as { font: string }).font))?.[1] ?? 0,
        );
        // a line is drawn centred on its y, so its bottom is half its height below that
        expect(
          (o.args[2] as number) + px / 2,
          `${w}: "${o.args[0]}" ends above the pool's edge`,
        ).toBeLessThanOrEqual(edge);
      }
    }
  });

  // Task 43: the UV light has no ring, the ink fits the left wall, and the pool's clip shows what is lit
  const wideText = (ctx: CanvasRenderingContext2D) => {
    const font = () =>
      Number(/(\d+(?:\.\d+)?)px/.exec(String((ctx as unknown as { font: string }).font))?.[1] ?? 0);
    (ctx as unknown as { measureText: (t: string) => { width: number } }).measureText = (t) => ({
      width: t.length * 0.56 * font(),
    });
  };
  const uvScene = (inkAt: number, poolFrom: number, poolTo: number, w = 1280) => ({
    ...base([
      { id: "u1", kind: "ink", pos: at(inkAt, 3.5), text: "Wire 2: cut it" },
      {
        id: "uv0",
        kind: "uv",
        pos: at(poolFrom + 2.5, 2.5),
        polys: [[at(poolFrom, 0.5), at(poolTo, 0.5), at(poolTo, 3), at(poolFrom, 3)]],
      },
    ]),
    tiles: ["#".repeat(12), `#${".".repeat(10)}#`, `#${".".repeat(10)}#`, "#".repeat(12)],
    w,
  });

  it("strokes a dashed ring round the UV light, with no spoke to its centre (Task 43)", () => {
    for (const high of [false, true]) {
      setContrast(high);
      const { ctx, ops } = recorder();
      wideText(ctx);
      // a full-circle pool as the server sends it: the torch first, then rays round to where they began
      const centre = at(3.5, 2);
      const ring = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => {
        const a = (k / 8) * 2 * Math.PI - Math.PI;
        return at(3.5 + 2 * Math.cos(a), 2 + 1.2 * Math.sin(a));
      });
      const scn = {
        ...uvScene(1.5, 1, 6),
        entities: [{ id: "uv0", kind: "uv", pos: centre, polys: [[centre, ...ring]] }],
      } as ReturnType<typeof uvScene>;
      draw(ctx, scn);
      const cam = camera(scn);
      const mid = toScreen(cam, centre.x, centre.y);
      const strokeAt = ops.findIndex(
        (o) => o.name === "stroke" && o.lineDash.length > 0 && o.strokeStyle !== undefined,
      );
      expect(strokeAt, `high contrast ${high}: a dashed ring is stroked`).toBeGreaterThan(-1);
      const began = ops
        .slice(0, strokeAt)
        .map((o) => o.name)
        .lastIndexOf("beginPath");
      const path = ops
        .slice(began, strokeAt)
        .filter((o) => o.name === "moveTo" || o.name === "lineTo");
      expect(path.length, "the ring's points were traced").toBe(ring.length);
      const spokes = path.filter(
        (o) =>
          Math.abs((o.args[0] as number) - mid.x) < 1e-6 &&
          Math.abs((o.args[1] as number) - mid.y) < 1e-6,
      );
      expect(spokes, `high contrast ${high}: no vertex at the torch, so no spoke`).toEqual([]);
      setContrast(false);
    }
  });

  it("keeps an ink wider than the room to its left wall on screen and off the wall's far side (Task 43)", () => {
    for (const w of [1280, 375]) {
      const { ctx, ops } = recorder();
      wideText(ctx);
      const scn = uvScene(1.2, 0.5, 5.5, w);
      draw(ctx, scn);
      const cam = camera(scn);
      const wall = toScreen(cam, 0, 0).x; // the left wall tile's outer edge
      const lines = ops.filter((o) => o.name === "fillText" && o.fillStyle === WORLD.uvInk);
      expect(lines.length, `${w}: the ink is drawn`).toBeGreaterThan(0);
      for (const o of lines) {
        const px = Number(
          /(\d+(?:\.\d+)?)px/.exec(String((o as unknown as { font: string }).font))?.[1] ?? 0,
        );
        const left = (o.args[1] as number) - (String(o.args[0]).length * 0.56 * px) / 2;
        expect(left, `${w}: "${o.args[0]}" starts on screen`).toBeGreaterThanOrEqual(0);
        expect(left, `${w}: "${o.args[0]}" starts inside the wall's face`).toBeGreaterThanOrEqual(
          wall - 1e-6,
        );
      }
    }
  });

  it("still draws the lit part of an ink when the torch stands tiles to its right (Task 43)", () => {
    const { ctx, ops } = recorder();
    wideText(ctx);
    // the ink is at x 3.5; the pool is 5 tiles across, 3 tiles to its right: only its tail is lit
    draw(ctx, uvScene(3.5, 5, 10));
    const clip = ops.findIndex((o) => o.name === "clip");
    const text = ops.findIndex((o) => o.name === "fillText" && o.fillStyle === WORLD.uvInk);
    expect(clip, "a clip is set").toBeGreaterThan(-1);
    expect(text, "the ink is filled, under the pool's clip").toBeGreaterThan(clip);
    // and the clip is the pool: the polygon's far corner was traced into the path before it
    const cam = camera(uvScene(3.5, 5, 10));
    const far = toScreen(cam, 10, 0.5);
    expect(
      ops
        .slice(0, clip)
        .some(
          (o) =>
            (o.name === "lineTo" || o.name === "moveTo") &&
            Math.abs((o.args[0] as number) - far.x) < 1e-6,
        ),
      "the clip path is the pool's polygon",
    ).toBe(true);
  });

  it("keeps a label chip off UV ink where the ink is drawn: wrapped, on the wall's face (Task 37)", () => {
    const text = "More than one yellow wire: cut the first yellow wire.";
    for (const w of [1280, 375]) {
      const { ctx, ops } = recorder();
      const font = () =>
        Number(
          /(\d+(?:\.\d+)?)px/.exec(String((ctx as unknown as { font: string }).font))?.[1] ?? 0,
        );
      (ctx as unknown as { measureText: (t: string) => { width: number } }).measureText = (t) => ({
        width: t.length * 0.56 * font(),
      });
      const scn = {
        ...base([
          { id: "u1", kind: "ink", pos: at(2.5, 3.5), text },
          {
            id: "uv0",
            kind: "uv",
            pos: at(2.5, 2.5),
            polys: [[at(0.5, 0.5), at(4.5, 0.5), at(4.5, 3), at(0.5, 3)]],
          },
        ]),
        tiles: ["#######", "#.....#", "#.....#", "#######"],
        // a chip pointing at the ink, as the Plaque label does
        labels: [
          { text: "Plaque: a rule for another room. Some are only in UV ink", at: at(2.5, 3.5) },
        ],
        w,
      };
      draw(ctx, scn);
      const lines = ops.filter((o) => o.name === "fillText" && o.fillStyle === WORLD.uvInk);
      const chips = ops
        .filter((o) => o.name === "roundRect" && (o.args[4] as number) === 8)
        .map((o) => o.args as [number, number, number, number]);
      expect(chips.length, `${w}: the chip is drawn`).toBe(1);
      const [cx, cy, cw, ch] = chips[0] as [number, number, number, number];
      for (const o of lines) {
        const px = Number(
          /(\d+(?:\.\d+)?)px/.exec(String((o as unknown as { font: string }).font))?.[1] ?? 0,
        );
        const width = String(o.args[0]).length * 0.56 * px;
        const x = (o.args[1] as number) - width / 2;
        const y = (o.args[2] as number) - px / 2;
        const apart = x + width <= cx || cx + cw <= x || y + px <= cy || cy + ch <= y;
        expect(apart, `${w}: chip ${[cx, cy, cw, ch]} on ink "${o.args[0]}"`).toBe(true);
      }
    }
  });

  it("draws a tug of war as a taut, thicker line with strain ticks, not the slack arc (Task 40)", () => {
    const pair = (pulling: boolean): EntityView[] => [
      { ...player(0, 4.5, 2.5), holding: 1, ...(pulling ? { pulling: true } : {}) },
      { ...player(1, 3.5, 2.5), heldBy: 0, ...(pulling ? { pulling: true } : {}) },
    ];
    const draws = (pulling: boolean) => {
      const { ctx, ops } = recorder();
      draw(ctx, own({ entities: pair(pulling) }));
      // the hold is drawn in the UI colour: its stroke and its width, and whether it bends
      const strokes = ops.filter((o) => o.name === "stroke" && o.strokeStyle === COLOR.ui);
      const curved = ops.some((o) => o.name === "quadraticCurveTo");
      // another 4 px UI stroke is the figure's own ring and is in both pictures: it is the number of
      // them that a tug changes, by one (the taut line itself)
      const thick = strokes.filter((o) => o.lineWidth >= 4).length;
      const ticks = ops.filter((o) => o.name === "lineTo" && o.strokeStyle === COLOR.ui).length;
      return { curved, thick, ticks };
    };
    const own = (over: Partial<Scene>) =>
      scene({ tiles: ROOM3, self: { x: 3.5, y: 3.5 }, nowMs: 1234, w: 1280, h: 600, ...over });
    const slack = draws(false);
    const taut = draws(true);
    expect(slack.curved, "a held hand is a slack arc").toBe(true);
    expect(taut.curved, "a tug is straight").toBe(false);
    expect(taut.thick, "and thicker: one more heavy stroke, the taut line").toBe(slack.thick + 1);
    expect(taut.ticks, "with strain ticks across it").toBeGreaterThan(slack.ticks);
  });

  it("draws a target card's lit lamps with rays and its hollow ones unfilled", () => {
    const { ctx, ops } = recorder();
    draw(ctx, base([{ id: "T1", kind: "card", pos: at(4.5, 2.5), card: [1, 0, 1, 0, 0, 1] }]));
    expect(ops.filter((o) => o.name === "fill" && o.fillStyle === WORLD.lamp)).toHaveLength(3);
    // every lamp is outlined, lit or hollow, so the hollow ones are drawn too
    expect(ops.filter((o) => o.name === "arc").length).toBeGreaterThanOrEqual(6);
  });

  it("draws the motif on a station and a solved wing's symbol plate", () => {
    const parts = [{ key: "anchor" as const, at: [at(5, 2)] }];
    const plain: EntityView = {
      id: "Q1",
      kind: "station",
      pos: at(5.5, 2.5),
      station: { type: "radio", shows: [0], solved: false, parts },
    };
    const marked: EntityView = {
      ...plain,
      station: { type: "radio", shows: [0], solved: true, parts, motif: "moon", reveal: 2 },
    };
    const a = recorder();
    draw(a.ctx, base([plain]));
    const b = recorder();
    draw(b.ctx, base([marked]));
    const count = (ops: Op[]) => ops.filter((o) => o.name === "fill" || o.name === "stroke").length;
    expect(count(b.ops)).toBeGreaterThan(count(a.ops) + 4);
  });

  // The user: in room 9 the "Safe" name plate hid the safe's symbol, and the symbol hid the solved tick. The brass name
  // plate is gone (the user, screenshot 97: "players have the option of using labels"); the symbol plate and the tick
  // plate still each need a spot of their own.
  it("a solved safe that reveals a symbol keeps its symbol and tick from covering each other", () => {
    const parts = [{ key: "anchor" as const, at: [at(5, 3)] }];
    const safe: EntityView = {
      id: "Q1",
      kind: "station",
      pos: at(5.5, 3.5),
      station: { type: "dial", shows: [4], solved: true, parts, motif: "star", reveal: 2 },
    };
    const { ctx, ops } = recorder();
    draw(ctx, base([safe, player(1, 3.5, 5.5)]));
    // the two plates are the card-coloured symbol plate (0.5 tile square) and the brass tick plate (0.44 x 0.32)
    const rects = ops
      .filter((o) => o.name === "roundRect")
      .map((o) => {
        const [x, y, w, h] = o.args as number[];
        return {
          x: x as number,
          y: y as number,
          w: w as number,
          h: h as number,
          fill: o.fillStyle,
        };
      });
    const symbol = rects.find((r) => r.fill === WORLD.card && Math.abs(r.w - r.h) < 1 && r.w > 12);
    const brass = rects.filter((r) => r.fill === WORLD.brass);
    expect(symbol, "the symbol plate is drawn").toBeDefined();
    expect(brass.length, "the tick plate is drawn, and no name plate").toBe(1);
    const overlap = (a: (typeof rects)[number], b: (typeof rects)[number]) =>
      a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    for (const plate of brass) {
      if (!symbol) continue;
      expect(overlap(symbol, plate), "a brass plate covers the symbol").toBe(false);
    }
  });

  it("lights the teaching safe's lamp only when shows[1] is 1", () => {
    const parts = [{ key: "anchor" as const, at: [at(5, 2)] }];
    const safe = (shows: number[]): EntityView => ({
      id: "Q1",
      kind: "station",
      pos: at(5.5, 2.5),
      station: { type: "dial", shows, solved: false, parts, teach: true },
    });
    const lit = recorder();
    draw(lit.ctx, base([safe([4, 1])]));
    const off = recorder();
    draw(off.ctx, base([safe([3, 0])]));
    const lamp = (ops: Op[]) => ops.filter((o) => o.name === "fill" && o.fillStyle === WORLD.lamp);
    expect(lamp(lit.ops).length).toBe(1);
    expect(lamp(off.ops).length).toBe(0);
  });
});

// Label chips (DESIGN.md 4.6): each stays readable, never under another, however many crowd one edge.
// What stands out of your light is cut by the light's edge, the way a cone of light cuts an object in a
// dark room: the object is drawn whole and in its one fixed place, inside a clip to the lit region, so a
// half-lit object shows its lit half and an unlit one shows nothing. It is never re-laid-out by what part
// of it you can see (the user saw a keypad's keys, and a "Wires" label, move as the cone moved).
describe("what stands out of the light is cut by the light, not re-drawn (review rounds 2 and 3)", () => {
  const TILES = [
    "############",
    "#..........#",
    "#..........#",
    "#..........#",
    "#..........#",
    "############",
  ];
  const BOXED = TILES.map((r, y) => (y >= 1 && y <= 4 ? `${r.slice(0, 5)}#${r.slice(6)}` : r));
  const at = (x: number, y: number) => ({ x, y });
  const SEEN_ALL = Array.from({ length: 6 }, (_, y) => `${y}:0-11`);
  const keypad = (): EntityView => ({
    id: "Q1",
    kind: "station",
    pos: at(7.5, 2.5),
    station: {
      type: "keypad",
      shows: [],
      solved: false,
      furniture: true,
      parts: [
        {
          key: "keys",
          at: [
            at(7, 2),
            at(8, 2),
            at(9, 2),
            at(7, 3),
            at(8, 3),
            at(9, 3),
            at(7, 4),
            at(8, 4),
            at(9, 4),
          ],
        },
      ],
    },
  });
  const frame = (over: Partial<Scene>) => {
    const { ctx, ops } = recorder();
    draw(
      ctx,
      scene({
        layout: "fit",
        w: 600,
        h: 320,
        tiles: TILES,
        self: at(2.5, 3.5),
        seat: 1,
        seen: SEEN_ALL,
        entities: [],
        ...over,
      }),
    );
    return ops;
  };
  const labelsDrawn = (ops: Op[]) =>
    ops
      .filter((o) => o.name === "fillText")
      .map((o) => `${o.args[0]}@${Math.round(o.args[1] as number)}`);

  it("draws a station whole, in the same place, whatever part of it the light reaches", () => {
    // one tile of the keypad lit, then all of it: the keys' labels must come out identical
    const oneTile = ["1:0-7", "2:0-7", "3:0-7", "4:0-7", "0:0-11", "5:0-11"];
    const a = labelsDrawn(frame({ entities: [keypad()], seen: oneTile }));
    const b = labelsDrawn(frame({ entities: [keypad()], seen: SEEN_ALL }));
    expect(a).toEqual(b);
    expect(a.filter((l) => /^\d@/.test(l)).length, "nine numbered keys, none renumbered").toBe(9);
  });

  // the clips made from the light polygon (a path of lines), as opposed to the mist's (a path of rects)
  const lightClips = (ops: Op[]) =>
    ops.flatMap((o, i) => {
      if (o.name !== "clip") return [];
      let k = i - 1;
      while (k >= 0 && ops[k]?.name !== "beginPath") k--;
      return ops.slice(k, i).some((x) => x.name === "lineTo") ? [i] : [];
    });

  // The polygons a clip was made of (a path of lines), and whether a screen point is inside one.
  const clipPieces = (ops: Op[], clip: number) => {
    let k = clip - 1;
    while (k >= 0 && ops[k]?.name !== "beginPath") k--;
    const pieces: { x: number; y: number }[][] = [];
    for (const o of ops.slice(k, clip)) {
      if (o.name === "moveTo") pieces.push([{ x: o.args[0] as number, y: o.args[1] as number }]);
      else if (o.name === "lineTo")
        pieces.at(-1)?.push({ x: o.args[0] as number, y: o.args[1] as number });
    }
    return pieces;
  };
  const insidePiece = (pts: { x: number; y: number }[], x: number, y: number) => {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i] as { x: number; y: number };
      const b = pts[j] as { x: number; y: number };
      if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  };

  // A pillar at (6, 2) in the open room: a viewer at (2.5, 3.5) has its shadow fall across the lamp at
  // (7.5, 2.5)'s ground, so the lamp is crossed by the shadow's edge, and one at (5.5, 1.5) beside the pillar
  // is lit whole.
  const PILLAR = TILES.map((r, y) => (y === 2 ? `${r.slice(0, 6)}#${r.slice(7)}` : r));
  const lampAt = (x: number, y: number) => ({ id: "l1", kind: "lamp" as const, pos: at(x, y) });

  it("draws a lamp the shadow's edge crosses inside a clip on that edge, rather than dropped", () => {
    const ops = frame({ tiles: PILLAR, entities: [lampAt(7.5, 3.5)], self: at(5.5, 3.5) });
    const clips = lightClips(ops);
    // the lamp's own drawing comes after a clip made from the shadow's edge, before its restore
    const drawnUnder = clips.some((c) => {
      for (let k = c + 1; k < ops.length && ops[k]?.name !== "restore"; k++)
        if (ops[k]?.name === "stroke" || ops[k]?.name === "fill") return true;
      return false;
    });
    expect(clips.length, "a thing the edge crosses is clipped").toBeGreaterThan(0);
    expect(drawnUnder, "and it is drawn inside that clip").toBe(true);
  });

  it("draws a lamp the light fully covers whole, with no clip around it", () => {
    const bare = lightClips(frame({ entities: [], self: at(2.5, 3.5) })).length;
    const ops = frame({ entities: [lampAt(5.5, 3.5)], self: at(2.5, 3.5) });
    expect(
      ops.some((o) => o.name === "stroke"),
      "the lamp is drawn",
    ).toBe(true);
    expect(lightClips(ops).length, "no clip of its own").toBe(bare);
  });

  // the user saw an open door's dashed slot flicker in and out as they moved by a hair
  it("clips an open door's floor slot to the light, like the rest of what is on the floor", () => {
    const door: EntityView = { id: "D1", kind: "door", pos: at(9.5, 3.5), state: "open" };
    const ops = frame({ entities: [door] });
    const dashAt = ops.findIndex(
      (o) => o.name === "setLineDash" && (o.args[0] as number[]).length > 0,
    );
    expect(dashAt, "the slot is drawn").toBeGreaterThan(-1);
    let k = dashAt - 1;
    while (k >= 0 && ops[k]?.name !== "clip" && ops[k]?.name !== "restore") k--;
    expect(ops[k]?.name, "under a clip, not after a restore").toBe("clip");
    expect(lightClips(ops)).toContain(k);
  });

  // The user: a figure against the top wall had its head cut off. The light polygon is the floor's
  // outline, but what stands rises above the floor on screen, so the clip must reach up as far as the
  // tallest thing that stands (a wall-hung panel, a figure's head).
  it("clips a figure at a wall by its own column, so it keeps its head", () => {
    const { ctx, ops } = recorder();
    const s = scene({
      layout: "fit",
      w: 600,
      h: 320,
      tiles: TILES,
      self: at(2.5, 3.5),
      seat: 1,
      seen: SEEN_ALL,
      entities: [player(2, 4.5, 1.2)],
    });
    draw(ctx, s);
    const cam = camera(s);
    // the first light clip is the flat floor layer's; the next is the figure's own column
    expect(lightClips(ops).length, "a floor clip and a figure's clip").toBeGreaterThanOrEqual(2);
    const pieces = clipPieces(ops, lightClips(ops)[1] as number);
    // a point at the height of the figure's head, straight above its feet: above the floor outline
    // (the north wall's foot is y = 1), so a clip that stopped at the floor line would cut it off
    const head = toScreen(cam, 4.5, 1.2, 1.4);
    const floorEdge = toScreen(cam, 4.5, 1);
    expect(head.y, "the head is above the floor outline on screen").toBeLessThan(floorEdge.y);
    expect(
      pieces.some((p) => insidePiece(p, head.x, head.y)),
      "a point on the figure's head is inside its clip",
    ).toBe(true);
  });

  // The same cut head, on a crate pushed against the north wall (the user's second screenshot). Whatever
  // stands is covered by the clip, so test the region itself: a point a crate's height above the floor
  // edge, and above a figure's head, must be inside it.
  it("keeps a crate against the north wall whole: its top is inside its own clip", () => {
    const { ctx, ops } = recorder();
    const sc = scene({
      layout: "fit",
      w: 600,
      h: 320,
      tiles: TILES,
      self: at(2.5, 3.5),
      seat: 1,
      seen: SEEN_ALL,
      entities: [{ id: "B1", kind: "crate", pos: at(4.5, 1.5) }],
    });
    draw(ctx, sc);
    const cam = camera(sc);
    expect(lightClips(ops).length, "a floor clip and the crate's clip").toBeGreaterThanOrEqual(2);
    const pieces = clipPieces(ops, lightClips(ops)[1] as number);
    // the crate's top face, near its back edge: above the floor outline on screen
    const top = toScreen(cam, 4.5, 1.15, TILT.block);
    expect(top.y, "the top is above the floor outline").toBeLessThan(toScreen(cam, 4.5, 1).y);
    expect(
      pieces.some((p) => insidePiece(p, top.x, top.y)),
      "a point on the crate's top is inside its clip",
    ).toBe(true);
  });

  // The user: a camera was drawn although the cone below it, on veiled floor, was not. The swept clip
  // reaches up past the floor edge for heads and crates, so it must not be what decides whether a thing
  // is there: an object whose own tile the light does not touch is not drawn at all.
  it("does not draw a thing standing on a tile the light does not reach, even just above lit floor", () => {
    // a wall row at y = 2 with the viewer south of it; the camera is on the far side, one tile north of lit floor
    const tiles = [
      "############",
      "#..........#",
      "############",
      "#..........#",
      "#..........#",
      "############",
    ];
    const seen = ["3:0-10", "4:0-10", "2:0-11", "0:0-11", "1:0-11", "5:0-11"];
    const camera = {
      id: "C1",
      kind: "camera" as const,
      pos: at(8.5, 1.5),
      state: "watching" as const,
      facing: { x: 0, y: 1 },
    };
    const crate = { id: "B1", kind: "crate" as const, pos: at(8.5, 1.5) };
    const lit = { id: "B2", kind: "crate" as const, pos: at(8.5, 3.5) };
    const strokes = (e: EntityView) => {
      const ops = frame({ tiles, seen, self: at(2.5, 3.5), entities: [e] });
      return ops.filter((o) => o.name === "fill" || o.name === "stroke" || o.name === "fillRect")
        .length;
    };
    const none = frame({ tiles, seen, self: at(2.5, 3.5), entities: [] });
    const base = none.filter(
      (o) => o.name === "fill" || o.name === "stroke" || o.name === "fillRect",
    ).length;
    expect(strokes(lit), "a crate on lit floor is drawn").toBeGreaterThan(base);
    expect(strokes(crate), "a crate behind the wall, on unlit floor, is not").toBe(base);
    expect(strokes(camera), "a camera on unlit floor is not").toBe(base);
  });

  // The clip to the light is made for every row and layer of a frame; sweeping it upward by one quad per
  // edge of the light polygon made five times the canvas calls (86,000 a frame in room 7) and stalled
  // every walking spec. It must stay a small multiple of the polygon, not of its edges times the rows.
  it("builds the clip to the light cheaply: a few path points per vertex, not a quad per edge", () => {
    const ops = frame({ entities: [keypad()] });
    const clips = lightClips(ops);
    expect(clips.length).toBeGreaterThan(0);
    const points = ops.filter((o) => o.name === "moveTo" || o.name === "lineTo").length;
    const perClip = points / (clips.length + 1);
    // a polygon of n vertices, projected, plus a copy lifted by a wall's height, plus its two joins
    const light = ops.slice(
      ops.findIndex((o) => o.name === "rect" && o.args[0] === 0 && o.args[1] === 0),
    );
    const closeAt = light.findIndex((o) => o.name === "closePath");
    const n = light
      .slice(0, closeAt)
      .filter((o) => o.name === "moveTo" || o.name === "lineTo").length;
    expect(perClip, "path points per clip").toBeLessThanOrEqual(4 * n + 8);
  });

  // The user: a door far from them was "invisible, just mist"; close up it was a door. A closed door is
  // a block like a wall, so it is drawn with the walls, under the veil, whether or not the light reaches
  // it: a door inside the clip to the light was cut away to nothing outside it.
  it("draws a closed door's block outside the clip to the light, as a wall is", () => {
    const door: EntityView = { id: "D1", kind: "door", pos: at(9.5, 3.5), state: "closed" };
    const ops = frame({ entities: [door], self: at(2.5, 3.5) });
    // a closed door is a top, a front and then a seam: nothing on the floor layer draws all three
    const seam = ops.findIndex((o) => o.name === "fillRect" && o.fillStyle === WORLD.doorSeam);
    expect(seam, "the closed door is drawn").toBeGreaterThan(-1);
    // walk back from its seam to the nearest clip or restore: it must not be a clip to the light
    let k = seam - 1;
    while (k >= 0 && ops[k]?.name !== "clip" && ops[k]?.name !== "restore") k--;
    expect(lightClips(ops), "not inside a clip to the light").not.toContain(k);
  });

  // The user: the camera's cone vanished with the camera, but it should clip cleanly with the light cone.
  // A camera's body stands on its own tile (dropped when that tile is not lit); its cone is a floor shape
  // that reaches onto lit floor, so it is drawn whenever any of it is in the light.
  it("draws a camera's cone on lit floor even when the camera's own tile is not in the light", () => {
    // the camera is on the far side of a wall row, one tile north of lit floor, looking south through glass
    const tiles = [
      "############",
      "#..........#",
      "######=#####",
      "#..........#",
      "#..........#",
      "############",
    ];
    const seen = ["3:0-10", "4:0-10", "2:0-11", "0:0-11", "1:0-11", "5:0-11"];
    const cam: EntityView = {
      id: "C1",
      kind: "camera",
      pos: at(6.5, 1.5),
      state: "watching",
      facing: { x: 0, y: 1 },
      cone: { fovDeg: 90, range: 6 },
    };
    const ops = frame({ tiles, seen, self: at(2.5, 3.5), entities: [cam] });
    // the cone is hatched (a fillRect at the 0.18 wash, then diagonal strokes): its colour is the watch colour
    const cone = ops.filter((o) => o.name === "fillRect" && o.fillStyle === WORLD.watch).length;
    expect(cone, "the cone is drawn on the lit floor").toBeGreaterThan(0);
    // and the camera's body (its lens, an arc) is not: its own tile is not lit
    const none = frame({ tiles, seen, self: at(2.5, 3.5), entities: [] });
    const arcs = (o: Op[]) => o.filter((x) => x.name === "arc").length;
    expect(arcs(ops), "the camera body is not drawn").toBe(arcs(none));
  });

  // What lies flat on the floor is cut by the exact outline of the lit floor; only what stands is swept
  // up, so a cone or a slot at a wall does not show above the lit edge.
  it("cuts the floor layer by the exact light outline, with no sweep upward", () => {
    const door: EntityView = { id: "D1", kind: "door", pos: at(9.5, 3.5), state: "open" };
    const ops = frame({ entities: [door], self: at(2.5, 3.5) });
    const slot = ops.findIndex(
      (o) => o.name === "setLineDash" && (o.args[0] as number[]).length > 0,
    );
    let k = slot - 1;
    while (k >= 0 && ops[k]?.name !== "clip") k--;
    let start = k;
    while (start > 0 && ops[start]?.name !== "beginPath") start--;
    // the polygon's own point count is the mist's; a swept clip adds a quad per up-facing edge
    const full = ops.findIndex((o) => o.name === "rect" && o.args[0] === 0 && o.args[1] === 0);
    const closeAt = ops.findIndex((o, i) => i > full && o.name === "closePath");
    const n = ops
      .slice(full, closeAt)
      .filter((o) => o.name === "moveTo" || o.name === "lineTo").length;
    const points = ops
      .slice(start, k)
      .filter((o) => o.name === "moveTo" || o.name === "lineTo").length;
    expect(points, "the floor clip is the polygon alone").toBe(n);
  });

  // The user (image 38): one pad lit, the other veiled, and the veiled one still showed through the mist.
  // Every part of a station is invisible where the station is: the floor parts (pads, keys, sockets) are
  // drawn inside the clip to the exact light, as what lies on the floor is.
  it("draws a station's floor keys inside the clip to the light, so a veiled key is not shown", () => {
    const ops = frame({ entities: [keypad()] });
    const clips = new Set(lightClips(ops));
    const strokes = ops.flatMap((o, i) => (o.name === "strokeRect" ? [i] : []));
    expect(strokes.length, "the keypad's keys are drawn").toBeGreaterThan(0);
    // is op `i` inside a clip to the light that is still open (its save not yet restored)?
    const insideLightClip = (i: number) => {
      let closed = 0;
      for (let k = i - 1; k >= 0; k--) {
        const name = ops[k]?.name;
        if (name === "restore") closed++;
        else if (name === "save") {
          if (closed > 0) closed--;
        } else if (name === "clip" && closed === 0 && clips.has(k)) return true;
      }
      return false;
    };
    for (const i of strokes) expect(insideLightClip(i), `key at op ${i}`).toBe(true);
  });

  it("draws no clip to the light for a watcher, who has no light", () => {
    const ops = frame({ entities: [keypad()], seen: undefined, self: undefined });
    expect(lightClips(ops)).toEqual([]);
  });
});

describe("label chips", () => {
  it("never sit on a plaque's text, even a chip that points at the plaque (Task 34)", () => {
    const { ctx, ops } = recorder();
    const sign: EntityView = {
      id: "S1",
      kind: "sign",
      pos: { x: 4.5, y: 3.5 },
      shows: [],
      text: "Cut the wire that matches the lamp.",
    };
    const labels = [{ text: "Plaque: a rule for another room", at: { x: 4.5, y: 3.5 } }];
    draw(
      ctx,
      scene({
        w: 1280,
        h: 600,
        tiles: ["##########", "#........#", "#........#", "#........#", "#........#", "##########"],
        entities: [player(1, 2.5, 2.5), sign],
        self: { x: 2.5, y: 2.5 },
        labels,
      }),
    );
    const rects = (radius: number) =>
      ops
        .filter((o) => o.name === "roundRect" && (o.args[4] as number) === radius)
        .map((o) => o.args as [number, number, number, number]);
    const plaque = rects(4);
    const chips = rects(8);
    expect(plaque).toHaveLength(1);
    expect(chips).toHaveLength(1);
    const [px, py, pw, ph] = plaque[0] as [number, number, number, number];
    const [cx, cy, cw, ch] = chips[0] as [number, number, number, number];
    const apart = px + pw <= cx || cx + cw <= px || py + ph <= cy || cy + ch <= py;
    expect(apart, `plaque ${plaque[0]} vs chip ${chips[0]}`).toBe(true);
  });

  // The user: the riddle chip is always open at the frame's top-left, and a label chip drawn under its
  // corner was half hidden (room 8). The chip is DOM, so the game measures it and passes its box.
  it("keep clear of a box the page says is taken, such as the riddle chip", () => {
    const labels = [{ text: "Safe: a dial", at: { x: 2.5, y: 1.5 } }];
    const tiles = [
      "##########",
      "#........#",
      "#........#",
      "#........#",
      "#........#",
      "##########",
    ];
    const chipsWith = (avoid?: [number, number, number, number][]) => {
      const { ctx, ops } = recorder();
      const sc = scene({
        w: 1280,
        h: 600,
        tiles,
        entities: [player(1, 2.5, 2.5)],
        self: { x: 2.5, y: 2.5 },
        labels,
        report: { chips: [], plaques: [] },
        ...(avoid ? { avoid: avoid.map(([x, y, w, h]) => ({ x, y, w, h })) } : {}),
      });
      draw(ctx, sc);
      void ops;
      return sc.report?.chips[0] as { x: number; y: number; w: number; h: number };
    };
    const free = chipsWith();
    // the riddle chip sits over exactly where that label wanted to go
    const taken: [number, number, number, number] = [
      free.x - 10,
      free.y - 10,
      free.w + 20,
      free.h + 20,
    ];
    const moved = chipsWith([taken]);
    const [tx, ty, tw, th] = taken;
    const apart =
      tx + tw <= moved.x ||
      moved.x + moved.w <= tx ||
      ty + th <= moved.y ||
      moved.y + moved.h <= ty;
    expect(apart, `chip ${JSON.stringify(moved)} vs riddle ${taken}`).toBe(true);
  });

  it("never draw one chip over another, even five crowded at the screen's right edge", () => {
    const { ctx, ops } = recorder();
    const labels = Array.from({ length: 5 }, (_, i) => ({
      text: `Thing ${i}: a sentence long enough to wrap onto two lines in its chip`,
      at: { x: 46.5, y: 1.5 + i * 0.2 },
    }));
    draw(ctx, scene({ w: 1280, h: 600, labels, self: { x: 44.5, y: 3.5 } }));
    const chips = ops
      .filter((o) => o.name === "roundRect" && (o.args[4] as number) === 8)
      .map((o) => o.args as number[]);
    expect(chips.length).toBeGreaterThan(0);
    for (const [i, a] of chips.entries())
      for (const b of chips.slice(i + 1)) {
        const [ax, ay, aw, ah] = a as [number, number, number, number];
        const [bx, by, bw, bh] = b as [number, number, number, number];
        const apart = ax + aw <= bx || bx + bw <= ax || ay + ah <= by || by + bh <= ay;
        expect(apart, `${a} vs ${b}`).toBe(true);
      }
  });
});

// The clip to the light is swept up by SWEEP_TILES so what stands is not cut at the floor's edge. It
// must cover the tallest thing that stands: measured here from the real draw routines, so a thing drawn
// taller later fails this instead of being quietly cut off at a wall (a head, an arrow, a camera).
describe("the sweep of the clip to the light covers everything that stands", () => {
  const cam = { scale: 50, ox: 0, oy: 0 };
  const foot = toScreen(cam, 5.5, 3.5);
  const reach = (run: (ctx: CanvasRenderingContext2D) => void): number => {
    let minY = Number.POSITIVE_INFINITY;
    const state: Record<string, unknown> = {};
    const note = (y: unknown) => {
      if (typeof y === "number") minY = Math.min(minY, y);
    };
    const ctx = new Proxy(
      {},
      {
        get: (_t, n) => {
          if (String(n) in state) return state[String(n)];
          if (n === "measureText") return () => ({ width: 10 });
          if (n === "createLinearGradient") return () => ({ addColorStop() {} });
          return (...a: unknown[]) => {
            const k = String(n);
            if (k === "arc" || k === "ellipse") note((a[1] as number) - (a[2] as number));
            else if (k === "quadraticCurveTo") note(a[1]), note(a[3]);
            else if (k === "bezierCurveTo") note(a[1]), note(a[3]), note(a[5]);
            else if (
              [
                "moveTo",
                "lineTo",
                "rect",
                "fillRect",
                "strokeRect",
                "roundRect",
                "fillText",
              ].includes(k)
            )
              note(a[1]);
          };
        },
        set: (_t, n, v) => {
          state[String(n)] = v;
          return true;
        },
      },
    ) as unknown as CanvasRenderingContext2D;
    run(ctx);
    return (foot.y - minY) / cam.scale;
  };
  const sc = {
    layout: "fit",
    w: 600,
    h: 320,
    role: "deaf",
    seat: 1,
    roles: ["blind", "deaf", "mute"],
    tiles: [],
    entities: [],
    self: { x: 5.5, y: 3.5 },
  } as unknown as Scene;
  const at = { x: 5.5, y: 3.5 };

  it("gives each standing thing a column at least as tall as it is drawn", () => {
    const measured: [string, number][] = [
      [
        "player",
        reach((c) =>
          drawPlayer(c, { id: "P1", kind: "player", pos: at, seat: 1 } as never, cam, sc),
        ),
      ],
      [
        "crate",
        reach((c) => drawStanding(c, { id: "B1", kind: "crate", pos: at } as never, cam, sc)),
      ],
      [
        "camera",
        reach((c) =>
          drawHazard(
            c,
            {
              id: "C1",
              kind: "camera",
              pos: at,
              state: "watching",
              facing: { x: 0, y: 1 },
            } as never,
            cam,
            sc,
          ),
        ),
      ],
      ["bell", reach((c) => drawBell(c, { id: "b1", kind: "bell", pos: at } as never, cam, sc))],
      ["lamp", reach((c) => drawLampSwitch(c, { id: "l1", kind: "lamp", pos: at } as never, cam))],
      [
        "gear",
        reach((c) =>
          drawGear(c, { id: "g1", kind: "gear", pos: at, item: "goggles" } as never, cam, false),
        ),
      ],
    ];
    expect(Math.max(...measured.map(([, h]) => h)), "the tallest standing thing").toBeGreaterThan(
      3,
    );
    for (const [kind, drawn] of measured) {
      const column = HEIGHT[kind] as number;
      expect(column, `${kind}: its column covers what is drawn`).toBeGreaterThanOrEqual(drawn);
      // and no taller by more than a hair: the mist leaves the column out, so every extra tile of it is
      // an unveiled patch above the thing, over whatever veiled floor or wall is behind
      expect(column, `${kind}: its column is no taller than it is drawn`).toBeLessThanOrEqual(
        drawn + 0.12,
      );
    }
  });
});
