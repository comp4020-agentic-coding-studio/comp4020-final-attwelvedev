import { describe, expect, it } from "vitest";
import { cacheResultOf, creditsOf } from "./credits.ts";
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

describe("a cache's credit and result (caches FR15, FR16)", () => {
  const DIAL = {
    type: "dial",
    pads: [
      [5, 4],
      [9, 4],
    ],
    back: [7, 6],
    range: 10,
  };
  const cacheWorld = (owner: 1 | 2 | 3) =>
    stationWorld({
      Q1: {
        ...DIAL,
        cache: {
          owner,
          motif: "moon",
          riddle: "Where the moon watches, listen twice.",
          item: "watch",
          tiles: [
            { at: [3, 2], motif: "moon" },
            { at: [4, 2], motif: "star" },
          ],
        },
      },
      Q2: {
        ...DIAL,
        pads: [
          [5, 5],
          [9, 5],
        ],
      },
      Q3: {
        ...DIAL,
        pads: [
          [5, 3],
          [9, 3],
        ],
      },
    });
  const solve = (w: ReturnType<typeof cacheWorld>, id: string, seat: 0 | 1 | 2) => {
    const s = w.stations[id];
    if (s) s.solved = true;
    w.solvedBy[id] = seat;
    if (id === "Q1") w.cacheBy[id] = seat;
  };

  it("names the owner to the solver, and says 'side job found' to the owner", () => {
    const w = cacheWorld(1);
    solve(w, "Q1", 2);
    expect(creditsOf(w).find((c) => c.seat === 2)?.lines).toEqual([
      "found {0}'s side job: the gold watch",
    ]);
    const mine = cacheWorld(2);
    solve(mine, "Q1", 1);
    expect(creditsOf(mine).find((c) => c.seat === 1)?.lines).toEqual([
      "side job found: the gold watch",
    ]);
  });

  it("adds nothing for a cache nobody solved, and keeps ordinary stations folding", () => {
    const w = cacheWorld(1);
    solve(w, "Q2", 0);
    solve(w, "Q3", 0);
    expect(creditsOf(w).find((c) => c.seat === 0)?.lines).toEqual(["cracked 2 safes"]);
    expect(
      creditsOf(w)
        .flatMap((c) => c.lines)
        .join(" "),
    ).not.toMatch(/side job/);
  });

  it("a solved cache is not counted as 'cracked the safe'", () => {
    const w = cacheWorld(1);
    solve(w, "Q1", 0);
    expect(creditsOf(w).find((c) => c.seat === 0)?.lines).toEqual([
      "side job found: the gold watch",
    ]);
  });

  it("builds the room's cache result, found or not, and none for a room without one", () => {
    const w = cacheWorld(3);
    expect(cacheResultOf(w)).toEqual({
      room: w.room.id,
      found: false,
      item: "watch",
      owner: 2,
      riddle: "Where the moon watches, listen twice.",
    });
    solve(w, "Q1", 0);
    expect(cacheResultOf(w)).toMatchObject({ found: true, by: 0, owner: 2 });
    expect(cacheResultOf(stationWorld({ Q1: DIAL }))).toBeUndefined();
  });
});
