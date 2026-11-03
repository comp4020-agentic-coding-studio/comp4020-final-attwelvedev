import { describe, expect, it } from "vitest";
import { loadRooms } from "../rooms/load.ts";
import type { Role } from "../types.ts";
import { solveRoom } from "./solve.ts";

const room = loadRooms("./spec/fixtures/first-job").find((r) => r.id === "01-first-job");
if (!room) throw new Error("room 01 is missing");
const ROLES: [Role, Role, Role] = ["blind", "deaf", "mute"];

describe("solveRoom", () => {
  it("counts what each seat sent, and the Can't-hear seat guides its way to a clear", () => {
    const result = solveRoom(room, ROLES, 120);
    expect(result.sentBy).toHaveLength(3);
    expect(result.sentBy[1], "the deaf seat guides").toBeGreaterThan(0);
    expect(result.cleared).toBe(true);
  });
});

// Bots ignore caches (caches FR8). Room 7's cache is a numbered wire panel with UV ink, and the torch
// bot posts at the ink of every numbered panel that is not yet cut: it must not post at a hidden
// cache's, which nobody will ever solve, or it camps there and the room is never cleared.
describe("a torch bot and a cache's ink", () => {
  const night = loadRooms("./rooms").find((r) => r.id === "07-night-shift");
  if (!night) throw new Error("room 7 is missing");

  it("still clears a room whose cache is a numbered wire panel with its own ink", () => {
    for (const roles of [
      ["blind", "deaf", "mute"],
      ["deaf", "mute", "blind"],
      ["mute", "blind", "deaf"],
    ] as [Role, Role, Role][]) {
      expect(solveRoom(night, roles, 240).cleared, roles.join("/")).toBe(true);
    }
  });
});
