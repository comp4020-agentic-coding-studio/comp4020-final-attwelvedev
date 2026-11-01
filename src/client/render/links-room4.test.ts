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
function strokes(seat: Seat, role: Role, standAt: { x: number; y: number }, withBack: boolean) {
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
    entities: view.entities.map((e) =>
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
const wiresDrawn = (seat: Seat, role: Role, at: { x: number; y: number }) =>
  strokes(seat, role, at, true) - strokes(seat, role, at, false);

describe("room 4's safes are wired only where a wall is between (Task 47)", () => {
  it("the second safe's dial is wired to its audio box through the vent", () => {
    expect(wiresDrawn(1, "deaf", { x: 20.5, y: 2.5 })).toBeGreaterThan(0);
  });
  it("the first safe, with its box on the same open floor, has no wire", () => {
    expect(wiresDrawn(1, "deaf", { x: 6.5, y: 2.5 })).toBe(0);
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
