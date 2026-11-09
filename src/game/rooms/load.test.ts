import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RoomFormatError } from "./format.ts";
import { lintRoom } from "./lint.ts";
import { loadRooms } from "./load.ts";

// Linting rooms 4 to 9 takes seconds each (about 13 s for all nine alone, 18 s with the suite running in parallel),
// so one test over all of them sat at 92% of the unit project's 20 s limit and timed out under load. One test per
// shipped room keeps each far from it, and a failure names the room. The ids are the file names, read here so a
// new room gets its test with no edit.
const SHIPPED = readdirSync("./rooms")
  .filter((f) => f.endsWith(".room"))
  .sort()
  .map((f) => f.replace(/\.room$/, ""));

describe("loadRooms", () => {
  it("loads the shipped rooms in file-name order", () => {
    const rooms = loadRooms();
    expect(rooms.map((r) => r.id)).toEqual(SHIPPED);
    expect(rooms[0]?.id).toBe("01-first-steps");
    expect(rooms[0]?.beats).toHaveLength(2);
  });

  it.each(SHIPPED)("%s lints clean", (id) => {
    const room = loadRooms().find((r) => r.id === id);
    expect(room, `${id} is a shipped room`).toBeDefined();
    expect(lintRoom(room as NonNullable<typeof room>)).toEqual([]);
  });

  it("names the file and line when a room does not parse", () => {
    const dir = mkdtempSync(join(tmpdir(), "rooms-"));
    writeFileSync(join(dir, "02-bad.room"), '{"id":"x","name":"x"}\n---\n#?#\n');
    const err = (() => {
      try {
        loadRooms(dir);
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(RoomFormatError);
    expect((err as Error).message).toMatch(/02-bad\.room:3/);
  });
});
