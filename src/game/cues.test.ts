import { describe, expect, it } from "vitest";
import { cuesIn } from "./cues.ts";
import { loadRooms } from "./rooms/load.ts";

// First Job left the heist in escape-room phase 04; it stays a fixture for what it tests
const rooms = [...loadRooms("./rooms"), ...loadRooms("./spec/fixtures/first-job")];
const room = (id: string) => {
  const found = rooms.find((r) => r.id === id);
  if (!found) throw new Error(`no room ${id}`);
  return found;
};

describe("cuesIn", () => {
  it("lists the sounds a room can make: a camera's whir, a guard's steps, a plate's hum and a door's click in the first room", () => {
    expect(cuesIn(room("01-first-job"))).toEqual(["camera", "guard", "hum", "door"]);
  });

  it("adds the hazards a room has, in a fixed order (camera, laser, guard, then plate hum and door)", () => {
    const cues = cuesIn(room("08-cameras-lasers"));
    expect(cues).toEqual(["camera", "laser", "guard", "hum", "door"]);
  });

  it("names each sound once however many objects make it", () => {
    for (const r of rooms) {
      const cues = cuesIn(r);
      expect(new Set(cues).size).toBe(cues.length);
    }
  });

  it("briefs the station sounds Can't see must learn: a dial's tick and tumbler, a radio's static, the bell", () => {
    const [draft] = loadRooms("./spec/fixtures/drafts");
    if (!draft) throw new Error("no draft");
    const cues = cuesIn(draft);
    expect(cues).toEqual(expect.arrayContaining(["tick", "tumbler", "static", "bell"]));
    expect(cues.indexOf("tick")).toBeLessThan(cues.indexOf("tumbler"));
  });
});
