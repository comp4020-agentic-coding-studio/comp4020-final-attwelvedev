import { describe, expect, it } from "vitest";
import type { ChannelMessage, Outgoing } from "../channels.ts";
import { type RoleView, viewFor } from "../perception.ts";
import { brailleCells } from "../sim/braille.ts";
import { TUNE_MAX_TICKS, tuneGroups } from "../sim/chimes.ts";
import { NUMBER_RIDDLES, toggled, WIRE_RULES } from "../sim/stations.ts";
import { step } from "../sim/step.ts";
import { place, roomWith } from "../sim/testing.ts";
import { createWorld, TICK_MS } from "../sim/world.ts";
import {
  beliefFrom,
  bellsStep,
  COUNT_TICKS,
  countStep,
  DECODERS,
  dialStep,
  earStep,
  emptyBelief,
  emptyEar,
  keypadStep,
  linkedFrom,
  radioPad,
  radioToTell,
  readBraille,
  readNumber,
  type StationBelief,
  syncGo,
  tuneOf,
  vaultStep,
} from "./decode.ts";

// A bot's belief about one station (clues FR5): only what its own view shows and what teammates
// send, in the two forms bots use (P3): an `x` mark on a part's tile, or a one-digit text.
const room = roomWith(["#########", "#1.Q....#", "#2......#", "#3......#", "#########"], {
  Q1: {
    type: "wires",
    wires: [
      [4, 1],
      [5, 1],
      [6, 1],
    ],
  },
});
const o = room.objects.find((x) => x.id === "Q1");
if (!o) throw new Error("no Q1");

const view = (solved: boolean, shows: number[] = []): RoleView => ({
  tick: 1,
  ack: 0,
  room: "t",
  role: "deaf",
  full: false,
  you: { seat: 1, motion: { moving: false, blocked: false }, pos: { x: 2.5, y: 2.5 } },
  entities: [
    {
      id: "Q1",
      kind: "station",
      pos: { x: 3.5, y: 1.5 },
      station: { type: "wires", shows, solved, parts: [] },
    },
  ],
  sounds: [],
  status: "playing",
  elapsedMs: 50,
  loot: 0,
  alarm: false,
  dark: false,
  gear: null,
});
const msg = (m: Outgoing): ChannelMessage =>
  ({ ...m, from: { seat: 2, role: "mute", nickname: "Cy" }, sentAt: 0 }) as ChannelMessage;

describe("beliefFrom", () => {
  it("keeps solved once seen, even when the station drops out of sight", () => {
    const seen = beliefFrom(view(true), [], o, emptyBelief());
    expect(seen.solved).toBe(true);
    const later = beliefFrom({ ...view(false), entities: [] }, [], o, seen);
    expect(later.solved).toBe(true);
  });

  it("takes what the station shows in sight", () => {
    expect(beliefFrom(view(false, [2, 0, 5]), [], o, emptyBelief()).shows).toEqual([2, 0, 5]);
  });

  it("puts a teammate's x mark on one of its part tiles into the belief, and no other mark", () => {
    const b = beliefFrom(
      view(false),
      [
        msg({ method: "mark", id: "x", at: { x: 5.5, y: 1.5 } }),
        msg({ method: "mark", id: "bang", at: { x: 6.5, y: 1.5 } }),
        msg({ method: "mark", id: "x", at: { x: 2.5, y: 3.5 } }),
      ],
      o,
      emptyBelief(),
    );
    expect(b.marked).toEqual([{ x: 5, y: 1 }]);
  });

  it("reads a one-digit text as a number and ignores any other text", () => {
    expect(readNumber("5")).toBe(5);
    expect(readNumber("five")).toBeNull();
    expect(readNumber("55")).toBeNull();
    const b = beliefFrom(
      view(false),
      [msg({ method: "text", text: "five" }), msg({ method: "text", text: "5" })],
      o,
      emptyBelief(),
    );
    expect(b.numbers).toEqual([5]);
  });
});

describe("DECODERS", () => {
  it("has the safe's from 05, the wires' and keypad's from 06, radio's and switches' from 07, the music box's from 09, the vault's and sync lock's from 10", () => {
    expect(Object.keys(DECODERS)).toEqual([
      "dial",
      "wires",
      "keypad",
      "radio",
      "switches",
      "bells",
      "vault",
      "sync",
    ]);
  });
});

