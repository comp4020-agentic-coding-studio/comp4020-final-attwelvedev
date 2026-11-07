import { describe, expect, it } from "vitest";
import { viewFor } from "../../game/perception.ts";
import { loadRooms } from "../../game/rooms/load.ts";
import { createWorld } from "../../game/sim/world.ts";
import { camera, draw, type Scene } from "../render.ts";
import { WORLD } from "../tokens.ts";
import { toScreen } from "./project.ts";

// Screenshots 105 to 107: room 4's second safe's wire must be drawn from where nothing of the safe is in the light.
const room4 = loadRooms().find((r) => r.id === "04-the-safe") as ReturnType<typeof loadRooms>[0];

function wireStrokes(x: number, y: number, withWires: boolean): { sent: boolean; strokes: number } {
  const world = createWorld(room4, 1);
  world.players[1].pos = { x, y };
  const view = viewFor(world, 1, "deaf", true);
  const state: Record<string, unknown> = { globalAlpha: 1, lineDash: [] };
  const saved: Record<string, unknown>[] = [];
  let strokes = 0;
  const ctx = new Proxy(
    {},
    {
      get: (_t, name) => {
        if (String(name) in state) return state[String(name)];
        if (name === "save") return () => saved.push({ ...state });
        if (name === "restore") return () => Object.assign(state, saved.pop());
        if (name === "setLineDash") return (a: number[]) => (state.lineDash = a);
        if (name === "createLinearGradient" || name === "createRadialGradient")
          return () => ({ addColorStop() {} });
        if (name === "measureText") return () => ({ width: 10 });
        return () => {
          if (
            name === "stroke" &&
            state.strokeStyle === WORLD.line &&
            (state.globalAlpha as number) < 1 &&
            (state.lineDash as number[]).length > 0
          )
            strokes++;
        };
      },
      set: (_t, name, value) => {
        state[String(name)] = value;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  const scene: Scene = {
    w: 3000,
    h: 700,
    role: "deaf",
    seat: 1,
    roles: ["blind", "deaf", "mute"],
    tiles: view.tiles ?? null,
    seen: view.seen,
    entities: view.entities.filter((e) => withWires || e.kind !== "wire"),
    self: { x, y },
    layout: "follow",
    nowMs: 1000,
  };
  draw(ctx, scene);
  return { sent: !view.entities.some((e) => e.id === "Q2"), strokes };
}

describe("a safe's wire is drawn from anywhere (screenshots 105 to 107)", () => {
  it("draws room 4's second safe's wire from where none of the safe is sent", () => {
    const far = wireStrokes(9.5, 5.5, true);
    const without = wireStrokes(9.5, 5.5, false);
    expect(far.sent, "Q2 itself is not sent from here").toBe(true);
    // other dashed faint strokes exist (a camera's idle cone): the wire is what the wire entity adds
    expect(far.strokes - without.strokes, "the wire is stroked").toBeGreaterThan(0);
  });
});

// Screenshot 99: a wire runs on the wall and down its face, and stops at the wall's foot; it does not run on below it,
// out across the floor to the dial. Room 4's second safe's wire runs along the outer wall (row 0): no point of it may lie
// below the foot of that wall's front (the line y = 1, on the floor).
describe("a wire stops at the wall's foot (screenshot 99)", () => {
  it("has no point below the foot of the wall it runs on", () => {
    const world = createWorld(room4, 1);
    world.players[1].pos = { x: 20.5, y: 3.5 };
    const view = viewFor(world, 1, "deaf", true);
    const scene: Scene = {
      w: 1280,
      h: 600,
      role: "deaf",
      seat: 1,
      roles: ["blind", "deaf", "mute"],
      tiles: view.tiles ?? null,
      seen: view.seen,
      entities: view.entities,
      self: { x: 20.5, y: 3.5 },
      layout: "follow",
      nowMs: 1000,
    };
    const state: Record<string, unknown> = { globalAlpha: 1, lineDash: [] };
    const saved: Record<string, unknown>[] = [];
    let path: { x: number; y: number }[] = [];
    let wire: { x: number; y: number }[] = [];
    const ctx = new Proxy(
      {},
      {
        get: (_t, name) => {
          if (String(name) in state) return state[String(name)];
          if (name === "save") return () => saved.push({ ...state });
          if (name === "restore") return () => Object.assign(state, saved.pop());
          if (name === "setLineDash") return (a: number[]) => (state.lineDash = a);
          if (name === "createLinearGradient" || name === "createRadialGradient")
            return () => ({ addColorStop() {} });
          if (name === "measureText") return () => ({ width: 10 });
          return (...a: unknown[]) => {
            if (name === "beginPath") path = [];
            if ((name === "moveTo" || name === "lineTo") && typeof a[0] === "number")
              path.push({ x: a[0], y: a[1] as number });
            if (
              name === "stroke" &&
              state.strokeStyle === WORLD.line &&
              (state.globalAlpha as number) < 1 &&
              (state.lineDash as number[]).length > 0 &&
              path.length > 1
            )
              wire = [...wire, ...path];
          };
        },
        set: (_t, name, value) => {
          state[String(name)] = value;
          return true;
        },
      },
    ) as unknown as CanvasRenderingContext2D;
    draw(ctx, scene);
    const foot = toScreen(camera(scene), 0, 1, 0).y;
    expect(wire.length, "the wire is drawn").toBeGreaterThan(3);
    const lowest = Math.max(...wire.map((p) => p.y));
    expect(lowest, "the lowest point of the wire, against the wall's foot").toBeLessThanOrEqual(
      foot + 1e-6,
    );
  });
});
