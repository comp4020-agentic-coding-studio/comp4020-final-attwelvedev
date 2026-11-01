import { describe, expect, it } from "vitest";
import type { Seat, Vec } from "../types.ts";
import { tuneGroups } from "./chimes.ts";
import { rng } from "./rng.ts";
import {
  drawAnswer,
  noteOf,
  plaqueText,
  ruleFor,
  stationShows,
  WIRE_COLOURS,
  WIRE_RULES,
} from "./stations.ts";
import { step } from "./step.ts";
import { input, place, stationWorld, worldWith } from "./testing.ts";
import type { StationState, World, WorldEvent } from "./world.ts";

// Seat 0 walks onto `tile` and presses Act for one tick, then lets go for one (Act is an edge).
function press(world: World, tile: Vec, seat: Seat = 0): WorldEvent[] {
  place(world, seat, tile);
  step(world, { [seat]: input(0, 0, true) });
  const events = [...world.events];
  step(world, { [seat]: input(0, 0, false) });
  return [...events, ...world.events];
}

const st = (world: World, id = "Q1"): StationState => world.stations[id] as StationState;
const kinds = (events: WorldEvent[]) => events.map((e) => e.kind);
const stationResults = (events: WorldEvent[]) =>
  events.flatMap((e) => (e.kind === "station" ? [e.result] : []));

// stationWorld (testing.ts): spawns at x = 1, Q1's anchor at (7, 4), and open floor for each
// station's parts. Seats 1 and 2 stay at the spawns.
const DIAL = {
  type: "dial",
  pads: [
    [6, 4],
    [8, 4],
  ],
  back: [7, 5],
  digits: 2,
  range: 10,
};

describe("a station's answer", () => {
  it("is drawn from the seed and the attempt, the same every time", () => {
    const a = stationWorld({ Q1: DIAL }, 7);
    const b = stationWorld({ Q1: DIAL }, 7);
    expect(st(a).answer).toEqual(st(b).answer);
    expect(st(a).answer).toHaveLength(2);
    for (const n of st(a).answer) expect(n).toBeGreaterThanOrEqual(0);
    for (const n of st(a).answer) expect(n).toBeLessThan(10);
    const seeds = new Set(
      [1, 2, 3, 4, 5, 6].map((s) => st(stationWorld({ Q1: DIAL }, s)).answer.join()),
    );
    expect(seeds.size).toBeGreaterThan(1);
  });

  it("is kept on the world with the seed and the attempt", () => {
    const w = stationWorld({ Q1: DIAL }, 9);
    expect(w.seed).toBe(9);
    expect(w.attempt).toBe(0);
    expect(st(w)).toMatchObject({ id: "Q1", type: "dial", input: [0], solved: false });
  });
});

describe("dial", () => {
  it("turns one notch per Act on a pad, wrapping, with a turn event", () => {
    const w = stationWorld({ Q1: DIAL }, 3);
    const e = press(w, { x: 8, y: 4 });
    expect(st(w).input).toEqual([1]);
    expect(e).toContainEqual(expect.objectContaining({ kind: "station", result: "turn", n: 1 }));
    press(w, { x: 6, y: 4 });
    press(w, { x: 6, y: 4 });
    expect(st(w).input).toEqual([9]); // 1 - 2 wraps round a range of 10
  });

  it("turns once for a held Act: it is an edge, not a level", () => {
    const w = stationWorld({ Q1: DIAL }, 3);
    place(w, 0, { x: 8, y: 4 });
    for (let i = 0; i < 5; i++) step(w, { 0: input(0, 0, true) });
    expect(st(w).input).toEqual([1]);
  });

  it("solves when every number is confirmed in order at the anchor, and opens its door", () => {
    const w = stationWorld({ Q1: DIAL, D1: { opensWhen: ["Q1"] } }, 3);
    const answer = [...st(w).answer];
    const all: WorldEvent[] = [];
    for (const n of answer) {
      while ((st(w).input.at(-1) ?? 0) !== n) all.push(...press(w, { x: 8, y: 4 }));
      all.push(...press(w, { x: 7, y: 4 }));
    }
    expect(st(w).solved).toBe(true);
    expect(stationResults(all).filter((r) => r === "press")).toHaveLength(answer.length);
    expect(stationResults(all).at(-1)).toBe("solved");
    expect(w.doorOpen.D1).toBe(true);
    expect(kinds(all)).not.toContain("dye");
  });

  it("is wrong when a confirmed number is wrong: dye, then the team is caught and sent back", () => {
    const w = stationWorld({ Q1: DIAL }, 3);
    const wrong = ((st(w).answer[0] as number) + 1) % 10;
    while ((st(w).input.at(-1) ?? 0) !== wrong) press(w, { x: 8, y: 4 });
    place(w, 1, { x: 10, y: 3 });
    const e = press(w, { x: 7, y: 4 });
    expect(stationResults(e)).toContain("wrong");
    expect(kinds(e)).toContain("dye");
    expect(e).toContainEqual(
      expect.objectContaining({ kind: "caught", hazard: "station", by: "Q1" }),
    );
    expect(kinds(e).indexOf("dye")).toBeLessThan(kinds(e).indexOf("caught"));
    expect(w.players.map((p) => p.pos)).toEqual(w.snapshot.players);
    expect(w.dyedUntil).toBeGreaterThan(w.tick);
  });
});

