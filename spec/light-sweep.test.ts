import { describe, expect, it } from "vitest";
import { lightPolygon, tileTouched } from "../src/game/light.ts";
import { spectatorView, viewFor } from "../src/game/perception.ts";
import { loadRooms } from "../src/game/rooms/load.ts";
import { createWorld } from "../src/game/sim/world.ts";

// The user's rule: nothing may suddenly vanish when you move a hair. The client draws the exact light
// (`lightPolygon`), so the server must send every station that light touches any part of; a station
// the tile-set line of sight (`view.seen`) missed used to pop in at a tile boundary. Swept, not
// sampled: a viewer walks every room's floor in quarter-tile steps, in a sighted seat's own view.
const STEP = 0.25;
const ROOMS = loadRooms("./rooms");

describe("the light's stations are sent (nothing pops as you move a hair)", () => {
  for (const room of ROOMS) {
    it(`room ${room.id}: every station the exact light touches is in the view`, () => {
      const world = createWorld(room, 1);
      const all = spectatorView(world, null, ["deaf", "deaf", "deaf"], true).entities.filter(
        (e) => e.kind === "station",
      );
      const misses: string[] = [];
      for (let y = 0; y < room.height; y += STEP) {
        for (let x = 0; x < room.width; x += STEP) {
          const ch = room.grid[Math.floor(y)]?.[Math.floor(x)];
          if (ch === undefined || ch === "#" || ch === "%" || ch === " ") continue;
          world.players[0].pos = { x: x + 0.01, y: y + 0.01 };
          const view = viewFor(world, 0, "deaf", true);
          const tiles = view.tiles as string[];
          const closed = new Set(
            view.entities
              .filter((e) => e.kind === "door" && e.state === "closed")
              .map((e) => `${Math.floor(e.pos.x)},${Math.floor(e.pos.y)}`),
          );
          const light = lightPolygon(world.players[0].pos, tiles, (tx, ty) =>
            closed.has(`${tx},${ty}`),
          );
          const sent = new Set(view.entities.filter((e) => e.kind === "station").map((e) => e.id));
          for (const s of all) {
            const touched = (s.station?.parts ?? []).some((p) =>
              p.at.some((t) => tileTouched(light, t.x, t.y)),
            );
            if (touched && !sent.has(s.id))
              misses.push(`${s.id} from ${x.toFixed(2)},${y.toFixed(2)}`);
          }
        }
      }
      expect(misses.slice(0, 5), `${misses.length} positions`).toEqual([]);
    }, 120_000);
  }
});
