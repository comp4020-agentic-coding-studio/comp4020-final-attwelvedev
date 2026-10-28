import { describe, expect, it } from "vitest";
import type { EntityView } from "../game/perception.ts";
import { LABEL_COPY, labelsFor } from "./labels.ts";

const plate: EntityView = { id: "p1", kind: "plate", pos: { x: 3.5, y: 4.5 } };
const plate2: EntityView = { id: "p2", kind: "plate", pos: { x: 9.5, y: 4.5 } };
const crate: EntityView = { id: "B1", kind: "crate", pos: { x: 5.5, y: 4.5 } };
const door: EntityView = { id: "D1", kind: "door", pos: { x: 8.5, y: 4.5 }, state: "closed" };
const me = { x: 2.5, y: 4.5 };

// Labels are a reference (FR15): a kind's chip is there whenever one of it is in sight.
describe("labelsFor", () => {
  it("labels every kind in sight, and is the same on every frame (nothing times out)", () => {
    const first = labelsFor([plate, crate, door], undefined, me, true);
    expect(first.map((l) => l.kind).sort()).toEqual(["crate", "door", "plate"]);
    expect(first.find((l) => l.kind === "plate")?.text).toBe(LABEL_COPY.plate);
    expect(labelsFor([plate, crate, door], undefined, me, true)).toEqual(first);
  });

  it("gives one chip per kind, on the nearest one in sight", () => {
    const got = labelsFor([plate2, plate], undefined, me, true);
    expect(got).toHaveLength(1);
    expect(got[0]?.at).toEqual({ x: 3.5, y: 4.5 });
  });

  it("points at the middle of a door that spans several tiles, not at one tile of it", () => {
    const tile = (y: number): EntityView => ({
      id: "D1",
      kind: "door",
      pos: { x: 8.5, y },
      state: "closed",
    });
    const got = labelsFor([tile(4.5), tile(5.5), tile(6.5)], undefined, { x: 2.5, y: 6.5 }, true);
    expect(got).toHaveLength(1);
    expect(got[0]?.at).toEqual({ x: 8.5, y: 5.5 });
  });

  it("drops a kind when none of it is in sight, and brings it back when one is", () => {
    const seesNone = () => false;
    expect(labelsFor([plate], undefined, me, true, seesNone)).toEqual([]);
    expect(labelsFor([plate], undefined, me, true)).toHaveLength(1);
  });

  it("gives none when labels are off", () => {
    expect(labelsFor([plate], undefined, me, false)).toEqual([]);
  });

  it("labels glass and vents from the tiles in sight", () => {
    const tiles = ["#####", "#.=%#", "#####"];
    const got = labelsFor([], tiles, { x: 1.5, y: 1.5 }, true);
    expect(got.map((l) => l.kind).sort()).toEqual(["glass", "vent"]);
    expect(got.find((l) => l.kind === "glass")?.at).toEqual({ x: 2.5, y: 1.5 });
  });

  it("labels no tiles when none are given", () => {
    expect(labelsFor([], undefined, me, true)).toEqual([]);
  });
});