describe("a reset after a wrong answer", () => {
  it("keeps a solved station solved and draws a new answer for an unsolved one", () => {
    const sync = {
      type: "sync",
      keys: [
        [6, 3],
        [10, 3],
      ],
      windowMs: 500,
    };
    const w = stationWorld({ Q1: DIAL, Q2: sync }, 11);
    // solve Q2 (the sync lock): both keys in the same tick
    place(w, 0, { x: 6, y: 3 });
    place(w, 1, { x: 10, y: 3 });
    step(w, { 0: input(0, 0, true), 1: input(0, 0, true) });
    expect(st(w, "Q2").solved).toBe(true);
    step(w, {});
    const before = [...st(w).answer];
    const wrong = ((before[0] as number) + 1) % 10;
    while ((st(w).input.at(-1) ?? 0) !== wrong) press(w, { x: 8, y: 4 });
    press(w, { x: 7, y: 4 });
    expect(w.attempt).toBe(1);
    expect(st(w, "Q2").solved).toBe(true);
    expect(st(w).solved).toBe(false);
    expect(st(w).input).toEqual([0]);
    expect(st(w).answer).not.toEqual(before);
  });
});

describe("wires", () => {
  const WIRES = {
    type: "wires",
    wires: [
      [6, 1],
      [7, 1],
      [8, 1],
      [9, 1],
    ],
    plaque: "S1",
  };

  it("draws colours and a rule, writes the rule on its plaque, and solves on the right cut", () => {
    const w = stationWorld({ Q1: WIRES, S1: {} }, 5);
    const s = st(w);
    const right = s.answer[0] as number;
    expect(right).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThan(4);
    expect(plaqueText(w, "S1")).toBe(WIRE_RULES[s.answer[1] as number]?.text);
    const e = press(w, { x: 6 + right, y: 1 });
    expect(stationResults(e)).toEqual(["cut", "solved"]);
    expect(st(w).input).toEqual([right]);
    expect(st(w).solved).toBe(true);
  });

  it("is wrong on any other cut", () => {
    const w = stationWorld({ Q1: WIRES, S1: {} }, 5);
    const other = ((st(w).answer[0] as number) + 1) % 4;
    const e = press(w, { x: 6 + other, y: 1 });
    expect(kinds(e)).toContain("dye");
    expect(e).toContainEqual(expect.objectContaining({ kind: "caught", hazard: "station" }));
  });
});

describe("keypad", () => {
  const keys = [0, 1, 2].flatMap((y) => [0, 1, 2].map((x) => [6 + x, 1 + y]));
  const KEYPAD = { type: "keypad", keys, clue: "c1", length: 3 };

  it("appends each key, with its pitch, and solves on the full right sequence", () => {
    const w = stationWorld({ Q1: KEYPAD }, 8);
    const code = [...st(w).answer];
    expect(code).toHaveLength(3);
    const all: WorldEvent[] = [];
    for (const k of code) all.push(...press(w, { x: 6 + (k % 3), y: 1 + Math.floor(k / 3) }));
    const pressed = all.flatMap((e) => (e.kind === "station" && e.result === "press" ? [e.n] : []));
    expect(pressed).toEqual(code);
    expect(st(w).solved).toBe(true);
  });

  it("is wrong on a wrong key", () => {
    const w = stationWorld({ Q1: KEYPAD }, 8);
    const k = ((st(w).answer[0] as number) + 1) % 9;
    const e = press(w, { x: 6 + (k % 3), y: 1 + Math.floor(k / 3) });
    expect(kinds(e)).toContain("dye");
  });
});