// The safe (escape-room Task 16): its number is read from what a role really perceives, through
// `viewFor` on a seeded world: a teaching safe's lamp for the sighted turner, a real safe's "stop"
// from Can't see holding the stethoscope at the back.
describe("the dial decoder", () => {
  const GRID = ["############", "#1...Q.....#", "#2.........#", "#3.........#", "############"];
  const dialAt = (extra: Record<string, unknown>) =>
    roomWith(GRID, {
      Q1: {
        type: "dial",
        pads: [
          [4, 1],
          [6, 1],
        ],
        back: [5, 3],
        range: 10,
        ...extra,
      },
      g1: { item: "stethoscope" },
    });
  const objectOf = (room: ReturnType<typeof roomWith>) => {
    const q = room.objects.find((x) => x.id === "Q1");
    if (!q) throw new Error("no Q1");
    return q;
  };
  const decode = (
    room: ReturnType<typeof roomWith>,
    view: RoleView,
    inbox: ChannelMessage[],
    prior = emptyBelief(),
  ) => {
    const q = objectOf(room);
    const b = beliefFrom(view, inbox, q, prior);
    DECODERS.dial?.(view, inbox, b, q, view.tick);
    return b;
  };
  const stop: ChannelMessage = {
    method: "callout",
    callout: "stop",
    from: { seat: 0, role: "blind", nickname: "Ana" },
    sentAt: 0,
  };

  it("a teaching safe: the sighted turner reads the lamp, and its next press is the face", () => {
    const room = dialAt({ teach: true });
    const world = createWorld(room, 3);
    const s = world.stations.Q1;
    if (!s) throw new Error("no Q1");
    place(world, 1, { x: 6, y: 2 });
    s.input[0] = ((s.answer[0] as number) + 9) % 10; // one notch short: the lamp is off
    const off = decode(room, viewFor(world, 1, "deaf", false), []);
    expect(off.answer).toEqual([null]);
    expect(dialStep(objectOf(room), off)).toEqual({ x: 6, y: 1 }); // turn on
    s.input[0] = s.answer[0] as number;
    const on = decode(room, viewFor(world, 1, "deaf", false), [], off);
    expect(on.answer).toEqual([s.answer[0]]);
    expect(dialStep(objectOf(room), on)).toEqual({ x: 5, y: 1 }); // enter it
  });

  it("a real safe: Can't see's stop while the dial is on the number is the digit, and the face is next", () => {
    const room = dialAt({ digits: 2 });
    const world = createWorld(room, 3);
    const s = world.stations.Q1;
    if (!s) throw new Error("no Q1");
    place(world, 2, { x: 6, y: 2 });
    s.input = [s.answer[0] as number];
    const before = decode(room, viewFor(world, 2, "mute", false), []);
    expect(before.answer).toEqual([null]); // the face shows no lamp on a real safe
    expect(dialStep(objectOf(room), before)).toEqual({ x: 6, y: 1 });
    const told = decode(room, viewFor(world, 2, "mute", false), [stop], before);
    expect(told.answer).toEqual([s.answer[0]]);
    expect(dialStep(objectOf(room), told)).toEqual({ x: 5, y: 1 });
    // the first digit entered shows on the face; the second is searched for afresh
    s.input = [s.answer[0] as number, 0];
    const next = decode(room, viewFor(world, 2, "mute", false), [], told);
    expect(next.answer).toEqual([s.answer[0], null]);
    expect(dialStep(objectOf(room), next)).toEqual({ x: 6, y: 1 });
  });

  it("with the clue withheld (no word from the back), it never wants the face pressed", () => {
    const room = dialAt({ digits: 2 });
    const world = createWorld(room, 3);
    const s = world.stations.Q1;
    if (!s) throw new Error("no Q1");
    place(world, 2, { x: 6, y: 2 });
    let b = emptyBelief();
    for (let v = 0; v < 10; v++) {
      s.input = [v];
      b = decode(room, viewFor(world, 2, "mute", false), [], b);
      expect(dialStep(objectOf(room), b)).toEqual({ x: 6, y: 1 });
    }
    // a "stop" from anyone but Can't see (a guide steering) is not the tumbler's word
    const steer = { ...stop, from: { seat: 1, role: "deaf", nickname: "Bo" } } as ChannelMessage;
    b = decode(room, viewFor(world, 2, "mute", false), [steer], b);
    expect(b.answer).toEqual([null]);
  });
});

// Wires and their plaque, and the keypad (escape-room Task 18): from views a role really gets.
describe("the wires decoder", () => {
  // the plaque S1 at (2,1); a wall at x=8 hides the second panel's plaque from its wires
  const GRID = ["############", "#1S.Q.Q.#..#", "#2......#S.#", "#3......#..#", "############"];
  const room = roomWith(GRID, {
    Q1: {
      type: "wires",
      wires: [
        [4, 2],
        [5, 2],
        [6, 2],
      ],
      plaque: "S1",
    },
    Q2: {
      type: "wires",
      wires: [
        [4, 3],
        [5, 3],
        [6, 3],
      ],
      plaque: "S2",
    },
  });
  const objectOf = (id: string) => {
    const q = room.objects.find((x) => x.id === id);
    if (!q) throw new Error(`no ${id}`);
    return q;
  };
  const decode = (id: string, view: RoleView, prior = emptyBelief()) => {
    const b = beliefFrom(view, [], objectOf(id), prior);
    DECODERS.wires?.(view, [], b, objectOf(id), view.tick);
    return b;
  };

  it("reads the plaque's rule, applies it to the colours it sees, and cuts that wire", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const world = createWorld(room, seed);
      const s = world.stations.Q1;
      if (!s) throw new Error("no Q1");
      place(world, 1, { x: 3, y: 2 });
      const b = decode("Q1", viewFor(world, 1, "deaf", false));
      expect(b.rule).toBe(s.answer[1]);
      expect(b.answer).toEqual([s.answer[0]]);
    }
  });

  it("reads a riddle as its rule and a number riddle as its wire", () => {
    const world = createWorld(room, 3);
    place(world, 1, { x: 3, y: 2 });
    const s = world.stations.Q1;
    if (!s) throw new Error("no Q1");
    const view = viewFor(world, 1, "deaf", false);
    const at = (text: string) => ({
      ...view,
      entities: view.entities.map((e) => (e.id === "S1" ? { ...e, text } : e)),
    });
    const rule = s.answer[1] as number;
    for (const riddle of WIRE_RULES[rule]?.riddles ?? []) {
      const b = decode("Q1", at(riddle));
      expect(b.rule).toBe(rule);
      expect(b.answer).toEqual([s.answer[0]]);
    }
    const b = decode("Q1", at(NUMBER_RIDDLES[0]?.(3) ?? ""));
    expect(b.answer).toEqual([2]);
  });

  it("with the plaque out of sight, it never cuts a wire", () => {
    const world = createWorld(room, 3);
    place(world, 2, { x: 3, y: 3 });
    const view = viewFor(world, 2, "mute", false);
    expect(view.entities.some((e) => e.id === "S2")).toBe(false);
    expect(view.entities.find((e) => e.id === "Q2")?.station?.shows.length).toBe(3);
    const b = decode("Q2", view);
    expect(b.answer).toEqual([null]);
  });

  it("forgets the rule once the wires change colour (a panel drawn again)", () => {
    const world = createWorld(room, 3);
    place(world, 1, { x: 3, y: 2 });
    const read = decode("Q1", viewFor(world, 1, "deaf", false));
    const s = world.stations.Q1;
    if (!s) throw new Error("no Q1");
    s.answer = [0, 5, ...s.answer.slice(2).map((c) => (c + 1) % 6)];
    // the plaque now behind the bot's back is still read: shows changed, so the old rule goes
    const hidden = { ...viewFor(world, 1, "deaf", false) };
    hidden.entities = hidden.entities.filter((e) => e.id !== "S1");
    const b = decode("Q1", hidden, read);
    expect(b.rule).toBeNull();
    expect(b.answer).toEqual([null]);
  });
});

