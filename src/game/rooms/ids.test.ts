// Every shipped room's ids and where they stand (FR15). Ids are numbered in reading order, so a new
// letter placed before an existing one of its kind silently renumbers it (CLAUDE.md, "Rooms"); this
// test turns that into a red diff. Each room's map is in __ids__/<room id>.json: the first tile of
// each object, or every tile for a door.
//
// Updating the files with `vitest run -u` is a deliberate act, never a way to get green: read the
// diff and confirm that only the objects you meant to add or move changed before committing it.

import { describe, expect, it } from "vitest";
import { loadRooms } from "./load.ts";

const ROOMS = loadRooms("./rooms");

describe("room ids cannot move silently", () => {
  it("has rooms to guard", () => {
    expect(ROOMS.length).toBeGreaterThan(0);
  });

  for (const room of ROOMS) {
    it(`${room.id}: every id is where it was`, async () => {
      const ids: Record<string, string> = {};
      for (const o of room.objects) {
        const tiles = o.kind === "door" ? o.tiles : o.tiles.slice(0, 1);
        ids[o.id] = tiles.map((t) => `${t.x},${t.y}`).join(" ");
      }
      await expect(`${JSON.stringify(ids, null, 1)}\n`).toMatchFileSnapshot(
        `./__ids__/${room.id}.json`,
      );
    });
  }
});
