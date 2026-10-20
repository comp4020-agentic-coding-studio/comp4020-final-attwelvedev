import { describe, expect, it } from "vitest";
import { TILT, toScreen } from "./render/project.ts";
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
        if (String(name) in state) return state[String(name)]; // a property reads back what was set
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
    scene({ layout: "fit", w: 500, h: 300, entities: [], tiles: grid(5, 10), ...over });
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