// A numbered panel (room 7): the ink is the wire to cut, one digit; the colours decide nothing.
describe("the wires decoder, a numbered panel", () => {
  const GRID = ["##########", "#1S.Q....#", "#2.......#", "#3.......#", "##########"];
  const room = roomWith(GRID, {
    Q1: {
      type: "wires",
      wires: [
        [4, 2],
        [5, 2],
        [6, 2],
      ],
      plaque: "S1",
      numbered: true,
    },
  });
  const q = room.objects.find((x) => x.id === "Q1");
  if (!q) throw new Error("no Q1");
  const decode = (view: RoleView, prior = emptyBelief()) => {
    const b = beliefFrom(view, [], q, prior);
    DECODERS.wires?.(view, [], b, q, view.tick);
    return b;
  };

  it("cuts the wire the ink numbers, whatever the colours", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const world = createWorld(room, seed);
      const s = world.stations.Q1;
      if (!s) throw new Error("no Q1");
      place(world, 1, { x: 3, y: 2 });
      const view = viewFor(world, 1, "deaf", false);
      expect(view.entities.find((e) => e.id === "S1")?.text).toBe(
        String((s.answer[0] as number) + 1),
      );
      const b = decode(view);
      expect(b.answer).toEqual([s.answer[0]]);
    }
  });

  it("leaves the answer unset with no ink in sight", () => {
    const world = createWorld(room, 2);
    place(world, 1, { x: 3, y: 2 });
    const view = { ...viewFor(world, 1, "deaf", false) };
    view.entities = view.entities.filter((e) => e.id !== "S1");
    expect(decode(view).answer).toEqual([null]);
  });

  it("forgets a digit read once the panel is drawn again", () => {
    const world = createWorld(room, 3);
    place(world, 1, { x: 3, y: 2 });
    const read = decode(viewFor(world, 1, "deaf", false));
    const s = world.stations.Q1;
    if (!s) throw new Error("no Q1");
    s.answer = [((s.answer[0] as number) + 1) % 3, 0, ...s.answer.slice(2).map((c) => (c + 1) % 6)];
    const hidden = { ...viewFor(world, 1, "deaf", false) };
    hidden.entities = hidden.entities.filter((e) => e.id !== "S1");
    const b = decode(hidden, read);
    expect(b.answer).toEqual([null]);
  });
});

// How long a bot must listen to be sure of a code: it hears one tune, a second complete one, and the
// pause that ends it, so three periods of the longest tune a code can have (nine-chime groups: the
// worst case is 4 x 9 chimes). The old fixed 200 ticks was three tunes of the old 60-tick schedule.
const LISTEN_TICKS = 3 * TUNE_MAX_TICKS;

describe("tuneOf: a tune is groups of chimes (Task 36)", () => {
  // one entry per group, at its first tick, n = the note: a group of n + 1 chimes 3 ticks apart
  const play = (code: number[], from: number, rest: number | null = null) => {
    const heard: { tick: number; n: number }[] = [];
    for (const g of tuneGroups(code, rest).groups) heard.push({ tick: from + g.at, n: g.note });
    return { heard, period: tuneGroups(code, rest).period };
  };

  it("takes a tune heard twice running, whatever the group lengths", () => {
    for (const code of [
      [0, 0, 0],
      [8, 0, 8, 0],
      [3, 1, 4],
    ]) {
      const a = play(code, 0);
      const b = play(code, a.period);
      const heard = [...a.heard, ...b.heard];
      const end = b.heard.at(-1)?.tick ?? 0;
      expect(tuneOf(heard, end + 200), code.join()).toEqual(code);
    }
  });

  it("does not take a tune still playing, or heard only once", () => {
    const a = play([2, 5, 1], 0);
    const b = play([2, 5, 1], a.period);
    expect(tuneOf(a.heard, (a.heard.at(-1)?.tick ?? 0) + 200)).toBeNull();
    // the second is still playing: its last group's chimes have not finished
    const mid = (b.heard.at(-1)?.tick ?? 0) + 2;
    expect(tuneOf([...a.heard, ...b.heard], mid)).toBeNull();
  });

  it("keeps a rest inside the tune, and a pause between tunes apart", () => {
    const a = play([4, 6, 2], 0, 1);
    const b = play([4, 6, 2], a.period, 1);
    const end = b.heard.at(-1)?.tick ?? 0;
    expect(tuneOf([...a.heard, ...b.heard], end + 200)).toEqual([4, 2]);
  });

  it("splits two different tunes, so the last two must match", () => {
    const a = play([1, 2, 3], 0);
    const b = play([3, 2, 1], a.period);
    const end = b.heard.at(-1)?.tick ?? 0;
    expect(tuneOf([...a.heard, ...b.heard], end + 200)).toBeNull();
  });
});

