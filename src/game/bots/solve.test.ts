import { describe, expect, it } from "vitest";
import { loadRooms } from "../rooms/load.ts";
import type { Role } from "../types.ts";
import { solveRoom } from "./solve.ts";

const room = loadRooms().find((r) => r.id === "01-first-job");
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