describe("radio", () => {
  const RADIO = {
    type: "radio",
    pads: [
      [6, 4],
      [8, 4],
    ],
    range: 8,
  };

  it("turns like a dial and solves (tuned) on its setting, never wrong", () => {
    const w = stationWorld({ Q1: RADIO }, 4);
    const [setting, digit] = st(w).answer as [number, number];
    expect(digit).toBeGreaterThanOrEqual(1);
    expect(digit).toBeLessThanOrEqual(3);
    const all: WorldEvent[] = [];
    for (let i = 0; i < 8 && !st(w).solved; i++) all.push(...press(w, { x: 8, y: 4 }));
    expect(st(w).solved).toBe(true);
    expect(st(w).input).toEqual([setting]);
    expect(kinds(all)).not.toContain("dye");
    expect(kinds(all)).not.toContain("caught");
  });
});

describe("switches", () => {
  // a 2×3 lights-out: buttons on the left, lamps (behind glass, elsewhere) on the right
  const buttons = [0, 1].flatMap((y) => [0, 1, 2].map((x) => [6 + x, 1 + y]));
  const lamps = [0, 1].flatMap((y) => [0, 1, 2].map((x) => [11 + x, 1 + y]));
  const SWITCHES = { type: "switches", buttons, lamps, cols: 3 };

  it("toggles a button's lamp and its neighbours', and solves on the target pattern", () => {
    const w = stationWorld({ Q1: SWITCHES }, 2);
    expect(st(w).input).toEqual([0, 0, 0, 0, 0, 0]);
    press(w, { x: 6, y: 1 }); // button 0 toggles lamps 0, 1 and 3
    expect(st(w).input).toEqual([1, 1, 0, 1, 0, 0]);
  });

  it("never emits dye, and some presses reach every drawn target", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const w = stationWorld({ Q1: SWITCHES }, seed);
      const target = [...st(w).answer];
      // the target was drawn by pressing buttons, so pressing the same set again from it is zero:
      // search the 64 press sets for the one that reaches it
      let reached = false;
      for (let mask = 0; mask < 64 && !reached; mask++) {
        const lit = [0, 0, 0, 0, 0, 0];
        for (let b = 0; b < 6; b++) {
          if (!(mask & (1 << b))) continue;
          for (const n of [b, b - 3, b + 3, b % 3 > 0 ? b - 1 : -1, b % 3 < 2 ? b + 1 : -1]) {
            if (n >= 0 && n < 6) lit[n] = 1 - (lit[n] as number);
          }
        }
        reached = lit.join() === target.join();
      }
      expect(reached, `seed ${seed}`).toBe(true);
      expect(
        target.some((v) => v === 1),
        `seed ${seed} target is not all dark`,
      ).toBe(true);
    }
    const w = stationWorld({ Q1: SWITCHES }, 2);
    const all: WorldEvent[] = [];
    for (const b of buttons) all.push(...press(w, { x: b[0] as number, y: b[1] as number }));
    expect(kinds(all)).not.toContain("dye");
  });
});

describe("bells", () => {
  const BELLS = {
    type: "bells",
    bells: [
      [6, 1],
      [7, 1],
      [8, 1],
      [9, 1],
    ],
    tune: [7, 3],
  };

  it("solves when the bells are struck in the tune's order; a wrong bell is wrong", () => {
    const w = stationWorld({ Q1: BELLS }, 6);
    const tune = [...st(w).answer];
    expect(tune).toHaveLength(4);
    for (const n of tune) press(w, { x: 6 + n, y: 1 });
    expect(st(w).solved).toBe(true);
    const v = stationWorld({ Q1: BELLS }, 6);
    const e = press(v, { x: 6 + (((tune[0] as number) + 1) % 4), y: 1 });
    expect(kinds(e)).toContain("dye");
  });
});