describe("the keypad decoder", () => {
  // the clue c1 at (2,2); a wall at x=8 keeps the sound from the far room
  const GRID = [
    "#############",
    "#1..Q...#...#",
    "#2c.....#...#",
    "#3......#...#",
    "#############",
  ];
  const keys = [0, 1, 2].flatMap((y) => [0, 1, 2].map((x) => [4 + x, 1 + y]));
  const room = roomWith(GRID, {
    Q1: { type: "keypad", keys, clue: "c1", length: 3 },
    c1: {},
  });
  const q = room.objects.find((x) => x.id === "Q1");
  if (!q) throw new Error("no Q1");
  const listen = (seat: 0 | 1 | 2, role: "blind" | "mute", at: { x: number; y: number }) => {
    const world = createWorld(room, 5);
    place(world, seat, at);
    let b = emptyBelief();
    for (let t = 0; t < LISTEN_TICKS; t++) {
      step(world, {}, TICK_MS);
      const view = viewFor(world, seat, role, false);
      b = beliefFrom(view, [], q, b);
      DECODERS.keypad?.(view, [], b, q, view.tick);
    }
    return { world, b };
  };

  it("a hearing bot near the clue hears the code twice and presses its keys in order", () => {
    const { world, b } = listen(2, "mute", { x: 3, y: 2 });
    const s = world.stations.Q1;
    if (!s) throw new Error("no Q1");
    expect(b.answer).toEqual(s.answer);
    expect(keypadStep(q, b)).toEqual({
      x: 4 + ((s.answer[0] as number) % 3),
      y: 1 + Math.floor((s.answer[0] as number) / 3),
    });
    s.input = [s.answer[0] as number];
    const pressed = beliefFrom(viewFor(world, 2, "mute", false), [], q, b);
    const k = s.answer[1] as number;
    expect(keypadStep(q, pressed)).toEqual({ x: 4 + (k % 3), y: 1 + Math.floor(k / 3) });
  });

  it("reads a vent's full count: a code of the highest keys (n up to 9) is heard whole (Task 41)", () => {
    const world = createWorld(room, 5);
    const st = world.stations.Q1;
    if (!st) throw new Error("no Q1");
    st.answer = [8, 7, 6];
    place(world, 2, { x: 3, y: 2 });
    let b = emptyBelief();
    for (let t = 0; t < LISTEN_TICKS; t++) {
      step(world, {}, TICK_MS);
      const view = viewFor(world, 2, "mute", false);
      b = beliefFrom(view, [], q, b);
      DECODERS.keypad?.(view, [], b, q, view.tick);
    }
    expect(b.heard.some((h) => h.n === 8)).toBe(true);
    expect(b.answer).toEqual([8, 7, 6]);
  });

  it("a tune with a rest marker still yields the code, null at the slot (FR14)", () => {
    const radioRoom = roomWith(
      ["#############", "#1..Q...#.Q.#", "#2c.....#...#", "#3......#...#", "#############"],
      {
        Q1: { type: "keypad", keys, clue: "c1", length: 3, slot: { from: "Q2", at: 1 } },
        c1: {},
        Q2: {
          type: "radio",
          pads: [
            [9, 2],
            [11, 2],
          ],
          range: 6,
          yields: "Q1",
        },
      },
    );
    const q1 = radioRoom.objects.find((x) => x.id === "Q1");
    if (!q1) throw new Error("no Q1");
    const world = createWorld(radioRoom, 5);
    place(world, 2, { x: 3, y: 2 });
    let b = emptyBelief();
    let rests = 0;
    for (let t = 0; t < LISTEN_TICKS; t++) {
      step(world, {}, TICK_MS);
      const view = viewFor(world, 2, "mute", false);
      rests += view.sounds.filter((x) => x.kind === "rest").length;
      b = beliefFrom(view, [], q1, b);
      DECODERS.keypad?.(view, [], b, q1, view.tick);
    }
    expect(rests).toBeGreaterThan(0);
    const answer = world.stations.Q1?.answer ?? [];
    expect(b.answer).toEqual([answer[0], null, answer[2]]);
  });

  it("out of earshot of the clue, it never presses a key", () => {
    const { b } = listen(2, "mute", { x: 10, y: 2 });
    expect(b.answer).toEqual([]);
    expect(keypadStep(q, b)).toBeNull();
  });
});

// Radio and switches (escape-room Task 20): from views a role really gets, through `viewFor`.
describe("the radio decoder", () => {
  // the radio Q1 at (4,1), its pads either side; a keypad Q2 behind a wall at x=9 shares its motif
  const GRID = [
    "###############",
    "#1.Q.....#....#",
    "#2.......#..Q.#",
    "#3.......#....#",
    "###############",
  ];
  const keys = [0, 1, 2].flatMap((y) => [0, 1, 2].map((x) => [10 + x, 1 + y]));
  const room = roomWith(GRID, {
    Q1: {
      type: "radio",
      pads: [
        [2, 2],
        [4, 2],
      ],
      range: 6,
      yields: "Q2",
      motif: "moon",
    },
    Q2: { type: "keypad", keys, length: 3, motif: "moon", slot: { from: "Q1", at: 0 } },
  });
  const q = (id: string) => {
    const x = room.objects.find((o) => o.id === id);
    if (!x) throw new Error(`no ${id}`);
    return x;
  };
  // seat `seat` as `role` at `at` watches the tuned radio for a while
  const watch = (role: "deaf" | "mute", at: { x: number; y: number }, ticks = 90) => {
    const world = createWorld(room, 4);
    const s = world.stations.Q1;
    if (!s) throw new Error("no Q1");
    s.input = [s.answer[0] as number];
    s.solved = true;
    place(world, 1, at);
    const stations: Record<string, StationBelief> = { Q1: emptyBelief(), Q2: emptyBelief() };
    for (let t = 0; t < ticks; t++) {
      step(world, {}, TICK_MS);
      const view = viewFor(world, 1, role, false);
      for (const id of ["Q1", "Q2"]) {
        const b = beliefFrom(view, [], q(id), stations[id] as StationBelief);
        DECODERS[id === "Q1" ? "radio" : "keypad"]?.(view, [], b, q(id), view.tick);
        stations[id] = b;
      }
      linkedFrom(room, view, stations);
    }
    return { world, stations };
  };

  it("a sighted bot reads the digit off the face as it pips, and tells it once", () => {
    const { world, stations } = watch("deaf", { x: 5, y: 2 });
    const digit = world.stations.Q1?.answer[1];
    const b = stations.Q1 as StationBelief;
    expect(b.answer).toEqual([digit]);
    expect(radioToTell(q("Q1"), b)).toBe(digit);
    b.told.add(0);
    expect(radioToTell(q("Q1"), b)).toBeNull();
  });

  it("a hearing bot counts the pips from the radio", () => {
    const { world, stations } = watch("mute", { x: 6, y: 3 });
    expect(stations.Q1?.answer).toEqual([world.stations.Q1?.answer[1]]);
  });

  it("the keypad slot with the same motif takes the digit; without it, the slot is never pressed", () => {
    const heard = emptyBelief();
    heard.answer = [null, 4, 7];
    DECODERS.keypad?.({ ...view(false), sounds: [] }, [], heard, q("Q2"), 1);
    expect(keypadStep(q("Q2"), heard)).toBeNull();
    const told = beliefFrom(view(false), [msg({ method: "text", text: "3" })], q("Q2"), heard);
    DECODERS.keypad?.({ ...view(false), sounds: [] }, [], told, q("Q2"), 1);
    expect(told.answer).toEqual([2, 4, 7]);
    expect(keypadStep(q("Q2"), told)).toEqual({ x: 12, y: 1 });
    // a bot that worked the digit out itself fills the slot from the radio with the same motif
    const { world, stations } = watch("deaf", { x: 5, y: 2 });
    const k = stations.Q2 as StationBelief;
    expect(k.fed).toBe(world.stations.Q1?.answer[1]);
  });

  it("out of sight and earshot of the radio, it never learns a digit", () => {
    const { stations } = watch("mute", { x: 12, y: 3 });
    expect(stations.Q1?.answer).toEqual([]);
    expect(stations.Q2?.fed).toBeNull();
  });
});

