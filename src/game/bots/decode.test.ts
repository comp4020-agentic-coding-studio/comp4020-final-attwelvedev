import { describe, expect, it } from "vitest";
import type { ChannelMessage, Outgoing } from "../channels.ts";
import { type RoleView, viewFor } from "../perception.ts";
import { toggled } from "../sim/stations.ts";
import { step } from "../sim/step.ts";
import { place, roomWith } from "../sim/testing.ts";
import { createWorld, TICK_MS } from "../sim/world.ts";
import {
  beliefFrom,
  DECODERS,
  dialStep,
  emptyBelief,
  keypadStep,
  linkedFrom,
  radioToTell,
  readNumber,
  type StationBelief,
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
  it("has the safe's from 05, the wires' and keypad's from 06, radio's and switches' from 07", () => {
    expect(Object.keys(DECODERS)).toEqual(["dial", "wires", "keypad", "radio", "switches"]);
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
    for (let t = 0; t < 200; t++) {
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
