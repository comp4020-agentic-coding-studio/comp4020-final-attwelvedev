import { describe, expect, it } from "vitest";
import type { ChannelMessage, Outgoing } from "../channels.ts";
import { type RoleView, viewFor } from "../perception.ts";
import { place, roomWith } from "../sim/testing.ts";
import { createWorld } from "../sim/world.ts";
import { beliefFrom, DECODERS, dialStep, emptyBelief, readNumber } from "./decode.ts";

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
  it("has the safe's from phase 05; each later room phase adds its own (06 to 10)", () => {
    expect(Object.keys(DECODERS)).toEqual(["dial"]);
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