describe("the switches decoder", () => {
  // buttons at (4..6,1..2), lamps behind glass at (11..13,1..2), the card T1 at (2,3)
  const GRID = [
    "################",
    "#1.......=.....#",
    "#2.......=.....#",
    "#3.....Q.=.....#",
    "####.###########",
    "####t###########",
    "################",
  ];
  const buttons = [1, 2].flatMap((y) => [4, 5, 6].map((x) => [x, y]));
  const lamps = [1, 2].flatMap((y) => [11, 12, 13].map((x) => [x, y]));
  const room = roomWith(GRID, {
    Q1: { type: "switches", buttons, lamps, cols: 3 },
    T1: { of: "Q1" },
  });
  const q = room.objects.find((o) => o.id === "Q1");
  if (!q) throw new Error("no Q1");

  it("reads the card, sees the lamps, and presses the buttons that match them", () => {
    for (const seed of [1, 2, 3, 4]) {
      const world = createWorld(room, seed);
      const s = world.stations.Q1;
      if (!s) throw new Error("no Q1");
      place(world, 1, { x: 4, y: 3 }); // the card below and, through the glass, the lamps
      const stations: Record<string, StationBelief> = { Q1: emptyBelief() };
      for (let n = 0; n < 10 && !s.solved; n++) {
        const view = viewFor(world, 1, "deaf", false);
        const b = beliefFrom(view, [], q, stations.Q1 as StationBelief);
        linkedFrom(room, view, { Q1: b });
        DECODERS.switches?.(view, [], b, q, view.tick);
        stations.Q1 = b;
        const i = b.answer[0];
        expect(i).not.toBeNull();
        s.input = toggled(s.input, i as number, 3);
        if (s.input.join() === s.answer.join()) s.solved = true;
        step(world, {}, TICK_MS);
      }
      expect(s.solved).toBe(true);
    }
  });

  it("with the card out of sight, it never presses a button", () => {
    const world = createWorld(room, 2);
    place(world, 1, { x: 8, y: 1 });
    const view = viewFor(world, 1, "deaf", false);
    expect(view.entities.some((e) => e.kind === "card")).toBe(false);
    const b = beliefFrom(view, [], q, emptyBelief());
    linkedFrom(room, view, { Q1: b });
    DECODERS.switches?.(view, [], b, q, view.tick);
    expect(b.shows.length).toBe(6);
    expect(b.answer).toEqual([null]);
  });
});

// Gear (escape-room Task 22): no decoder of its own. A wire panel's plaque in UV ink reads through
// the wires decoder once a torch lights it; switches' lamps in a dark zone are read by a sighted
// bot wearing the goggles. Both only from what `viewFor` sends.
describe("gear: a UV-ink plaque and lamps in the dark", () => {
  it("the wires decoder reads a plaque in UV ink while the bot holds the torch, and never without it", () => {
    // wires at (4..6,1), the ink plaque u1 on the floor at (2,3), round no corner
    const GRID = ["#########", "#1..Q...#", "#2......#", "#3u....g#", "#########"];
    const room = roomWith(GRID, {
      Q1: {
        type: "wires",
        wires: [
          [4, 1],
          [5, 1],
          [6, 1],
        ],
        plaque: "u1",
      },
      g1: { item: "uv" },
      u1: { text: "" },
    });
    const q = room.objects.find((x) => x.id === "Q1");
    if (!q) throw new Error("no Q1");
    for (const seed of [1, 2, 3, 4]) {
      const world = createWorld(room, seed);
      const s = world.stations.Q1;
      const torch = world.gear.find((g) => g.id === "g1");
      if (!s || !torch) throw new Error("no Q1 or g1");
      place(world, 1, { x: 3, y: 2 });
      const dark = viewFor(world, 1, "deaf", false);
      const without = beliefFrom(dark, [], q, emptyBelief());
      DECODERS.wires?.(dark, [], without, q, dark.tick);
      expect(without.answer).toEqual([null]);
      Object.assign(torch, { heldBy: 1, at: null });
      const lit = viewFor(world, 1, "deaf", false);
      const b = beliefFrom(lit, [], q, without);
      DECODERS.wires?.(lit, [], b, q, lit.tick);
      expect(b.answer).toEqual([s.answer[0]]);
    }
  });

  it("the switches decoder reads lamps in a dark zone through the goggles, and never without them", () => {
    // buttons at (4..6,1..2), the lamps at (11..13,1..2) in a dark zone, the card T1 at (2,3)
    const GRID = [
      "################",
      "#1.............#",
      "#2.............#",
      "#3t....Qg......#",
      "################",
    ];
    const buttons = [1, 2].flatMap((y) => [4, 5, 6].map((x) => [x, y]));
    const lamps = [1, 2].flatMap((y) => [11, 12, 13].map((x) => [x, y]));
    const room = roomWith(
      GRID,
      {
        Q1: { type: "switches", buttons, lamps, cols: 3 },
        T1: { of: "Q1" },
        g1: { item: "goggles" },
      },
      { flips: [{ kind: "dark", zone: [10, 1, 14, 3] }] },
    );
    const q = room.objects.find((x) => x.id === "Q1");
    if (!q) throw new Error("no Q1");
    for (const seed of [1, 2, 3, 4]) {
      const world = createWorld(room, seed);
      const s = world.stations.Q1;
      const goggles = world.gear.find((g) => g.id === "g1");
      if (!s || !goggles) throw new Error("no Q1 or g1");
      place(world, 1, { x: 3, y: 2 }); // the card and, across the room, the dark lamps
      const read = () => {
        const view = viewFor(world, 1, "deaf", false);
        const b = beliefFrom(view, [], q, emptyBelief());
        linkedFrom(room, view, { Q1: b });
        DECODERS.switches?.(view, [], b, q, view.tick);
        return b;
      };
      const blind = read();
      expect(blind.card).not.toBeNull();
      expect(blind.answer).toEqual([null]);
      Object.assign(goggles, { heldBy: 1, at: null });
      for (let n = 0; n < 10 && !s.solved; n++) {
        const i = read().answer[0];
        expect(i).not.toBeNull();
        s.input = toggled(s.input, i as number, 3);
        if (s.input.join() === s.answer.join()) s.solved = true;
        step(world, {}, TICK_MS);
      }
      expect(s.solved).toBe(true);
    }
  });
});

