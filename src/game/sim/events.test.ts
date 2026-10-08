import { describe, expect, it } from "vitest";
import { step } from "./step.ts";
import { gather, place, tap, worldWith } from "./testing.ts";
import { TICK_MS, type World } from "./world.ts";

const tile = (x: number, y: number) => ({ x, y });
const go = (w: World) => step(w, {}, TICK_MS);
const kinds = (w: World, kind: string) => w.events.filter((e) => e.kind === kind);

describe("hiding", () => {
  const GRID = ["##########", "#1..h....#", "#2.......#", "#3.......#", "##########"];
  it("marks a player hidden while on a hide spot, with one event each way", () => {
    const w = worldWith(GRID);
    place(w, 0, tile(4, 1));
    go(w);
    expect(w.players[0].hidden).toBe(true);
    expect(kinds(w, "hide")).toEqual([
      { kind: "hide", seat: 0, hidden: true, at: { x: 4.5, y: 1.5 } },
    ]);
    go(w);
    expect(kinds(w, "hide")).toEqual([]); // no repeat while they stay
    place(w, 0, tile(6, 1));
    go(w);
    expect(w.players[0].hidden).toBe(false);
    expect(kinds(w, "hide")).toMatchObject([{ hidden: false, seat: 0 }]);
  });
});

describe("a checkpoint flag filling up", () => {
  const GRID = ["##########", "#1...K...#", "#2.......#", "#3.......#", "##########"];
  it("reports how many of the three are within reach, each time that changes", () => {
    const w = worldWith(GRID);
    expect(kinds(w, "flag")).toEqual([]);
    place(w, 0, tile(5, 1));
    go(w);
    expect(kinds(w, "flag")).toMatchObject([{ id: "K1", present: 1 }]);
    place(w, 1, tile(5, 1));
    go(w);
    expect(kinds(w, "flag")).toMatchObject([{ present: 2 }]);
    go(w);
    expect(kinds(w, "flag")).toEqual([]); // unchanged: quiet
    place(w, 1, tile(8, 3));
    go(w);
    expect(kinds(w, "flag")).toMatchObject([{ present: 1 }]);
  });

  it("stops reporting once the flag is set", () => {
    const w = worldWith(GRID);
    gather(w, tile(5, 1));
    go(w);
    expect(w.checkpoint).toBe(1);
    place(w, 0, tile(8, 3));
    go(w);
    expect(kinds(w, "flag")).toEqual([]);
  });
});

describe("the exit filling up", () => {
  const GRID = ["##########", "#1.....EE#", "#2.......#", "#3.......#", "##########"];
  it("reports how many players are on it, each time that changes", () => {
    const w = worldWith(GRID);
    place(w, 0, tile(7, 1));
    go(w);
    expect(kinds(w, "exit")).toMatchObject([{ present: 1 }]);
    place(w, 1, tile(8, 1));
    go(w);
    expect(kinds(w, "exit")).toMatchObject([{ present: 2 }]);
    place(w, 0, tile(2, 2));
    go(w);
    expect(kinds(w, "exit")).toMatchObject([{ present: 1 }]);
  });
});

describe("a sequence door's results", () => {
  const GRID = [
    "####################",
    "#1..p.p.p..#.......#",
    "#2.........D.....E.#",
    "#3.........#.......#",
    "####################",
  ];
  const door = { D1: { mode: "sequence", opensWhen: ["p2", "p1", "p3"] } };
  const park = tile(2, 1);
  const press = (w: World, x: number) => {
    tap(w, 0, tile(x, 1), park);
  };
  // the tap's two steps: the press is in the first one's events
  const results = (w: World, x: number) => {
    place(w, 0, tile(x, 1));
    go(w);
    const found = kinds(w, "seq");
    place(w, 0, park);
    go(w);
    return found;
  };

  it("says ok for each right plate, with how many are done, and open for the last", () => {
    const w = worldWith(GRID, door);
    expect(results(w, 6)).toMatchObject([{ door: "D1", result: "ok", n: 1 }]);
    expect(results(w, 4)).toMatchObject([{ result: "ok", n: 2 }]);
    expect(results(w, 8)).toMatchObject([{ result: "open", n: 3 }]);
  });

  it("says wrong for a wrong plate", () => {
    const w = worldWith(GRID, door);
    expect(results(w, 4)).toMatchObject([{ result: "wrong", n: 0 }]);
  });

  it("says wrong when the 5 s run out on a started sequence", () => {
    const w = worldWith(GRID, door);
    press(w, 6);
    let found: unknown[] = [];
    for (let i = 0; i < 110 && found.length === 0; i++) {
      go(w);
      found = kinds(w, "seq");
    }
    expect(found).toMatchObject([{ result: "wrong", n: 0 }]);
  });

  it("keeps the result on the world for the sign to show for a moment", () => {
    const w = worldWith(GRID, door);
    place(w, 0, tile(6, 1));
    go(w);
    expect(w.seqFlash.D1).toMatchObject({ result: "ok" });
  });
});
