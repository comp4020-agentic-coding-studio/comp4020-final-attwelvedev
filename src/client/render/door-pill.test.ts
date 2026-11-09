import { describe, expect, it, vi } from "vitest";
import { viewFor } from "../../game/perception.ts";
import { loadRooms } from "../../game/rooms/load.ts";
import { hold, input } from "../../game/sim/testing.ts";
import { createWorld, TICK_MS } from "../../game/sim/world.ts";
import type { Role } from "../../game/types.ts";
import type { EntityView } from "../../net/protocol.ts";
import { openedDoors } from "../fx.ts";
import { camera, draw, type Scene } from "../render.ts";
import { WORLD } from "../tokens.ts";

// A door opening off screen is a pill at the edge toward it (ADR 0025, plan 2026-11-07-team-wide-doors Task 89).
// This replaces spec/layout/door-pill.test.ts, which seated three browsers on spec/fixtures/rooms-door, held a key in
// each until the figure stood on its plate, and polled the canvas's pixels for the pill's colour inside the pill's 4 s.
// It failed in CI for reasons that were not the pill: a key-up that came late carried a figure past its 1-tile plate
// so the door never opened (run 42595732106), and a slow poll pass could use the 4 s up.
//
// The same chain, without a clock or a browser: the simulation walks all three seats east until the walls beside the
// plates stop them (a tick count, so a slow machine changes nothing), the door's view goes closed to open, the
// page's own `openedDoors` finds it, Game.tsx's entry for it becomes the pop the scene carries, and the real `draw`
// puts the pill on a recording canvas, at 1280 and at 375 wide. What this does not do: measure the pill by its pixels
// on a real canvas, with the real font (a width per character stands in), or read the DOM boxes of the caption strip
// and the top bar the browser spec checked the pill clear of.

const room = loadRooms("spec/fixtures/rooms-door")[0];
if (!room) throw new Error("spec/fixtures/rooms-door has no room");

const ROLES: Role[] = ["blind", "deaf", "mute"];

// every seat walks east for 3 s, which is more than the three tiles from a spawn to a plate's far side
function walkToPlates() {
  const world = createWorld(room);
  const before = (role: Role) => viewFor(world, 1, role, true);
  const closed = { deaf: before("deaf"), mute: before("mute") };
  hold(world, { 0: input(1, 0), 1: input(1, 0), 2: input(1, 0) }, Math.round(3000 / TICK_MS));
  return { world, closed };
}

// A recording canvas that draws nothing and records the rounded rectangles and their stroke colour.
function recorder(pxPerChar: number) {
  const pills: { x: number; y: number; w: number; h: number; stroke: string }[] = [];
  const state: Record<string, unknown> = { strokeStyle: "", fillStyle: "", globalAlpha: 1 };
  const ctx = new Proxy(
    {},
    {
      get: (_t, name) => {
        if (String(name) in state) return state[String(name)];
        if (name === "measureText") return (t: string) => ({ width: t.length * pxPerChar });
        if (name === "createLinearGradient" || name === "createRadialGradient")
          return () => ({ addColorStop() {} });
        if (name === "roundRect")
          return (x: number, y: number, w: number, h: number) =>
            pills.push({ x, y, w, h, stroke: String(state.strokeStyle) });
        return () => {};
      },
      set: (_t, name, value) => {
        state[String(name)] = value;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, pills };
}

// the entries Game.tsx's onView makes for the doors that opened between two views, as the scene carries them
const popsOf = (before: EntityView[], after: EntityView[]) =>
  openedDoors(before, after).map((d) => ({
    seat: null,
    fade: 1,
    from: d.pos,
    name: "Door",
    mark: "door" as const,
  }));

const SIZES = [
  { name: "1280", w: 1280, h: 800 },
  { name: "375", w: 375, h: 700 },
];

describe("a door opening off screen, drawn as an edge pill", () => {
  vi.stubGlobal("Path2D", class {});

  it("opens once all three seats stand on their plates, which the wall beside each makes certain", () => {
    const { world } = walkToPlates();
    for (const p of world.players) {
      // the plate is the tile east of the spawn (x 2 to 3); the wall on the tile after it holds the figure there
      expect(Math.floor(p.pos.x), `seat ${p.seat} stands on its plate`).toBe(2);
    }
    expect(world.doorOpen.D1).toBe(true);
  });

  it("does not open for two on their plates", () => {
    const world = createWorld(room);
    hold(world, { 0: input(1, 0), 1: input(1, 0) }, Math.round(3000 / TICK_MS));
    expect(world.doorOpen.D1).toBe(false);
  });

  for (const role of ["deaf", "mute"] as const) {
    it(`${role}: the opening reaches its view as one door, closed then open`, () => {
      const { world, closed } = walkToPlates();
      const after = viewFor(world, role === "deaf" ? 1 : 2, role, true);
      const before = closed[role];
      expect(openedDoors(before.entities, before.entities)).toEqual([]);
      expect(openedDoors(before.entities, after.entities)).toHaveLength(1); // three tiles, one door
    });

    for (const size of SIZES) {
      it(`${role} at ${size.name}: a pill on the east edge in the door's colour, whole and inside the canvas`, () => {
        const { world, closed } = walkToPlates();
        const seat = role === "deaf" ? 1 : 2;
        const before = closed[role];
        const after = viewFor(world, seat, role, true);
        const self = world.players[seat]?.pos;
        if (!self) throw new Error("no seat");
        const scene = {
          layout: "follow",
          w: size.w,
          h: size.h,
          role,
          seat,
          roles: ["blind", "deaf", "mute"],
          tiles: after.tiles ?? room.grid,
          seen: after.seen,
          entities: after.entities,
          self,
          pops: popsOf(before.entities, after.entities),
        } as unknown as Scene;
        scene.cam = camera(scene);
        // two widths bracket the real font: 6 px a character is the measured middle (see labels-layout.test.ts)
        for (const px of [5, 7]) {
          const { ctx, pills } = recorder(px);
          draw(ctx, scene);
          const mine = pills.filter((p) => p.stroke === WORLD.door);
          expect(mine, `${role} at ${size.name}: one pill for the one door`).toHaveLength(1);
          const pill = mine[0];
          if (!pill) throw new Error("no pill");
          expect(pill.x, "on the east side, toward the door").toBeGreaterThan(size.w / 2);
          expect(pill.x + pill.w, "inside the canvas").toBeLessThanOrEqual(size.w);
          expect(pill.y, "inside the canvas, top").toBeGreaterThanOrEqual(0);
          expect(pill.y + pill.h, "inside the canvas, bottom").toBeLessThanOrEqual(size.h);
          expect(pill.h, "a pill, 24 px or more tall").toBeGreaterThanOrEqual(24);
          expect(pill.w, 'wide enough to read "Door"').toBeGreaterThanOrEqual(40);
        }
      });
    }
  }

  it("draws no pill before the door opens", () => {
    const { closed } = walkToPlates();
    const { entities } = closed.deaf;
    expect(popsOf(entities, entities)).toEqual([]);
  });

  it("the colour it draws is the token's", () => {
    expect(WORLD.door.toLowerCase()).toBe("#f6cf63");
    expect(ROLES).toHaveLength(3);
  });
});