// Music box and earpiece (escape-room Task 24): from views a role really gets, through `viewFor`.
// A music box shows no lit bell as its tune plays (its `shows` is [playing?, ...struck]): which
// bell a note belongs to is heard, so the tune is learnt by ear at the tune box.
describe("the music box decoder", () => {
  // bells at (6..9,1); the tune box at (3,3); glass at x=5 keeps the tune from the bells
  const GRID = ["############", "#1..#......#", "#2..=.....Q#", "#3..=......#", "############"];
  const room = roomWith(GRID, {
    Q1: {
      type: "bells",
      bells: [
        [6, 1],
        [7, 1],
        [8, 1],
        [9, 1],
      ],
      tune: [3, 3],
    },
  });
  const q = room.objects.find((x) => x.id === "Q1");
  if (!q) throw new Error("no Q1");
  const listen = (role: "blind" | "mute" | "deaf", at: { x: number; y: number }, seed = 3) => {
    const world = createWorld(room, seed);
    place(world, 1, at);
    let b = emptyBelief();
    for (let t = 0; t < LISTEN_TICKS; t++) {
      step(world, {}, TICK_MS);
      const view = viewFor(world, 1, role, false);
      b = beliefFrom(view, [], q, b);
      DECODERS.bells?.(view, [], b, q, view.tick);
    }
    return { world, b };
  };

  it("a hearing bot at the tune box learns the tune and strikes its bells in order", () => {
    for (const seed of [1, 2, 3, 4]) {
      const { world, b } = listen("mute", { x: 2, y: 3 }, seed);
      const s = world.stations.Q1;
      if (!s) throw new Error("no Q1");
      expect(b.answer).toEqual(s.answer);
      expect(bellsStep(q, b)).toEqual({ x: 6 + (s.answer[0] as number), y: 1 });
      s.input = [s.answer[0] as number];
      const struck = beliefFrom(viewFor(world, 1, "mute", false), [], q, b);
      expect(bellsStep(q, struck)).toEqual({ x: 6 + (s.answer[1] as number), y: 1 });
    }
  });

  it("at the bells, behind the glass from the tune, it never strikes a bell", () => {
    const { b } = listen("mute", { x: 7, y: 2 });
    expect(b.answer).toEqual([]);
    expect(bellsStep(q, b)).toBeNull();
  });

  it("Can't hear, at the tune box, sees it play but never learns the tune", () => {
    const { b } = listen("deaf", { x: 2, y: 3 });
    expect(b.answer).toEqual([]);
    expect(bellsStep(q, b)).toBeNull();
  });

  it("a striker with no tune of its own strikes the bells marked x, in the order they came", () => {
    const b = beliefFrom(
      view(false),
      [
        msg({ method: "mark", id: "x", at: { x: 8.5, y: 1.5 } }),
        msg({ method: "mark", id: "x", at: { x: 8.5, y: 1.5 } }),
        msg({ method: "mark", id: "x", at: { x: 6.5, y: 1.5 } }),
      ],
      q,
      emptyBelief(),
    );
    expect(bellsStep(q, b)).toEqual({ x: 8, y: 1 });
    b.used = 2;
    expect(bellsStep(q, b)).toEqual({ x: 6, y: 1 });
    b.used = 3;
    expect(bellsStep(q, b)).toBeNull();
  });
});

describe("the earpiece", () => {
  it("a keypad whose clue is the earpiece takes its code from the digits texted to it, key n as n", () => {
    const keys = [0, 1, 2].flatMap((y) => [0, 1, 2].map((x) => [4 + x, 1 + y]));
    const room = roomWith(["#########", "#1..Q...#", "#2.g....#", "#3......#", "#########"], {
      Q1: { type: "keypad", keys, clue: "g1", length: 3 },
      g1: { item: "earpiece" },
    });
    const q = room.objects.find((x) => x.id === "Q1");
    if (!q) throw new Error("no Q1");
    const none = emptyBelief();
    DECODERS.keypad?.(view(false), [], none, q, 1);
    expect(keypadStep(q, none)).toBeNull();
    const texts = ["7", "2"].map((text) => msg({ method: "text", text }));
    const two = beliefFrom(view(false), texts, q, emptyBelief());
    DECODERS.keypad?.(view(false), texts, two, q, 1);
    expect(keypadStep(q, two)).toBeNull(); // not the whole code yet
    const third = [msg({ method: "text", text: "9" })];
    const all = beliefFrom(view(false), third, q, two);
    DECODERS.keypad?.(view(false), third, all, q, 1);
    expect(all.answer).toEqual([6, 1, 8]);
    expect(keypadStep(q, all)).toEqual({ x: 4, y: 3 });
  });

  it("the earpiece's tune, heard the same twice, is the code to tell, key n as the digit n", () => {
    const keys = [0, 1, 2].flatMap((y) => [0, 1, 2].map((x) => [4 + x, 1 + y]));
    const room = roomWith(["#########", "#1..Q...#", "#2.g....#", "#3......#", "#########"], {
      Q1: { type: "keypad", keys, clue: "g1", length: 3 },
      g1: { item: "earpiece" },
    });
    for (const seed of [1, 2, 3]) {
      const world = createWorld(room, seed);
      const ear = emptyEar();
      const without: number[] = [];
      for (let t = 0; t < LISTEN_TICKS; t++) {
        step(world, {}, TICK_MS);
        without.push(...earStep(viewFor(world, 0, "blind", false), ear));
      }
      expect(without).toEqual([]); // nobody holds it: nothing heard, nothing told
      Object.assign(world.gear[0] as object, { heldBy: 0, at: null });
      const told: number[] = [];
      for (let t = 0; t < LISTEN_TICKS; t++) {
        step(world, {}, TICK_MS);
        told.push(...earStep(viewFor(world, 0, "blind", false), ear));
      }
      expect(told).toEqual(world.stations.Q1?.answer.map((k) => k + 1));
    }
  });
});