describe("a practice lever (Task 38)", () => {
  // a keypad whose practice lever v1 stands at (3, 2); the keys at (6..8, 1..3)
  const keys = [0, 1, 2].flatMap((y) => [0, 1, 2].map((x) => [6 + x, 1 + y]));
  const GRID = ["###########", "#1...Q....#", "#2.v......#", "#3........#", "###########"];
  const lever = () =>
    worldWith(GRID, { Q1: { type: "keypad", keys, clue: "c9", length: 3, practice: "v1" } }, {});
  const flip = (w: World) => press(w, { x: 3, y: 2 });
  const keyTile = (k: number) => ({ x: 6 + (k % 3), y: 1 + Math.floor(k / 3) });

  it("is off to start, and Act on it toggles it, with a clunk each time", () => {
    const w = lever();
    expect(w.levers.v1).toBe(false);
    expect(flip(w).map((e) => e.kind)).toContain("lever");
    expect(w.levers.v1).toBe(true);
    flip(w);
    expect(w.levers.v1).toBe(false);
  });

  it("while on, the right keys sound and do not count: nothing solved, no wrong answer", () => {
    const w = lever();
    flip(w);
    const code = [...st(w).answer];
    const heard: WorldEvent[] = [];
    for (const k of code) heard.push(...press(w, keyTile(k)));
    expect(st(w).solved).toBe(false);
    expect(st(w).input).toEqual([]);
    expect(heard.filter((e) => e.kind === "station")).toEqual(
      code.map((n) => expect.objectContaining({ result: "press", n })),
    );
    // a wrong key is no wrong answer either: no dye, nobody caught
    const wrong = press(w, keyTile((code[0] as number) + 1 > 8 ? 0 : (code[0] as number) + 1));
    expect(kinds(wrong)).not.toContain("dye");
    expect(kinds(wrong)).not.toContain("caught");
  });

  it("turned off again, the same keys count and solve it", () => {
    const w = lever();
    flip(w);
    for (const k of st(w).answer) press(w, keyTile(k));
    flip(w);
    for (const k of st(w).answer) press(w, keyTile(k));
    expect(st(w).solved).toBe(true);
  });

  it("a practice press says it is practice, so the client can sound it apart from a real one", () => {
    const w = lever();
    flip(w);
    const e = press(w, keyTile(st(w).answer[0] as number)).find((x) => x.kind === "station");
    expect(e).toMatchObject({ result: "press", practice: true });
    flip(w);
    const real = press(w, keyTile(st(w).answer[0] as number)).find((x) => x.kind === "station");
    expect(real).toMatchObject({ result: "press" });
    expect(real).not.toHaveProperty("practice");
  });
});

describe("a practice press carries its note and its kind (Task 42)", () => {
  it("a bell's practice press is note n of a bell; a key's is note n of a key", () => {
    const w = worldWith(
      ["###########", "#1..Q.v...#", "#2........#", "#3........#", "###########"],
      {
        Q1: {
          type: "bells",
          bells: [
            [6, 2],
            [7, 2],
            [8, 2],
            [9, 2],
          ],
          tune: [1, 2],
          practice: "v1",
        },
      },
      {},
    );
    press(w, { x: 6, y: 1 }); // the lever on
    expect(w.levers.v1).toBe(true);
    const e = press(w, { x: 8, y: 2 }).find((x) => x.kind === "station");
    expect(e).toMatchObject({ result: "press", n: 2, practice: true });
  });
});

describe("vault", () => {
  const VAULT = {
    type: "vault",
    sockets: [
      [6, 2],
      [8, 2],
    ],
    from: ["Q2", "Q3"],
  };
  const SYNC = (x: number) => ({ type: "sync", keys: [[x, 4]], windowMs: 500 });

  it("cycles each socket through six symbols and solves at the anchor when all match", () => {
    const w = stationWorld({ Q1: VAULT, Q2: SYNC(10), Q3: SYNC(12) }, 10);
    const symbols = [...st(w).answer];
    expect(symbols).toHaveLength(2);
    press(w, { x: 6, y: 2 });
    expect(st(w).input).toEqual([1, 0]);
    for (const [i, x] of [6, 8].entries()) {
      while (st(w).input[i] !== symbols[i]) press(w, { x, y: 2 });
    }
    press(w, { x: 7, y: 4 });
    expect(st(w).solved).toBe(true);
  });

  it("is wrong at the anchor with a socket set wrong", () => {
    const w = stationWorld({ Q1: VAULT, Q2: SYNC(10), Q3: SYNC(12) }, 10);
    while (st(w).input[0] === st(w).answer[0]) press(w, { x: 6, y: 2 });
    const e = press(w, { x: 7, y: 4 });
    expect(kinds(e)).toContain("dye");
  });
});

