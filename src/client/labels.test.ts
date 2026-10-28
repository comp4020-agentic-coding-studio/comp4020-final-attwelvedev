import { describe, expect, it } from "vitest";
import type { EntityView } from "../game/perception.ts";
import { LABEL_CAP, LABEL_COPY, labelsFor } from "./labels.ts";

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

// Escape-room objects (phase 02 Task 10): each new thing names itself and what to do with it.
describe("labelsFor: stations, gear and signals", () => {
  const st = (id: string, type: NonNullable<EntityView["station"]>["type"]): EntityView => ({
    id,
    kind: "station",
    pos: { x: 4.5, y: 4.5 },
    station: { type, shows: [], solved: false, parts: [{ key: "anchor", at: [{ x: 4, y: 4 }] }] },
  });

  it("labels a dial station as the safe, with what to do", () => {
    const [l] = labelsFor([st("Q1", "dial")], undefined, me, true);
    expect(l?.text).toBe("Safe: stand on an arrow and press Act to turn the dial");
  });

  it("has the spec's line for every station type, gear, the hatch, bell, lamp and ink", () => {
    const types = [
      "dial",
      "wires",
      "keypad",
      "radio",
      "switches",
      "bells",
      "vault",
      "sync",
    ] as const;
    const texts = labelsFor(
      [
        ...types.map((t, i) => ({ ...st(`Q${i}`, t), pos: { x: 3 + i, y: 4.5 } })),
        { id: "g1", kind: "gear", pos: { x: 3.5, y: 5.5 }, item: "uv" },
        { id: "H1", kind: "hatch", pos: { x: 4.5, y: 5.5 } },
        { id: "b1", kind: "bell", pos: { x: 5.5, y: 5.5 } },
        { id: "l1", kind: "lamp", pos: { x: 6.5, y: 5.5 } },
        { id: "u1", kind: "ink", pos: { x: 7.5, y: 5.5 }, text: "7 3" },
      ] as EntityView[],
      undefined,
      me,
      true,
    ).map((l) => l.text);
    for (const line of [
      "Safe: stand on an arrow and press Act to turn the dial",
      "Wires: stand under one and press Act to cut it",
      "Keypad: each key has its own note and light",
      "Radio: turn until the static clears, then count the pips",
      "Switches: each one flips lamps in another room",
      "Music box: strike the bells in the tune's order",
      "Vault: one symbol from each wing",
      "Keys: two of you turn them at the same moment",
      "Gear: walk over it and press Act to pick it up",
      "Hatch: gear and crates go through, people don't",
      "Bell: pull the rope; everyone who can hear, hears it",
      "Lamp: flips a light on every sighted teammate's screen",
      "Plaque: a rule for another room. Some are only in UV ink",
    ])
      expect(texts).toContain(line);
  });

  it("labels holding hands on a figure who is holding a hand", () => {
    const leader: EntityView = {
      id: "P0",
      kind: "player",
      seat: 0,
      pos: { x: 3.5, y: 4.5 },
      holding: 1,
    };
    const texts = labelsFor([leader], undefined, me, true).map((l) => l.text);
    expect(texts).toContain("Hold hands: press Act next to a teammate");
  });
});

describe("labelsFor: where a station's chip points", () => {
  it("points at the station's own parts, not at an anchor out of sight (the music box's bells)", () => {
    const box: EntityView = {
      id: "Q7",
      kind: "station",
      pos: { x: 13.5, y: 11.5 }, // the tune box, behind glass
      station: {
        type: "bells",
        shows: [],
        solved: false,
        parts: [
          { key: "anchor", at: [{ x: 13, y: 11 }] },
          {
            key: "bells",
            at: [
              { x: 7, y: 10 },
              { x: 9, y: 10 },
            ],
          },
          { key: "tune", at: [{ x: 13, y: 11 }] },
        ],
      },
    };
    const [l] = labelsFor([box], undefined, { x: 8, y: 8 }, true);
    expect(l?.at).toEqual({ x: 8.5, y: 10.5 });
  });
});

// Label cap (clues FR12): three chips on desktop, two on a phone, the nearest first.
describe("labelsFor: the cap", () => {
  const five: EntityView[] = [
    { ...plate, pos: { x: 3.5, y: 4.5 } },
    { ...crate, pos: { x: 4.5, y: 4.5 } },
    { ...door, pos: { x: 6.5, y: 4.5 } },
    { id: "g1", kind: "gear", pos: { x: 8.5, y: 4.5 }, item: "uv" },
    { id: "b1", kind: "bell", pos: { x: 10.5, y: 4.5 } },
  ];
  it("keeps the three nearest kinds on desktop", () => {
    const got = labelsFor(five, undefined, me, true, () => true, undefined, LABEL_CAP.desktop);
    expect(got.map((l) => l.kind).sort()).toEqual(["crate", "door", "plate"]);
  });
  it("keeps the two nearest kinds on a phone", () => {
    const got = labelsFor(five, undefined, me, true, () => true, undefined, LABEL_CAP.phone);
    expect(got.map((l) => l.kind).sort()).toEqual(["crate", "plate"]);
  });
  it("has no cap unless asked", () => {
    expect(labelsFor(five, undefined, me, true)).toHaveLength(5);
  });
});