describe("the music box decoder, with two boxes playing", () => {
  // two boxes play at once in one room: each decoder takes the notes from its own box alone
  const GRID = [
    "#############",
    "#1.......#..#",
    "#2.......=Q.#",
    "#3.......=Q.#",
    "#############",
  ];
  const room = roomWith(GRID, {
    Q1: {
      type: "bells",
      bells: [
        [10, 2],
        [11, 2],
      ],
      tune: [2, 1],
      teach: true,
    },
    Q2: {
      type: "bells",
      bells: [
        [10, 3],
        [11, 3],
        [11, 1],
        [10, 1],
      ],
      tune: [7, 3],
    },
  });
  it("hears each box's tune from where it plays, not the other's", () => {
    for (const seed of [1, 2, 3]) {
      const world = createWorld(room, seed);
      place(world, 1, { x: 2, y: 2 });
      const b: Record<string, StationBelief> = { Q1: emptyBelief(), Q2: emptyBelief() };
      for (let t = 0; t < LISTEN_TICKS; t++) {
        step(world, {}, TICK_MS);
        const view = viewFor(world, 1, "mute", false);
        for (const id of ["Q1", "Q2"]) {
          const q = room.objects.find((x) => x.id === id);
          if (!q) throw new Error(`no ${id}`);
          b[id] = beliefFrom(view, [], q, b[id] as StationBelief);
          DECODERS.bells?.(view, [], b[id] as StationBelief, q, view.tick);
        }
      }
      expect(b.Q1?.answer).toEqual(world.stations.Q1?.answer);
      expect(b.Q2?.answer).toEqual(world.stations.Q2?.answer);
    }
  });
});

describe("the vault decoder", () => {
  // two wings west of a wall (star at row 1, wave at row 3), each a wire panel that reveals a
  // symbol once solved; the vault Q2 east, its sockets at (10,2) and (11,2), its order clue at (13,2)
  const GRID = [
    "###############",
    "#1.Q....#.Q...#",
    "#2......#.....#",
    "#3.Q....#....Y#",
    "###############",
  ];
  const wires = (y: number) => [3, 4, 5].map((x) => [x, y]);
  const room = roomWith(GRID, {
    Q1: { type: "wires", wires: wires(1), reveal: true, motif: "star" },
    Q2: {
      type: "vault",
      sockets: [
        [10, 2],
        [11, 2],
      ],
      from: ["Q3", "Q1"],
      symbols: "Y1",
    },
    Q3: { type: "wires", wires: wires(3), reveal: true, motif: "wave" },
  });
  const q = room.objects.find((x) => x.id === "Q2");
  if (!q) throw new Error("no Q2");
  // the wings solved with their symbols; the bot stands at each tile in turn for a few ticks
  const visit = (tiles: { x: number; y: number }[]) => {
    const world = createWorld(room, 5);
    for (const [id, symbol] of [
      ["Q1", 4],
      ["Q3", 1],
    ] as const) {
      const s = world.stations[id];
      if (!s) throw new Error(`no ${id}`);
      s.solved = true;
      s.reveal = symbol;
    }
    let b = emptyBelief();
    for (const at of tiles) {
      place(world, 1, at);
      for (let t = 0; t < 3; t++) {
        step(world, {}, TICK_MS);
        const view = viewFor(world, 1, "deaf", false);
        b = beliefFrom(view, [], q, b);
        DECODERS.vault?.(view, [], b, q, view.tick);
      }
    }
    return { world, b };
  };

  it("remembers each wing's symbol by its motif, reads the order, and turns each socket to it", () => {
    const { world, b } = visit([
      { x: 5, y: 2 },
      { x: 11, y: 3 },
    ]);
    expect(b.answer).toEqual([1, 4]); // wave's symbol, then star's
    expect(vaultStep(q, b)).toEqual({ x: 10, y: 2 }); // socket 1 shows 0, wants 1
    const s = world.stations.Q2;
    if (!s) throw new Error("no Q2");
    s.input = [1, 0];
    const turned = beliefFrom(viewFor(world, 1, "deaf", false), [], q, b);
    expect(vaultStep(q, turned)).toEqual({ x: 11, y: 2 });
    s.input = [1, 4];
    const done = beliefFrom(viewFor(world, 1, "deaf", false), [], q, turned);
    expect(vaultStep(q, done)).toEqual({ x: 10, y: 1 }); // the handle
  });

  it("with the wings never seen, it never turns a socket", () => {
    const { b } = visit([{ x: 11, y: 3 }]);
    expect(b.answer).toEqual([null, null]);
    expect(vaultStep(q, b)).toBeNull();
  });

  it("with the order clue never seen, it never turns a socket", () => {
    const { b } = visit([{ x: 5, y: 2 }]);
    expect(b.answer).toEqual([]);
    expect(vaultStep(q, b)).toBeNull();
  });
});