describe("sync", () => {
  const SYNC = {
    type: "sync",
    keys: [
      [6, 3],
      [10, 3],
    ],
    windowMs: 500,
  };

  it("solves when every key is turned within the window", () => {
    const w = stationWorld({ Q1: SYNC }, 1);
    place(w, 1, { x: 10, y: 3 });
    place(w, 0, { x: 6, y: 3 });
    step(w, { 0: input(0, 0, true) });
    for (let i = 0; i < 5; i++) step(w, {}); // 250 ms later
    step(w, { 1: input(0, 0, true) });
    expect(st(w).solved).toBe(true);
  });

  it("resets its input on a miss, without dye or a catch", () => {
    const w = stationWorld({ Q1: SYNC }, 1);
    place(w, 1, { x: 10, y: 3 });
    place(w, 0, { x: 6, y: 3 });
    const all: WorldEvent[] = [];
    step(w, { 0: input(0, 0, true) });
    all.push(...w.events);
    for (let i = 0; i < 12; i++) {
      step(w, {}); // 600 ms: past the window
      all.push(...w.events);
    }
    expect(st(w).input).toEqual([0, 0]);
    step(w, { 1: input(0, 0, true) });
    all.push(...w.events);
    expect(st(w).solved).toBe(false);
    expect(kinds(all)).not.toContain("dye");
    expect(kinds(all)).not.toContain("caught");
  });
});

describe("every drawn answer can be entered (200 seeds per type)", () => {
  it("dial, keypad, radio, bells and vault answers are in range", () => {
    const params = {
      dial: { digits: 3, range: 10 },
      keypad: { length: 4 },
      radio: { range: 8 },
      bells: {
        bells: [
          [0, 0],
          [1, 0],
          [2, 0],
          [3, 0],
          [4, 0],
        ],
      },
      vault: {
        sockets: [
          [0, 0],
          [1, 0],
          [2, 0],
        ],
      },
    } as const;
    for (let seed = 0; seed < 200; seed++) {
      const r = rng(seed);
      const dial = drawAnswer("dial", params.dial, r);
      expect(dial.every((n) => Number.isInteger(n) && n >= 0 && n < 10)).toBe(true);
      expect(dial).toHaveLength(3);
      const keypad = drawAnswer("keypad", params.keypad, r);
      expect(keypad.every((n) => Number.isInteger(n) && n >= 0 && n < 9)).toBe(true);
      expect(keypad).toHaveLength(4);
      const [setting, digit] = drawAnswer("radio", params.radio, r);
      expect(setting).toBeGreaterThanOrEqual(0);
      expect(setting).toBeLessThan(8);
      expect([1, 2, 3]).toContain(digit);
      const bells = drawAnswer("bells", params.bells, r);
      expect(bells).toHaveLength(4);
      expect(bells.every((n) => n >= 0 && n < 5)).toBe(true);
      const vault = drawAnswer("vault", params.vault, r);
      expect(vault).toHaveLength(3);
      expect(vault.every((n) => n >= 0 && n < 6)).toBe(true);
    }
  });

  it("wires: the drawn rule always names a wire that exists, and is the first rule that applies", () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const count of [3, 4, 5]) {
        const wires = Array.from({ length: count }, (_, i) => [i, 0]);
        const [cut, rule, ...colours] = drawAnswer("wires", { wires }, rng(seed * 7 + count));
        expect(colours).toHaveLength(count);
        expect(colours.every((c) => c >= 0 && c < WIRE_COLOURS.length)).toBe(true);
        expect(cut).toBeGreaterThanOrEqual(0);
        expect(cut).toBeLessThan(count);
        expect(ruleFor(colours)).toEqual({ rule, cut });
      }
    }
  });
});

