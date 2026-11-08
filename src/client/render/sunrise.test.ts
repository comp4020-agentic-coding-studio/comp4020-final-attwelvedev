import { describe, expect, it, vi } from "vitest";
import { viewFor } from "../../game/perception.ts";
import { loadRooms } from "../../game/rooms/load.ts";
import { worldAt } from "../../game/rooms/mockup.ts";
import { draw, type Scene, SUNRISE_STEPS } from "../render.ts";
import { worldStamp } from "../tokens.ts";

// The intro's frame cost (playtest fixes, Task 7). Measured on the frame bench's intro mode (quiet
// machine, CPU ×4): a frame whose sunrise changed cost about twice a settled one, because every new
// dusk amount repaints every world token and drops everything cached against them (the tile atlas,
// the decor). The sunrise is drawn in SUNRISE_STEPS even steps, so over the whole intro the world is
// repainted at most that many times, however many frames the browser draws.

const ctx = new Proxy(
  {},
  {
    get: (_t, name) => {
      if (name === "createLinearGradient" || name === "createRadialGradient")
        return () => ({ addColorStop() {} });
      if (name === "measureText") return () => ({ width: 10 });
      if (name === "getTransform") return () => ({ a: 1 });
      return () => {};
    },
    set: () => true,
  },
) as unknown as CanvasRenderingContext2D;

describe("the sunrise repaints the world in steps, not every frame (playtest fixes, Task 7)", () => {
  it("300 intro frames sweeping the sunrise from 0 to 1 repaint the world at most SUNRISE_STEPS + 1 times", () => {
    vi.stubGlobal("Path2D", class {});
    const room = loadRooms().find((r) => r.id === "05-the-gallery");
    if (!room) throw new Error("no room 05");
    const view = viewFor(worldAt(room, 3, 3), 1, "deaf", true);
    const base: Scene = {
      layout: "follow",
      w: 640,
      h: 400,
      role: "deaf",
      seat: 1,
      roles: ["blind", "deaf", "mute"],
      tiles: view.tiles ?? room.grid,
      seen: view.seen,
      entities: view.entities,
      self: view.you.pos ?? null,
    };
    const stamps = new Set<number>();
    const FRAMES = 300;
    for (let i = 0; i < FRAMES; i++) {
      draw(ctx, { ...base, nowMs: i * 16, sunrise: i / (FRAMES - 1) });
      stamps.add(worldStamp());
    }
    expect(stamps.size).toBeLessThanOrEqual(SUNRISE_STEPS + 1);
    // fine enough that a step is not a visible jump: at most about 1/12 of the way from dusk to day
    expect(SUNRISE_STEPS).toBeGreaterThanOrEqual(12);
  });
});
