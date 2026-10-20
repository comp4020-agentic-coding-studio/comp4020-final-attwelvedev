import { beforeEach, describe, expect, it } from "vitest";
import { figureCover, wallAlpha } from "./render/occlusion.ts";
import { easeCamera, setRise, TILT, toScreen } from "./render/project.ts";
import { decodeSeen } from "./render/sight.ts";
import { camera, draw, type Scene } from "./render.ts";
import { COLOR, MAP, MIST, ROLE_COLOR, WORLD } from "./tokens.ts";

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
        if (name === "save") return () => saved.push({ ...state });
        if (name === "restore") return () => Object.assign(state, saved.pop());
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
  const wash = (s: Scene) => {
    const { ctx, ops } = recorder();
    draw(ctx, s);
    return ops.filter((o) => o.name === "fillRect" && o.fillStyle === WORLD.mist);
  };

  it("draws an unseen tile under the mist colour, and a seen one not", () => {
    const rows = (n: number) => Array.from({ length: n }, (_, y) => `${y}:0-9`);
    const veiled = wash(whole({ seen: ["0:0-9", "1:0-9"] }));
    expect(veiled.length).toBeGreaterThan(0);
    expect(veiled.every((o) => Math.abs(o.globalAlpha - MIST.alpha) < 1e-9)).toBe(true);
    expect(wash(whole({ seen: rows(5) }))).toEqual([]); // all in sight: no mist at all
    expect(wash(whole({}))).toEqual([]); // a watcher is sent no `seen`: no mist
  });

  it("veils walls out of sight too, up to their tops", () => {
    const s = whole({ tiles: grid(5, 10, [[4, 4]]), seen: ["0:0-9", "1:0-9", "2:0-9", "3:0-9"] });
    const cam = camera(s);
    const top = toScreen(cam, 4, 4, TILT.wall).y;
    expect(wash(s).some((o) => Math.abs((o.args[1] as number) - top) < 1e-6)).toBe(true);
  });

  describe("the edge of the light is the ray, not the tile", () => {
    const ALL = (rows: number, cols: number) =>
      Array.from({ length: rows }, (_, y) => `${y}:0-${cols - 1}`);
    // an open room with one block; the server sends every tile as seen
    const blockRoom = (over: Partial<Scene> = {}) => {
      const tiles = grid(8, 12, [[6, 4]]);
      return whole({
        tiles,
        seen: ALL(8, 12),
        self: { x: 2.3, y: 4.5 },
        w: 600,
        h: 360,
        ...over,
      });
    };
    const trace = (s: Scene) => {
      const { ctx, ops } = recorder();
      draw(ctx, s);
      return ops;
    };

    it("cuts the veil along the polygon through the block's corners", () => {
      const s = blockRoom();
      const cam = camera(s);
      const ops = trace(s);
      const corner = toScreen(cam, 6, 4); // the block's north-west corner
      const hit = (name: string, p: { x: number; y: number }) =>
        ops.some(
          (o) =>
            o.name === name &&
            Math.abs((o.args[0] as number) - p.x) < 1e-6 &&
            Math.abs((o.args[1] as number) - p.y) < 1e-6,
        );
      expect(hit("lineTo", corner) || hit("moveTo", corner), "a vertex on the corner").toBe(true);
      // clipped to the tiles the server sent, so it can never show more than it did
      expect(ops.some((o) => o.name === "clip")).toBe(true);
      expect(
        ops.some((o) => o.name === "clip" && o.args[0] === "evenodd"),
        "the lit part is punched out of the veil",
      ).toBe(true);
    });

    it("veils only the tiles the light does not wholly fill, and draws none of the lit ones", () => {
      const s = blockRoom();
      const cam = camera(s);
      const ops = trace(s);
      // the clip path is a rect per partly-lit tile; none is drawn for a tile in plain light
      const rects = ops
        .filter((o) => o.name === "rect")
        .map((o) => [o.args[0] as number, o.args[1] as number]);
      const has = (tx: number, ty: number) => {
        const p = toScreen(cam, tx, ty);
        return rects.some(
          ([x, y]) => Math.abs((x as number) - p.x) < 1e-6 && Math.abs((y as number) - p.y) < 1e-6,
        );
      };
      // the shadow behind the block widens: row 3 and row 5 beyond it are crossed by its edge,
      // row 4 beyond it is wholly dark, and the rest of the room is wholly lit
      expect(has(9, 3), "a tile the edge of the shadow crosses").toBe(true);
      expect(has(9, 5), "and the other side of it").toBe(true);
      expect(has(9, 4), "a tile wholly in shadow is veiled whole, not clipped").toBe(false);
      expect(has(1, 1), "a tile in plain light").toBe(false);
    });

    it("still veils a tile the server did not send, even where the ray says it is lit", () => {
      const s = blockRoom({ seen: ALL(8, 12).map((r) => (r.startsWith("1:") ? "1:0-5" : r)) });
      const cam = camera(s);
      const gone = toScreen(cam, 9, 1);
      const veil = trace(s).filter(
        (o) =>
          o.name === "fillRect" &&
          o.fillStyle === WORLD.mist &&
          Math.abs((o.args[0] as number) - gone.x) < 1e-6,
      );
      expect(veil.length).toBeGreaterThan(0);
    });

    it("does not veil a wall you are looking straight at: the light stops at its face, the wall is lit", () => {
      // a room ringed by wall, all of it seen: the walls round you are in plain sight
      const s = whole({
        tiles: grid(
          5,
          10,
          [
            [0, 0],
            [1, 0],
            [2, 0],
            [3, 0],
            [4, 0],
          ],
          "#",
        ),
        seen: ALL(5, 10),
        self: { x: 3.5, y: 2.5 },
      });
      const cam = camera(s);
      const top = toScreen(cam, 2, 0, TILT.wall); // the north wall's top edge, beside the viewer
      const veils = trace(s).filter(
        (o) =>
          o.name === "fillRect" &&
          o.fillStyle === WORLD.mist &&
          Math.abs((o.args[0] as number) - top.x) < 1e-6 &&
          Math.abs((o.args[1] as number) - top.y) < 1e-6,
      );
      expect(veils, "the west wall column, in sight, is not under mist").toEqual([]);
    });

    it("does veil a wall the light never reaches: the far side of a block, out of sight", () => {
      const tiles = grid(8, 12, [
        [6, 4],
        [7, 4],
        [8, 4],
      ]);
      const s = whole({ tiles, seen: ALL(8, 12), self: { x: 2.3, y: 4.5 }, w: 600, h: 360 });
      const cam = camera(s);
      const east = toScreen(cam, 8, 4, TILT.wall);
      const veils = trace(s).filter(
        (o) =>
          o.name === "fillRect" &&
          o.fillStyle === WORLD.mist &&
          Math.abs((o.args[0] as number) - east.x) < 1e-6,
      );
      expect(veils.length, "the block's far end is in its own shadow").toBeGreaterThan(0);
    });

    it("uses the same blockers the server does: glass passes sight, a vent stops it", () => {
      // a tall wall of one kind across the room, with the viewer on one side; what is on the other side
      // is veiled whole when the kind stops sight, and lit when it passes it
      const across = (ch: string) => {
        const tiles = Array.from({ length: 5 }, () => `...${ch}....`);
        const s = whole({ tiles, seen: ALL(5, 8), self: { x: 1.5, y: 2.5 }, w: 480, h: 300 });
        const cam = camera(s);
        const behind = toScreen(cam, 5, 2);
        const veil = trace(s).filter(
          (o) =>
            o.name === "fillRect" &&
            o.fillStyle === WORLD.mist &&
            Math.abs((o.args[0] as number) - behind.x) < 1e-6,
        );
        return veil.length > 0;
      };
      expect(across("="), "behind glass is seen").toBe(false);
      expect(across("%"), "behind a vent is not").toBe(true);
      expect(across("#"), "behind a wall is not").toBe(true);
    });

    it("draws no ray-cast veil for a watcher, or when you have no position to cast it from", () => {
      expect(
        trace(whole({ seen: undefined, tiles: grid(8, 12, [[6, 4]]) })).some(
          (o) => o.name === "clip",
        ),
      ).toBe(false);
      expect(
        trace(blockRoom({ self: null })).some((o) => o.name === "clip" && o.args[0] === "evenodd"),
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
