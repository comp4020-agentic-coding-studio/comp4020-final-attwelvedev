import { describe, expect, it } from "vitest";
import type { ChannelMessage, Outgoing } from "../channels.ts";
import type { RoleView } from "../perception.ts";
import { roomWith } from "../sim/testing.ts";
import { beliefFrom, DECODERS, emptyBelief, readNumber } from "./decode.ts";

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
  it("has no station type yet: each room phase adds its own (05 to 10)", () => {
    expect(Object.keys(DECODERS)).toEqual([]);
  });
});
