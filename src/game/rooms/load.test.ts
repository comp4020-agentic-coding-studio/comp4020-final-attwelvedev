import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RoomFormatError } from "./format.ts";
import { lintRoom } from "./lint.ts";
import { loadRooms } from "./load.ts";

describe("loadRooms", () => {
  it("loads the shipped rooms in file-name order and every one lints clean", () => {
    const rooms = loadRooms();
    expect(rooms[0]?.id).toBe("01-loading-dock");
    expect(rooms[0]?.beats).toHaveLength(3);
    expect(rooms.flatMap(lintRoom)).toEqual([]);
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
