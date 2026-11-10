import { afterEach, describe, expect, it, vi } from "vitest";
import * as figures from "./figures.ts";
import { draw, type Scene } from "./index.ts";

// F9 (Task 288, FR4 option b): a spectator following Can't see sees Can't see's frame, black with the
// dimmed figure and the hand's link; following a sighted seat, the room. The frame was drawn only when
// `!scene.spectator`, so a watcher always got the whole room.
vi.mock("./figures.ts", async (real) => {
  const actual = await real<typeof import("./figures.ts")>();
  return { ...actual, drawOwnBlind: vi.fn(actual.drawOwnBlind) };
});

const ctx = new Proxy(
  {},
  {
    get: (_t, name) => {
      if (name === "measureText") return () => ({ width: 10 });
      if (
        name === "createLinearGradient" ||
        name === "createRadialGradient" ||
        name === "createPattern"
      )
        return () => ({ addColorStop: () => {} });
      if (name === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
      if (name === "canvas") return { width: 400, height: 300 };
      return () => {};
    },
    set: () => true,
  },
) as unknown as CanvasRenderingContext2D;

const ROOM = ["#########", "#.......#", "#.......#", "#.......#", "#########"];
const watcher = (over: Partial<Scene>): Scene => ({
  w: 400,
  h: 300,
  role: "blind",
  seat: 0,
  roles: ["blind", "deaf", "mute"],
  tiles: ROOM,
  entities: [
    { id: "P0", kind: "player", seat: 0, pos: { x: 2.5, y: 2.5 }, facing: { x: 1, y: 0 } },
  ],
  self: { x: 2.5, y: 2.5 },
  layout: "fit",
  spectator: true,
  ...over,
});
const hand = { dir: { x: 1, y: 0 }, leads: false, pulling: false };
const own = { facing: { x: 1, y: 0 }, moving: false, blocked: false };

afterEach(() => vi.mocked(figures.drawOwnBlind).mockClear());

describe("a spectator's frame (F9)", () => {
  it("following Can't see, draws Can't see's black frame with the hand's link", () => {
    draw(ctx, watcher({ own, hand }));
    expect(figures.drawOwnBlind).toHaveBeenCalledTimes(1);
    const scene = vi.mocked(figures.drawOwnBlind).mock.calls[0]?.[1];
    expect(scene?.hand).toEqual(hand);
  });

  it("following a sighted seat, or nobody, draws the room", () => {
    draw(ctx, watcher({ role: "deaf", seat: 1 }));
    draw(ctx, watcher({ role: "deaf", noSelf: true, self: null }));
    expect(figures.drawOwnBlind).not.toHaveBeenCalled();
  });
});