describe("the sync lock", () => {
  it("the counter says 3, 2, 1 a beat apart once every key is stood on, and not before", () => {
    expect(countStep(null, false, 5)).toEqual({ say: null, count: null });
    let c = countStep(null, true, 10);
    expect(c.say).toBe(3);
    const said: number[] = [];
    for (let t = 11; t <= 10 + 3 * COUNT_TICKS; t++) {
      c = countStep(c.count, true, t);
      if (c.say !== null) said.push(c.say);
    }
    expect(said).toEqual([2, 1]);
  });

  it("a key holder turns on the count's 1, read as text, and not on any other digit", () => {
    const b = emptyBelief();
    const at = (tick: number, text: string) =>
      DECODERS.sync?.({ ...view(false), tick }, [msg({ method: "text", text })], b, o, tick);
    at(10, "3");
    expect(syncGo(b, 10)).toBe(false);
    at(20, "2");
    expect(syncGo(b, 21)).toBe(false);
    at(30, "1");
    expect(syncGo(b, 31)).toBe(true);
    expect(syncGo(b, 40)).toBe(false); // too late: that turn is gone
  });

  it("with no count received, it never turns a key", () => {
    const b = emptyBelief();
    for (let t = 0; t < 100; t++) DECODERS.sync?.({ ...view(false), tick: t }, [], b, o, t);
    for (let t = 0; t < 100; t++) expect(syncGo(b, t)).toBe(false);
  });
});

// Braille (Task 74): Can't see decodes the cells on its own screen, as a person would with the key.
describe("readBraille", () => {
  it("reads back every number brailleCells writes, 0 to 99", () => {
    for (let n = 0; n <= 99; n++) expect(readBraille(brailleCells(n))).toBe(n);
  });
  it("is null without the number sign, or with a cell that is no digit", () => {
    expect(readBraille([[1]])).toBeNull();
    expect(readBraille([[3, 4, 5, 6]])).toBeNull();
    expect(
      readBraille([
        [3, 4, 5, 6],
        [1, 3],
      ]),
    ).toBeNull();
  });
});

describe("a dial whose digit a plate carries (Task 74)", () => {
  const Q = {
    id: "Q1",
    kind: "station" as const,
    tiles: [{ x: 4, y: 1 }],
    visibleTo: [],
    audibleTo: [],
    params: {
      type: "dial",
      pads: [
        [3, 1],
        [5, 1],
      ],
      digits: 2,
    },
  };
  const texted = (n: number): ChannelMessage =>
    ({
      method: "text",
      text: String(n),
      from: { seat: 0, role: "blind", nickname: "Bot" },
      sentAt: 0,
    }) as ChannelMessage;
  it("takes that digit from Can't see's text, once the first is entered", () => {
    const view = { tick: 1, sounds: [], entities: [] } as unknown as RoleView;
    const b: StationBelief = { ...emptyBelief(), shows: [4, 0], numbers: [] };
    const inbox = [texted(7)];
    const next = beliefFrom(view, inbox, Q, b);
    next.shows = [4, 0];
    DECODERS.dial?.(view, inbox, next, Q, 1, 1);
    expect(next.answer[1]).toBe(7);
    // and no plate: the digit stays unknown until the listener says stop
    const bare = { ...emptyBelief(), shows: [4, 0], numbers: [7] };
    DECODERS.dial?.(view, [], bare, Q, 1);
    expect(bare.answer[1]).toBeNull();
  });
});

describe("a plated radio's turner (FR10)", () => {
  const room = roomWith(["#########", "#1.Q....#", "#2......#", "#3......#", "#########"], {
    Q1: {
      type: "radio",
      pads: [
        [2, 2],
        [4, 2],
      ],
      range: 8,
    },
  });
  const o = room.objects.find((x) => x.id === "Q1");
  if (!o) throw new Error("no Q1");
  const belief = (setting: number, told?: number): StationBelief => ({
    ...emptyBelief(),
    shows: [setting],
    numbers: told === undefined ? [] : [told],
  });

  it("waits until it is told a band", () => {
    expect(radioPad(o, belief(0))).toBeNull();
  });

  it("turns toward the told band by the shorter way, and stops there", () => {
    expect(radioPad(o, belief(0, 5))).toEqual({ x: 2, y: 2 }); // 0 -> 5 is 3 notches back, not 5 up
    expect(radioPad(o, belief(0, 2))).toEqual({ x: 4, y: 2 });
    expect(radioPad(o, belief(5, 5))).toBeNull();
  });

  it("ignores a decoy's pips: only a solved radio gives its digit", () => {
    const b = { ...emptyBelief(), shows: [3, 2] };
    DECODERS.radio?.({ sounds: [] } as unknown as RoleView, [], b, o, 0, 0);
    expect(b.answer).toEqual([]);
    DECODERS.radio?.({ sounds: [] } as unknown as RoleView, [], { ...b, solved: true }, o, 0, 0);
    DECODERS.radio?.({ sounds: [] } as unknown as RoleView, [], b, o, 0);
    expect(b.answer).toEqual([2]);
  });
});

describe("a plate-held keypad key and wire (Task 77)", () => {
  const grid = ["#########", "#1.Q.Q..#", "#2......#", "#3......#", "#########"];
  const keys = [0, 1, 2].flatMap((y) => [0, 1, 2].map((x) => [10 + x, 1 + y]));
  const r = roomWith(grid, {
    Q1: { type: "keypad", keys, clue: "g1", length: 3 },
    Q2: {
      type: "wires",
      wires: [
        [4, 1],
        [5, 1],
        [6, 1],
      ],
      plaque: "u1",
      numbered: true,
    },
  });
  const o = (id: string) => {
    const x = r.objects.find((z) => z.id === id);
    if (!x) throw new Error(id);
    return x;
  };
  const view = { sounds: [], entities: [], tick: 0 } as unknown as RoleView;

  it("the earpiece keypad takes the texted plate digit at the plate's slot", () => {
    // told: the plate's digit first (7), then the tune's other keys (2, 5): keys 6, 1, 4
    const b = { ...emptyBelief(), numbers: [7, 2, 5] };
    DECODERS.keypad?.(view, [], b, o("Q1"), 0, 1);
    expect(b.answer).toEqual([1, 6, 4]);
  });

  it("the wires answer takes cut = n - 1 from a text, for a wire a plate names", () => {
    const b = { ...emptyBelief(), numbers: [3] };
    DECODERS.wires?.(view, [], b, o("Q2"), 0, 0);
    expect(b.answer).toEqual([2]);
    const none = emptyBelief();
    DECODERS.wires?.(view, [], none, o("Q2"), 0, 0);
    expect(none.answer).toEqual([null]);
  });
});
