import { describe, expect, it, vi } from "vitest";
import { viewFor } from "../../game/perception.ts";
import { loadRooms } from "../../game/rooms/load.ts";
import { worldAt } from "../../game/rooms/mockup.ts";
import type { EntityView } from "../../net/protocol.ts";
import { detectFx } from "../fx.ts";
import { camera, draw, type Scene } from "../render.ts";
import { WORLD } from "../tokens.ts";
import { fromScreen } from "./project.ts";

// The playtest's "only the top door animates" (playtest fixes, Task 5): a door is one entity per tile
// with one id, so an opening must move the leaves of every tile, not only the first one met. Drawn
// through the real draw() on rooms 1 and 2's real door tiles, with the camera pinned, and read off the
// recorded canvas: each door drawn paints its seam (WORLD.doorSeam) down its front, and the tile it
// is painted on is the one under the seam's foot.

interface Op {
  name: string;
  args: unknown[];
  fillStyle?: string;
}

function recorder() {
  const ops: Op[] = [];
  const state: Record<string, unknown> = { fillStyle: "", strokeStyle: "", globalAlpha: 1 };
  const saved: Record<string, unknown>[] = [];
  const ctx = new Proxy(
    {},
    {
      get: (_t, name) => {
        if (String(name) in state) return state[String(name)];
        if (name === "save") return () => saved.push({ ...state });
        if (name === "restore") return () => Object.assign(state, saved.pop());
        if (name === "createLinearGradient" || name === "createRadialGradient")
          return () => ({ addColorStop() {} });
        if (name === "measureText") return () => ({ width: 10 });
        return (...args: unknown[]) => {
          ops.push({ name: String(name), args, fillStyle: state.fillStyle as string });
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

const rooms = loadRooms();
const roomOf = (id: string) => {
  const room = rooms.find((r) => r.id === id);
  if (!room) throw new Error(`no room ${id}`);
  return room;
};

// The view of Can't hear standing in the open floor west of the doors, before and after every door opens
function views(id: string) {
  const room = roomOf(id);
  const world = worldAt(room, 8, 2);
  const before = viewFor(world, 1, "deaf", true);
  const after = {
    ...before,
    entities: before.entities.map((e) =>
      e.kind === "door" ? ({ ...e, state: "open" } as EntityView) : e,
    ),
  };
  return { room, before, after };
}

describe("every tile of a door plays its opening (playtest fixes, Task 5)", () => {
  for (const id of ["01-first-steps", "02-three-hands"]) {
    it(`${id}: each tile of each door gets an opening`, () => {
      const { before, after } = views(id);
      const doorTiles = after.entities.filter((e) => e.kind === "door");
      expect(doorTiles.length).toBeGreaterThan(2);
      const fx = detectFx(before.entities, after.entities).filter((f) => f.kind === "door");
      const at = new Set(fx.map((f) => `${f.pos.x},${f.pos.y}`));
      for (const d of doorTiles)
        expect(at.has(`${d.pos.x},${d.pos.y}`), `${d.id} at ${d.pos.y}`).toBe(true);
    });

    it(`${id}: drawn halfway, every door tile's leaves are painted, not only the top one's`, () => {
      vi.stubGlobal("Path2D", class {});
      const { room, before, after } = views(id);
      const fx = detectFx(before.entities, after.entities).map((f) => ({ ...f, age: 0.4 }));
      const sc: Scene = {
        layout: "follow",
        w: 1280,
        h: 800,
        role: "deaf",
        seat: 1,
        roles: ["blind", "deaf", "mute"],
        tiles: after.tiles ?? room.grid,
        seen: after.seen,
        entities: after.entities,
        self: after.you.pos ?? null,
        fx,
      };
      sc.cam = camera(sc);
      const cam = sc.cam;
      const { ctx, ops } = recorder();
      draw(ctx, sc);
      // the tiles a door was painted on: an opening door is the only door body drawn, as every door
      // in the view is open. Its seam runs down the front to the floor, so the seam's foot, just
      // inside, is on the door's own tile
      const painted = new Set(
        ops
          .filter((o) => o.name === "fillRect" && o.fillStyle === WORLD.doorSeam)
          .map((o) => {
            const [x, y, , h] = o.args as number[];
            const g = fromScreen(cam, (x as number) + 1, (y as number) + (h as number) - 1);
            return `${Math.floor(g.x)},${Math.floor(g.y)}`;
          }),
      );
      const missing = after.entities
        .filter((e) => e.kind === "door")
        .map((e) => `${Math.floor(e.pos.x)},${Math.floor(e.pos.y)}`)
        .filter((k) => !painted.has(k));
      expect(
        missing,
        `door tiles with no leaves drawn; painted: ${[...painted].join(" ")}`,
      ).toEqual([]);
    });
  }
});
