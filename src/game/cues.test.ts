import { describe, expect, it } from "vitest";
import { cuesIn } from "./cues.ts";
import { loadRooms } from "./rooms/load.ts";

const rooms = loadRooms("./rooms");
const room = (id: string) => {
  const found = rooms.find((r) => r.id === id);
  if (!found) throw new Error(`no room ${id}`);
  return found;
};

describe("cuesIn", () => {
  it("lists the sounds a room can make: a plate's hum and a door's click in the first room", () => {
    expect(cuesIn(room("01-loading-dock"))).toEqual(["hum", "door"]);
  });

  it("adds the hazards a room has, in a fixed order (camera, laser, guard, then plate hum and door)", () => {
    const cues = cuesIn(room("02-cameras-lasers"));
    expect(cues).toEqual(["camera", "laser", "guard", "hum", "door"]);
  });

  it("names each sound once however many objects make it", () => {
    for (const r of rooms) {
      const cues = cuesIn(r);
      expect(new Set(cues).size).toBe(cues.length);
    }
  });
});
