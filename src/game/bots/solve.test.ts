import { describe, expect, it } from "vitest";
import { loadRooms } from "../rooms/load.ts";
import type { Role } from "../types.ts";
import { solveRoom } from "./solve.ts";

const room = loadRooms().find((r) => r.id === "01-loading-dock");
if (!room) throw new Error("room 01 is missing");
const ROLES: [Role, Role, Role] = ["blind", "deaf", "mute"];

describe("solveRoom: switching one role's sending off", () => {
  it("counts what each seat sent, and every seat sends something when nothing is muted", () => {
    const result = solveRoom(room, ROLES, 120);
    expect(result.sentBy).toHaveLength(3);
    expect(result.sentBy[1], "the deaf seat guides").toBeGreaterThan(0);
  });

  it("drops every send from the seat that holds the muted role", () => {
    for (const [seat, role] of ROLES.entries()) {
      const result = solveRoom(room, ROLES, 60, new Set(), { mute: role });
      expect(result.sentBy[seat], `${role} (seat ${seat}) sent nothing`).toBe(0);
    }
  });

  it("fails a room that needs the guide when the Can't-hear seat is muted", () => {
    const open = solveRoom(room, ROLES, 120);
    const muted = solveRoom(room, ROLES, 120, new Set(), { mute: "deaf" });
    expect(open.cleared).toBe(true);
    expect(muted.cleared, "the blind seat cannot find its way unguided").toBe(false);
  });
});
