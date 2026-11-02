import { describe, expect, it } from "vitest";
import { creditsOf } from "./credits.ts";
import { step } from "./step.ts";
import { place, stationWorld } from "./testing.ts";
import { TICK_MS } from "./world.ts";

describe("creditsOf", () => {
  it("gives one line per seat, with a fallback for a seat that did nothing", () => {
    const w = stationWorld({
      Q1: {
        type: "dial",
        pads: [
          [5, 4],
          [9, 4],
        ],
        back: [7, 6],
        range: 10,
      },
    });
    const lines = creditsOf(w);
    expect(lines.map((c) => c.seat)).toEqual([0, 1, 2]);
    for (const c of lines) expect(c.lines.length).toBeGreaterThan(0);
  });

  it("credits whoever solved a station, from a fixed template", () => {
    const w = stationWorld({
      Q1: {
        type: "dial",
        pads: [
          [5, 4],
          [9, 4],
        ],
        back: [7, 6],
        range: 10,
      },
    });
    const s = w.stations.Q1;
    if (!s) throw new Error("no station");
    s.solved = true;
    w.solvedBy.Q1 = 2;
    expect(creditsOf(w).find((c) => c.seat === 2)?.lines).toEqual(["cracked the safe"]);
    expect(creditsOf(w).find((c) => c.seat === 0)?.lines).toEqual(["kept the crew moving"]);
  });

  it("folds the same job done twice into one line with a count", () => {
    const w = stationWorld({
      Q1: {
        type: "dial",
        pads: [
          [5, 4],
          [9, 4],
        ],
        back: [7, 6],
        range: 10,
      },
      Q2: {
        type: "dial",
        pads: [
          [5, 5],
          [9, 5],
        ],
        back: [7, 6],
        range: 10,
      },
      Q3: {
        type: "radio",
        pads: [
          [6, 4],
          [8, 4],
        ],
        range: 8,
      },
    });
    for (const id of ["Q1", "Q2", "Q3"]) {
      const s = w.stations[id];
      if (s) s.solved = true;
      w.solvedBy[id] = 1;
    }
    expect(creditsOf(w).find((c) => c.seat === 1)?.lines).toEqual([
      "cracked 2 safes",
      "tuned the radio",
    ]);
  });

  it("credits a side job to its owner and its picker, naming the other by seat token", () => {
    const w = stationWorld({
      Q1: {
        type: "radio",
        pads: [
          [6, 4],
          [8, 4],
        ],
        range: 8,
      },
    });
    w.sideJobsDone.push("j1");
    w.sideJobBy.j1 = 0;
    w.room.objects.push({
      id: "j1",
      kind: "sidejob",
      tiles: [{ x: 3, y: 3 }],
      visibleTo: [],
      audibleTo: [],
      params: { owner: 2, text: "the music box" },
    });
    const lines = creditsOf(w);
    expect(lines.find((c) => c.seat === 1)?.lines).toEqual(["side job: the music box (with {0})"]);
    expect(lines.find((c) => c.seat === 0)?.lines).toEqual([
      "fetched {1}'s side job: the music box",
    ]);
  });

  it("a solve made by Act records who did it", () => {
    const w = stationWorld(
      {
        Q1: {
          type: "radio",
          pads: [
            [6, 4],
            [8, 4],
          ],
          range: 8,
        },
      },
      4,
    );
    for (let i = 0; i < 8 && !w.stations.Q1?.solved; i++) {
      place(w, 2, { x: 8, y: 4 });
      step(w, { 2: { seq: i * 2, move: { x: 0, y: 0 }, act: true } }, TICK_MS);
      step(w, { 2: { seq: i * 2 + 1, move: { x: 0, y: 0 }, act: false } }, TICK_MS);
    }
    expect(w.stations.Q1?.solved).toBe(true);
    expect(w.solvedBy).toEqual({ Q1: 2 });
  });
});
