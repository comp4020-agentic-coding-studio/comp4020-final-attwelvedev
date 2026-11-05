import { describe, expect, it } from "vitest";
import type { RoomObject } from "./format.ts";
import { cacheTypeFaults } from "./lint.ts";
import { loadRooms } from "./load.ts";

// Clues FR9, FR10: the heist teaches at most two new things a room. A thing is a kind of object a
// person meets; loot, checkpoints, the exit and the spawns are in every room and not counted. A
// side job is loot with an owner: walked onto, nothing to learn, so it is not counted either
// (user, 2026-11-02, phase 11 Task 28). A braille plate is not counted either: it is the answer to a
// station already being taught, read with a key printed on the card (user, 2026-11-05, blind-purpose
// phase 03 Task 74, option 1).
const EVERYWHERE = new Set<RoomObject["kind"]>(["loot", "checkpoint", "exit", "spawn", "braille"]);

describe("pacing", () => {
  it("each shipped room introduces at most two kinds of thing not met in an earlier room", () => {
    const met = new Set<string>();
    const fresh: Record<string, string[]> = {};
    for (const room of loadRooms()) {
      const kinds = [...new Set(room.objects.map((o) => o.kind))].filter(
        (k) => !EVERYWHERE.has(k) && !met.has(k),
      );
      fresh[room.id] = kinds;
      for (const k of kinds) met.add(k);
    }
    for (const [id, kinds] of Object.entries(fresh)) {
      expect(kinds.length, `${id} introduces ${kinds.join(", ")}`).toBeLessThanOrEqual(2);
    }
  });

  // Caches FR2 (spec §2.2): a cache is an optional station of a type already met, so it adds nothing to
  // learn. A first appearance of a station type is never a cache.
  it("each cache is of a station type an earlier room (or the same room, first) taught", () => {
    expect(cacheTypeFaults(loadRooms())).toEqual([]);
  });
});
