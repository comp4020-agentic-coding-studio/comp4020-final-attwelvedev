import { describe, expect, it } from "vitest";
import { viewFor } from "../perception.ts";
import { step } from "./step.ts";
import { hold, worldFrom } from "./testing.ts";
import { addStamp, STAMP_LIFE_MS, TICK_MS } from "./world.ts";

const GRID = ["##########", "#1.......#", "#2.......#", "#3.......#", "##########"];

describe("stamps in the world", () => {
  it("are placed, age with the tick, and are gone after 8 s", () => {
    const w = worldFrom(GRID);
    addStamp(w, "key", { x: 4.5, y: 2.5 });
    expect(w.stamps).toHaveLength(1);
    hold(w, {}, 10);
    expect(w.stamps[0]?.ageMs).toBe(10 * TICK_MS);
    hold(w, {}, STAMP_LIFE_MS / TICK_MS);
    expect(w.stamps).toHaveLength(0);
  });

  it("each get their own id", () => {
    const w = worldFrom(GRID);
    addStamp(w, "x", { x: 2.5, y: 2.5 });
    addStamp(w, "x", { x: 3.5, y: 2.5 });
    expect(new Set(w.stamps.map((s) => s.key)).size).toBe(2);
    step(w, {}, TICK_MS);
    expect(w.stamps).toHaveLength(2);
  });
});

describe("viewFor and stamps", () => {
  it("deaf and mute see a stamp as an entity with its id and age; blind never does", () => {
    const w = worldFrom(GRID);
    addStamp(w, "door", { x: 4.5, y: 2.5 });
    hold(w, {}, 2);
    for (const [seat, role] of [
      [1, "deaf"],
      [2, "mute"],
    ] as const) {
      const stamp = viewFor(w, seat, role, false).entities.find((e) => e.kind === "stamp");
      expect(stamp).toMatchObject({ kind: "stamp", state: "door", pos: { x: 4.5, y: 2.5 } });
      expect(stamp?.age).toBe(2 * TICK_MS);
    }
    const blind = viewFor(w, 0, "blind", true);
    expect(blind.entities).toEqual([]);
    expect(JSON.stringify(blind)).not.toContain("stamp");
  });
});
