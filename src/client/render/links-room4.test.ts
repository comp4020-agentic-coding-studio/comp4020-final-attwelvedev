import { describe, expect, it } from "vitest";
import { viewFor } from "../../game/perception.ts";
import { loadRooms } from "../../game/rooms/load.ts";
import { createWorld } from "../../game/sim/world.ts";
import type { Role, Seat } from "../../game/types.ts";
import { camera, draw, type Scene } from "../render.ts";
import { WORLD } from "../tokens.ts";
import { TILT, toScreen } from "./project.ts";

// Task 47, on the real room: a safe's wire is drawn where a wall is between the dial and its back.
// Room 4's second safe (Q2) has a vent between them; its audio box must be wired, the first safe not.
const room4 = loadRooms().find((r) => r.id === "04-the-safe") as ReturnType<typeof loadRooms>[0];

let lastOps: {
  args?: unknown[];
  name: string;
  strokeStyle: unknown;
  fillStyle?: unknown;
  globalAlpha: number;
  lineDash: number[];
}[] = [];
function strokes(
  seat: Seat,
  role: Role,
  standAt: { x: number; y: number },
  withBack: boolean,
  only = "Q2.wire",
) {
  const world = createWorld(room4, 1);
  world.players[seat].pos = standAt;
  const view = viewFor(world, seat, role, true);
  const scene: Scene = {
    w: 1280,
    h: 600,
    role,
    seat,
    roles: ["blind", "deaf", "mute"],
    tiles: view.tiles ?? null,
    // the server sends each wire as its own entity; without the back box there is no wire to send
    entities: view.entities
      .filter((e) => withBack || e.kind !== "wire" || e.id !== only)
      .map((e) =>
        withBack || !e.station
          ? e
          : {
              ...e,
              station: { ...e.station, parts: e.station.parts.filter((p) => p.key !== "back") },
            },
      ),
    self: standAt,
    layout: "follow",
    nowMs: 1000,
  };
  const ops: { name: string; strokeStyle: unknown; globalAlpha: number; lineDash: number[] }[] = [];
  const state: Record<string, unknown> = { globalAlpha: 1, lineDash: [] };
  const saved: Record<string, unknown>[] = [];
  const ctx = new Proxy(
    {},
    {
      get: (_t, name) => {
        if (String(name) in state) return state[String(name)];
        if (name === "save") return () => saved.push({ ...state });
        if (name === "restore") return () => Object.assign(state, saved.pop());
        if (name === "setLineDash") return (a: number[]) => (state.lineDash = a);
        if (name === "createLinearGradient") return () => ({ addColorStop() {} });
        if (name === "measureText") return () => ({ width: 10 });
        return (...args: unknown[]) => {
          ops.push({ name: String(name), args, ...state } as never);
        };
      },
      set: (_t, name, value) => {
        state[String(name)] = value;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  draw(ctx, scene);
  lastOps = ops;
  return ops.filter(
    (o) =>
      o.name === "stroke" &&
      o.strokeStyle === WORLD.line &&
      o.globalAlpha < 1 &&
      o.lineDash.length > 0,
  ).length;
}

// the wire is the dashed faint strokes a safe draws with its back box and not without it
const wiresDrawn = (seat: Seat, role: Role, at: { x: number; y: number }, wire = "Q2.wire") =>
  strokes(seat, role, at, true, wire) - strokes(seat, role, at, false, wire);

describe("room 4's safes are wired only where a wall is between (Task 47)", () => {
  it("the second safe's dial is wired to its audio box through the vent", () => {
    expect(wiresDrawn(1, "deaf", { x: 20.5, y: 2.5 })).toBeGreaterThan(0);
  });
  it("the first safe, with its box on the same open floor, has no wire", () => {
    expect(wiresDrawn(1, "deaf", { x: 6.5, y: 2.5 }, "Q1.wire")).toBe(0);
  });
  it("the wire is drawn after the wall blocks of the rows it runs along, so they do not hide it", () => {
    strokes(1, "deaf", { x: 20.5, y: 2.5 }, true);
    const cam = camera({
      w: 1280,
      h: 600,
      role: "deaf",
      seat: 1,
      roles: ["blind", "deaf", "mute"],
      tiles: room4.grid,
      entities: [],
      self: { x: 20.5, y: 2.5 },
      layout: "follow",
    } as Scene);
    const wire = lastOps.findIndex(
      (o) =>
        o.name === "stroke" &&
        o.strokeStyle === WORLD.line &&
        o.globalAlpha < 1 &&
        o.lineDash.length > 0,
    );
    // Q2's wire runs along the top wall (row 0), over the dial's row (row 1)
    const wallFrontsIn = (row: number) =>
      lastOps.flatMap((o, i) =>
        o.name === "fillRect" &&
        o.fillStyle === WORLD.wallFront &&
        Math.abs((o.args?.[1] as number) - toScreen(cam, 0, row + 1, TILT.wall).y) < 1e-6
          ? [i]
          : [],
      );
    const hiding = [...wallFrontsIn(0), ...wallFrontsIn(1)];
    expect(hiding.length, "the walls the wire runs along were drawn").toBeGreaterThan(0);
    expect(wire, "the wire is drawn").toBeGreaterThanOrEqual(0);
    expect(wire, "after the walls of its rows").toBeGreaterThan(Math.max(...hiding));
  });
});

// Room 8's little music box plays its tune for the ear: the sighted get nothing flashing above the
// tune box while a note plays (the box used to lift a cream lid with every chime).
describe("a music box's tune box has no lid that flashes with the chimes", () => {
  const room8 = loadRooms().find((r) => r.id === "08-music-room") as ReturnType<
    typeof loadRooms
  >[0];
  const creamRects = (playing: 0 | 1) => {
    const world = createWorld(room8, 1);
    world.players[2].pos = { x: 6.5, y: 2.5 };
    const view = viewFor(world, 2, "mute", true);
    const entities = view.entities.map((e) =>
      e.id === "Q1" && e.station
        ? { ...e, station: { ...e.station, shows: [playing, ...e.station.shows.slice(1)] } }
        : e,
    );
    const scene: Scene = {
      w: 1280,
      h: 600,
      role: "mute",
      seat: 2,
      roles: ["blind", "deaf", "mute"],
      tiles: view.tiles ?? null,
      entities,
      self: { x: 6.5, y: 2.5 },
      layout: "follow",
      nowMs: 1000,
    };
    const rects: { fillStyle: unknown }[] = [];
    const state: Record<string, unknown> = { globalAlpha: 1, lineDash: [] };
    const saved: Record<string, unknown>[] = [];
    const ctx = new Proxy(
      {},
      {
        get: (_t, name) => {
          if (String(name) in state) return state[String(name)];
          if (name === "save") return () => saved.push({ ...state });
          if (name === "restore") return () => Object.assign(state, saved.pop());
          if (name === "setLineDash") return (a: number[]) => (state.lineDash = a);
          if (name === "createLinearGradient") return () => ({ addColorStop() {} });
          if (name === "measureText") return () => ({ width: 10 });
          return () => {
            if (name === "fillRect") rects.push({ fillStyle: state.fillStyle });
          };
        },
        set: (_t, name, value) => {
          state[String(name)] = value;
          return true;
        },
      },
    ) as unknown as CanvasRenderingContext2D;
    draw(ctx, scene);
    return rects.filter((r) => r.fillStyle === WORLD.card).length;
  };
  it("draws the same with a note playing as with none", () => {
    expect(creamRects(1), "a note playing adds no cream rectangle").toBe(creamRects(0));
  });
});

// Glass passes sight, so the light goes through a pane and no ray stops on its face. A pane used to
// count as lit only when a vertex of the light's polygon happened to land beside it; seen at a
// shallow angle those vertices come and go from one step to the next, and the pane flickered.
describe("a glass pane does not flicker at the edge of sight", () => {
  const room8 = loadRooms().find((r) => r.id === "08-music-room") as ReturnType<
    typeof loadRooms
  >[0];
  // the pane at (4,4) in room 8, seen from the corridor row below it
  const veiled = (y: number, x = 1.5) => {
    const world = createWorld(room8, 1);
    const self = { x, y };
    world.players[2].pos = self;
    const view = viewFor(world, 2, "mute", true);
    const scene: Scene = {
      w: 1280,
      h: 600,
      role: "mute",
      seat: 2,
      roles: ["blind", "deaf", "mute"],
      tiles: view.tiles ?? null,
      entities: [],
      self,
      layout: "follow",
      nowMs: 1000,
      ...(view.seen ? { seen: view.seen } : {}),
    };
    const cam = camera(scene);
    const top = toScreen(cam, 4, 4, TILT.wall);
    const boxes: { x: number; y: number; w: number }[] = [];
    const state: Record<string, unknown> = { globalAlpha: 1, lineDash: [] };
    const saved: Record<string, unknown>[] = [];
    let path: { x: number; y: number; w: number; h: number }[] = [];
    const veilPath: { x: number; y: number; w: number; h: number }[] = [];
    const ctx = new Proxy(
      {},
      {
        get: (_t, name) => {
          if (String(name) in state) return state[String(name)];
          if (name === "save") return () => saved.push({ ...state });
          if (name === "restore") return () => Object.assign(state, saved.pop());
          if (name === "setLineDash") return (a: number[]) => (state.lineDash = a);
          if (name === "createLinearGradient") return () => ({ addColorStop() {} });
          if (name === "createPattern") return () => null;
          if (name === "measureText") return () => ({ width: 10 });
          if (name === "beginPath") return () => (path = []);
          if (name === "rect")
            return (x: number, y: number, w: number, h: number) => path.push({ x, y, w, h });
          if (name === "fill")
            return () => {
              // the mist is painted in pieces (the floor, then each row's walls): take every one
              if (state.fillStyle === WORLD.mist) veilPath.push(...path);
            };
          return () => {};
        },
        set: (_t, name, value) => {
          state[String(name)] = value;
          return true;
        },
      },
    ) as unknown as CanvasRenderingContext2D;
    draw(ctx, scene);
    boxes.push(...veilPath);
    // a veiled wall-like block is a box at the block's own top-left, as wide as one tile
    return boxes.some(
      (b) =>
        Math.abs(b.x - top.x) < 0.5 &&
        Math.abs(b.y - top.y) < 0.5 &&
        Math.abs(b.w - cam.scale) < 0.5,
    );
  };
  it("is veiled or clear the same way across a small movement along it", () => {
    let flips = 0;
    let last: boolean | null = null;
    for (let i = 0; i <= 90; i++) {
      const v = veiled(5.05 + i * 0.01);
      if (last !== null && v !== last) flips++;
      last = v;
    }
    expect(
      flips,
      "the pane's veil changed this many times over a 0.9-tile walk",
    ).toBeLessThanOrEqual(1);
  });

  it("is clear where the light reaches it, and veiled where it does not", () => {
    // beside the pane in the corridor, the pane is in the light
    expect(veiled(5.5, 4.5), "standing right below the pane").toBe(false);
    // in the middle room, behind its own walls, the pane's whole face is out of sight
    expect(veiled(2.5, 12.5), "in the middle room, behind the wall").toBe(true);
  });
});
