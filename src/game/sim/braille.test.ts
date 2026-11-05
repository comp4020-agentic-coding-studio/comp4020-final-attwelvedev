import { describe, expect, it } from "vitest";
import { BRAILLE_KEY, brailleCells, plateNumber } from "./braille.ts";
import { redrawOne } from "./stations.ts";
import { stationWorld } from "./testing.ts";
import type { World } from "./world.ts";

const PADS = [
  [5, 1],
  [9, 1],
];
const KEYS = [0, 1, 2].flatMap((y) => [0, 1, 2].map((x) => [10 + x, 1 + y]));
const WIRES = [
  [10, 1],
  [11, 1],
  [12, 1],
];
const answer = (w: World, id = "Q1") =>
  (w.stations[id] as NonNullable<World["stations"][string]>).answer;

describe("brailleCells: grade-1 numbers", () => {
  it("is the number sign, then a to j for each digit", () => {
    expect(brailleCells(7)).toEqual([
      [3, 4, 5, 6],
      [1, 2, 4, 5],
    ]);
    expect(brailleCells(10)).toEqual([[3, 4, 5, 6], [1], [2, 4, 5]]);
    expect(brailleCells(0)).toEqual([
      [3, 4, 5, 6],
      [2, 4, 5],
    ]);
  });

  it("has a fixed key: 1 to 9, 0 and the number sign", () => {
    expect(BRAILLE_KEY.map((k) => k.label)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "0",
      "#",
    ]);
    for (const k of BRAILLE_KEY.slice(0, 10)) {
      expect(brailleCells(Number(k.label))[1]).toEqual(k.dots);
    }
    expect(BRAILLE_KEY[10]?.dots).toEqual([3, 4, 5, 6]);
  });
});

describe("plateNumber: what a plate carries (overview §4.1)", () => {
  it("a dial: the digit at `part`", () => {
    const w = stationWorld({ Q1: { type: "dial", pads: PADS, digits: 3 } });
    for (const part of [0, 1, 2]) {
      w.room.objects.push({
        id: `o${part + 2}`,
        kind: "braille",
        tiles: [{ x: 2, y: 2 }],
        visibleTo: ["deaf", "mute"],
        audibleTo: [],
        params: { for: "Q1", part },
      });
      expect(plateNumber(w, `o${part + 2}`)).toBe(answer(w)[part]);
    }
  });

  it("a keypad: the key at `part`, plus one (keys are numbered 1 to 9)", () => {
    const w = plated({ Q1: { type: "keypad", keys: KEYS } }, { for: "Q1", part: 2 });
    expect(plateNumber(w, "o1")).toBe((answer(w)[2] as number) + 1);
  });

  it("a radio: its real band", () => {
    const w = plated({ Q1: { type: "radio", pads: PADS, range: 10 } }, { for: "Q1", part: 0 });
    expect(plateNumber(w, "o1")).toBe(answer(w)[0]);
  });

  it("wires: the wire to cut, plus one", () => {
    const w = plated({ Q1: { type: "wires", wires: WIRES } }, { for: "Q1", part: 0 });
    expect(plateNumber(w, "o1")).toBe((answer(w)[0] as number) + 1);
  });

  it("reads the answer live: a redraw changes it", () => {
    const w = plated({ Q1: { type: "dial", pads: PADS, digits: 3 } }, { for: "Q1", part: 1 });
    const o = w.room.objects.find((x) => x.id === "Q1") as NonNullable<
      World["room"]["objects"][number]
    >;
    const s = w.stations.Q1 as NonNullable<World["stations"][string]>;
    const seen = new Set<number | undefined>();
    for (let t = 0; t < 20; t++) {
      w.tick = t;
      redrawOne(w, o, s);
      expect(plateNumber(w, "o1")).toBe(s.answer[1]);
      seen.add(plateNumber(w, "o1"));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("is undefined for an unknown plate or station", () => {
    const w = plated({ Q1: { type: "dial", pads: PADS } }, { for: "Q9", part: 0 });
    expect(plateNumber(w, "o1")).toBeUndefined();
    expect(plateNumber(w, "o7")).toBeUndefined();
  });
});

// A station world with one plate o1 at (2, 2) carrying `params`.
function plated(objects: Record<string, unknown>, params: Record<string, unknown>): World {
  const w = stationWorld(objects);
  w.room.objects.push({
    id: "o1",
    kind: "braille",
    tiles: [{ x: 2, y: 2 }],
    visibleTo: ["deaf", "mute"],
    audibleTo: [],
    params,
  });
  return w;
}