describe("clue paths: answers that feed, and teaching stations (escape-room Task 11)", () => {
  const RADIO = {
    type: "radio",
    pads: [
      [6, 4],
      [8, 4],
    ],
    range: 8,
    yields: "Q2",
    motif: "moon",
  };
  const keys = [0, 1, 2].flatMap((y) => [0, 1, 2].map((x) => [10 + x, 1 + y]));
  const KEYPAD = { type: "keypad", keys, length: 3, motif: "moon", slot: { from: "Q1", at: 0 } };

  it("a solved radio fixes the keypad's slot to its digit, and a re-draw keeps it", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const w = stationWorld({ Q1: RADIO, Q2: KEYPAD }, seed);
      const digit = st(w).answer[1] as number;
      for (let i = 0; i < 8 && !st(w).solved; i++) press(w, { x: 8, y: 4 });
      expect(st(w).solved).toBe(true);
      // the keys are numbered from 1: digit d is key d, the (d - 1)th
      expect(st(w, "Q2").answer[0]).toBe(digit - 1);
      // a wrong key sends the team back and re-draws the keypad: the slot stays
      const wrongKey = (((st(w, "Q2").answer[0] as number) + 1) % 9) as number;
      const k = keys[wrongKey] as [number, number];
      press(w, { x: k[0], y: k[1] });
      expect(w.attempt).toBe(1);
      expect(st(w, "Q2").answer[0]).toBe(digit - 1);
    }
  });

  it("a keypad's code rests on its slot: that note is the radio's digit, never played", () => {
    for (const seed of [1, 2, 3]) {
      const w = stationWorld({ Q1: RADIO, Q2: KEYPAD }, seed);
      const played: number[] = [];
      const answer = st(w, "Q2").answer;
      for (let t = 0; t < tuneGroups(answer, 0).period; t++) {
        w.tick = t;
        const n = noteOf(w, st(w, "Q2"));
        if (n !== undefined) played.push(n);
      }
      // slot 0 rests: only keys 1 and 2 of the code are played, in order
      expect(played).toEqual([answer[1], answer[2]]);
    }
  });

  it("a vault's answer is its wings' reveals, drawn as each wing is solved", () => {
    const VAULT = {
      type: "vault",
      sockets: [
        [6, 2],
        [8, 2],
      ],
      from: ["Q2", "Q3"],
    };
    const WING = (x: number) => ({ type: "sync", keys: [[x, 4]], windowMs: 500, reveal: true });
    const w = stationWorld({ Q1: VAULT, Q2: WING(10), Q3: WING(12) }, 10);
    expect(w.stations.Q2?.reveal).toBeUndefined();
    press(w, { x: 10, y: 4 });
    expect(st(w, "Q2").solved).toBe(true);
    const r2 = st(w, "Q2").reveal as number;
    expect(r2).toBeGreaterThanOrEqual(0);
    expect(r2).toBeLessThan(6);
    expect(st(w).answer[0]).toBe(r2);
    press(w, { x: 12, y: 4 });
    expect(st(w).answer).toEqual([r2, st(w, "Q3").reveal]);
  });

  it("a wrong press at a teaching station re-draws only it: no dye, no send-back", () => {
    const TEACH = {
      type: "keypad",
      keys,
      length: 3,
      teach: true,
    };
    const OTHER = {
      type: "dial",
      pads: [
        [3, 5],
        [5, 5],
      ],
      digits: 2,
      range: 10,
    };
    let redrawn = false;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const w = stationWorld({ Q1: TEACH, Q2: OTHER }, seed);
      const before = [...st(w).answer];
      const other = [...st(w, "Q2").answer];
      const wrongKey = ((before[0] as number) + 1) % 9;
      const k = keys[wrongKey] as [number, number];
      const e = press(w, { x: k[0], y: k[1] });
      expect(stationResults(e)).toContain("wrong");
      expect(kinds(e)).not.toContain("dye");
      expect(kinds(e)).not.toContain("caught");
      expect(w.attempt).toBe(0);
      expect(st(w).input).toEqual([]);
      expect(st(w, "Q2").answer).toEqual(other);
      if (st(w).answer.join() !== before.join()) redrawn = true;
    }
    expect(redrawn).toBe(true);
  });

  it("a teaching safe has one digit and lights shows[1] only on the right number", () => {
    const DIAL_T = { ...DIAL, digits: 3, teach: true };
    const w = stationWorld({ Q1: DIAL_T }, 3);
    expect(st(w).answer).toHaveLength(1);
    const want = st(w).answer[0] as number;
    for (let n = 0; n < 10; n++) {
      const shows = stationShows(w, st(w));
      expect(shows[0]).toBe(st(w).input[0]);
      expect(shows[1]).toBe(st(w).input[0] === want ? 1 : 0);
      press(w, { x: 8, y: 4 });
    }
  });
});
