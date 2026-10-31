import { describe, expect, it } from "vitest";
import type { Seat, Vec } from "../types.ts";
import { blockedAt } from "./collide.ts";
import { step } from "./step.ts";
import { gather, input, place, worldWith } from "./testing.ts";
import type { GearState, World, WorldEvent } from "./world.ts";

// g1 (3,2) a stethoscope, g2 (4,3) a UV torch, a wall at x = 6 with the hatch H1 at (6,2), the flag
// K1 (9,1), bell rope b1 (8,3), lamp switch l1 (10,3), and a wire panel Q1 (12,1) with three wires.
const GRID = [
  "##############",
  "#1....#..K..Q#",
  "#2.g..H......#",
  "#3..g.#.b.l..#",
  "##############",
];
const OBJECTS = {
  g1: { item: "stethoscope" },
  g2: { item: "uv" },
  Q1: {
    type: "wires",
    wires: [
      [11, 2],
      [12, 2],
      [12, 3],
    ],
  },
};
const fresh = () => worldWith(GRID, OBJECTS);
const gearOf = (w: World, id: string) => w.gear.find((g) => g.id === id) as GearState;
const kinds = (events: WorldEvent[]) => events.map((e) => e.kind);

// Presses a button for one tick and lets go for one (Act and G work on the press).
function press(w: World, seat: Seat, button: "act" | "gear" = "act"): WorldEvent[] {
  const down = { seq: 0, move: { x: 0, y: 0 }, act: button === "act", gear: button === "gear" };
  step(w, { [seat]: down });
  const events = [...w.events];
  step(w, { [seat]: input(0, 0) });
  return [...events, ...w.events];
}
const at = (w: World, seat: Seat, tile: Vec) => place(w, seat, tile);

describe("gear: take, give, drop", () => {
  it("lies where the room puts it, held by nobody", () => {
    expect(fresh().gear).toEqual([
      { id: "g1", item: "stethoscope", at: { x: 3, y: 2 }, heldBy: null, sill: null },
      { id: "g2", item: "uv", at: { x: 4, y: 3 }, heldBy: null, sill: null },
    ]);
  });

  it("Act on gear takes it into an empty slot, and never holds a second (a full slot swaps, Task 32)", () => {
    const w = fresh();
    at(w, 0, { x: 3, y: 2 });
    const events = press(w, 0);
    expect(gearOf(w, "g1")).toMatchObject({ heldBy: 0, at: null });
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "gear", id: "g1", action: "take", seat: 0 }),
    );
    at(w, 0, { x: 4, y: 3 });
    press(w, 0);
    expect(w.gear.filter((g) => g.heldBy === 0)).toHaveLength(1);
    expect(gearOf(w, "g2")).toMatchObject({ heldBy: 0, at: null });
    expect(gearOf(w, "g1")).toMatchObject({ heldBy: null, at: { x: 4, y: 3 } });
  });

  it("G gives to an adjacent teammate with an empty slot, else drops it on your tile", () => {
    const w = fresh();
    at(w, 0, { x: 3, y: 2 });
    press(w, 0);
    at(w, 1, { x: 4, y: 2 });
    expect(press(w, 0, "gear")).toContainEqual(
      expect.objectContaining({ kind: "gear", id: "g1", action: "give", seat: 0 }),
    );
    expect(gearOf(w, "g1").heldBy).toBe(1);
    // seat 0 takes the torch; seat 1 (full) stands beside it, so G drops it
    at(w, 0, { x: 4, y: 3 });
    press(w, 0);
    at(w, 1, { x: 5, y: 3 });
    expect(press(w, 0, "gear")).toContainEqual(
      expect.objectContaining({ kind: "gear", id: "g2", action: "drop", seat: 0 }),
    );
    expect(gearOf(w, "g2")).toMatchObject({ heldBy: null, at: { x: 4, y: 3 } });
    expect(gearOf(w, "g1").heldBy).toBe(1);
  });
});

describe("gear: swap", () => {
  it("G with a full slot on other gear swaps: the old one lands under you, the new is in hand", () => {
    const w = fresh();
    at(w, 0, { x: 3, y: 2 });
    press(w, 0); // holds g1
    at(w, 0, { x: 4, y: 3 }); // g2 lies here
    const events = press(w, 0, "gear");
    expect(gearOf(w, "g1")).toMatchObject({ heldBy: null, at: { x: 4, y: 3 } });
    expect(gearOf(w, "g2")).toMatchObject({ heldBy: 0, at: null });
    expect(events.filter((e) => e.kind === "gear")).toEqual([
      expect.objectContaining({ id: "g1", action: "drop", seat: 0 }),
      expect.objectContaining({ id: "g2", action: "take", seat: 0 }),
    ]);
  });

  it("G with an empty slot on gear takes it", () => {
    const w = fresh();
    at(w, 0, { x: 3, y: 2 });
    press(w, 0, "gear");
    expect(gearOf(w, "g1")).toMatchObject({ heldBy: 0, at: null });
  });

  it("G gives before it swaps when a teammate with a free slot is beside you", () => {
    const w = fresh();
    at(w, 0, { x: 3, y: 2 });
    press(w, 0);
    at(w, 0, { x: 4, y: 3 });
    at(w, 1, { x: 5, y: 3 });
    press(w, 0, "gear");
    expect(gearOf(w, "g1").heldBy).toBe(1);
    expect(gearOf(w, "g2")).toMatchObject({ heldBy: null, at: { x: 4, y: 3 } });
  });

  it("Space swaps with a full slot on other gear", () => {
    const w = fresh();
    at(w, 0, { x: 3, y: 2 });
    press(w, 0);
    at(w, 0, { x: 4, y: 3 });
    press(w, 0);
    expect(gearOf(w, "g1")).toMatchObject({ heldBy: null, at: { x: 4, y: 3 } });
    expect(gearOf(w, "g2").heldBy).toBe(0);
  });

  it("Space swaps last: a hatch sill beside you, or a teammate to hold, wins", () => {
    // sill: full slot, gear underfoot, hatch beside: the item goes on the sill, nothing swaps
    const a = fresh();
    at(a, 0, { x: 3, y: 2 });
    press(a, 0);
    a.gear.push({ id: "g3", item: "uv", at: { x: 5, y: 2 }, heldBy: null, sill: null });
    at(a, 0, { x: 5, y: 2 });
    press(a, 0);
    expect(gearOf(a, "g1")).toMatchObject({ heldBy: null, sill: "H1" });
    expect(gearOf(a, "g3")).toMatchObject({ heldBy: null, at: { x: 5, y: 2 } });
    // hands: full slot, gear underfoot, a teammate beside: you hold hands, nothing swaps
    const b = fresh();
    at(b, 0, { x: 3, y: 2 });
    press(b, 0);
    at(b, 0, { x: 4, y: 3 });
    at(b, 1, { x: 5, y: 3 });
    // seat 1 is full, so G cannot give; Space holds
    Object.assign(gearOf(b, "g2"), { heldBy: 1, at: null });
    b.gear.push({ id: "g3", item: "uv", at: { x: 4, y: 3 }, heldBy: null, sill: null });
    press(b, 0);
    expect(b.holding).toEqual({ 1: 0 });
    expect(gearOf(b, "g1").heldBy).toBe(0);
  });
});

describe("gear: the hatch sill", () => {
  it("an item put on a sill is taken from the other side", () => {
    const w = fresh();
    at(w, 0, { x: 3, y: 2 });
    press(w, 0);
    at(w, 0, { x: 5, y: 2 });
    expect(press(w, 0)).toContainEqual(
      expect.objectContaining({ kind: "gear", id: "g1", action: "sill" }),
    );
    expect(gearOf(w, "g1")).toMatchObject({ heldBy: null, at: null, sill: "H1" });
    at(w, 1, { x: 7, y: 2 });
    press(w, 1);
    expect(gearOf(w, "g1")).toMatchObject({ heldBy: 1, at: null, sill: null });
  });

  it("is a wall to bodies", () => {
    const w = fresh();
    expect(blockedAt(w, { x: 6.5, y: 2.5 })).toBe(true);
  });
});

describe("gear: a checkpoint reset", () => {
  it("puts gear back where it lay when the checkpoint was reached", () => {
    const w = fresh();
    at(w, 0, { x: 3, y: 2 });
    press(w, 0);
    at(w, 0, { x: 8, y: 1 });
    press(w, 0, "gear"); // nobody beside: dropped at (8, 1)
    gather(w, { x: 9, y: 1 });
    step(w, {});
    expect(w.checkpoint).toBe(1);
    at(w, 1, { x: 7, y: 1 });
    at(w, 2, { x: 7, y: 3 });
    at(w, 0, { x: 8, y: 1 });
    press(w, 0); // picked up again
    expect(gearOf(w, "g1").heldBy).toBe(0);
    const station = w.stations.Q1;
    const wrongWire = [0, 1, 2].find((i) => i !== station?.answer[0]) as number;
    const tiles = [
      { x: 11, y: 2 },
      { x: 12, y: 2 },
      { x: 12, y: 3 },
    ];
    at(w, 0, tiles[wrongWire] as Vec);
    expect(kinds(press(w, 0))).toContain("caught");
    expect(gearOf(w, "g1")).toMatchObject({ heldBy: null, at: { x: 8, y: 1 } });
  });
});

describe("holding hands", () => {
  const holding = () => {
    const w = fresh();
    at(w, 0, { x: 2, y: 1 });
    at(w, 1, { x: 3, y: 1 });
    at(w, 2, { x: 9, y: 3 });
    return w;
  };

  it("Act on an adjacent teammate holds their hand: the actor leads", () => {
    const w = holding();
    expect(press(w, 0)).toContainEqual({ kind: "hold", seat: 1, leader: 0 });
    expect(w.holding).toEqual({ 1: 0 });
  });

  // Rewritten, not deleted (Task 40; spec FR22 changes, ADR 0019): the towed seat's input is no
  // longer ignored, because both hand-holders steer. What stays true is the other half of this
  // test: the towed seat follows behind the leader within reach and is never put in a wall.
  it("the towed seat follows behind the leader within reach, never in a wall", () => {
    const w = holding();
    press(w, 0);
    for (let i = 0; i < 20; i++) {
      step(w, { 0: input(1, 0), 1: input(1, 0) });
      expect(blockedAt(w, w.players[1].pos)).toBe(false);
    }
    const [lead, towed] = [w.players[0].pos, w.players[1].pos];
    expect(towed.x).toBeLessThan(lead.x);
    expect(Math.hypot(lead.x - towed.x, lead.y - towed.y)).toBeLessThan(1.2);
    // turned to walk away from a wall: straight behind is in the wall, so it stands beside
    for (let i = 0; i < 30; i++) {
      step(w, { 0: input(-1, 0), 1: input(-1, 0) });
      expect(blockedAt(w, w.players[1].pos)).toBe(false);
    }
    w.players[0].facing = { x: 1, y: 0 };
    step(w, { 0: input(1, 0), 1: input(1, 0) });
    expect(blockedAt(w, w.players[1].pos)).toBe(false);
  });

  describe("both hand-holders steer (Task 40, ADR 0019)", () => {
    // seat 0 leads seat 1, in the open at the west of the room, row 1
    const pair = () => {
      const w = holding();
      press(w, 0);
      return w;
    };
    const moved = (w: World, seat: Seat, ticks: number, inputs: Parameters<typeof step>[1]) => {
      const from = { ...w.players[seat].pos };
      for (let i = 0; i < ticks; i++) step(w, inputs);
      return { dx: w.players[seat].pos.x - from.x, dy: w.players[seat].pos.y - from.y };
    };
    const STEP = (ticks: number) => (4 * 50 * ticks) / 1000; // SPEED_TPS tiles a second

    it("the towed seat pushing alone moves the pair", () => {
      const w = pair();
      const lead = moved(w, 0, 5, { 1: input(1, 0) });
      expect(lead.dx).toBeGreaterThan(STEP(5) * 0.9);
      expect(w.players[1].pos.x).toBeGreaterThan(2); // and the towed seat came with them
    });

    it("both pushing the same way moves at one step, not two", () => {
      const w = pair();
      const both = moved(w, 0, 5, { 0: input(1, 0), 1: input(1, 0) });
      const w2 = pair();
      const alone = moved(w2, 0, 5, { 0: input(1, 0) });
      expect(both.dx).toBeCloseTo(alone.dx, 6);
      expect(both.dx).toBeLessThanOrEqual(STEP(5) + 1e-9);
    });

    it("one idle means the other leads, at full speed, from either seat", () => {
      for (const who of [0, 1] as const) {
        const w = pair();
        const lead = moved(w, 0, 5, { [who]: input(1, 0) });
        expect(lead.dx, `seat ${who} alone`).toBeGreaterThan(STEP(5) * 0.9);
      }
    });

    it("opposite pushes cancel: the pair stays where it is", () => {
      const w = pair();
      const before = [{ ...w.players[0].pos }, { ...w.players[1].pos }];
      for (let i = 0; i < 10; i++) step(w, { 0: input(1, 0), 1: input(-1, 0) });
      expect(w.players[0].pos.x).toBeCloseTo(before[0]?.x ?? 0, 6);
      expect(w.players[1].pos.x).toBeCloseTo(before[1]?.x ?? 0, 6);
    });

    it("pushes at right angles go diagonally, and still no faster than one step", () => {
      const w = pair();
      const lead = moved(w, 0, 5, { 0: input(1, 0), 1: input(0, 1) });
      expect(lead.dx).toBeGreaterThan(0);
      expect(lead.dy).toBeGreaterThan(0);
      expect(Math.hypot(lead.dx, lead.dy)).toBeLessThanOrEqual(STEP(5) + 1e-9);
    });

    it("a blocked combined step stops both, and the towed seat is still never in a wall", () => {
      const w = pair();
      for (let i = 0; i < 60; i++) {
        step(w, { 0: input(-1, 0), 1: input(-1, 0) }); // into the west wall
        expect(blockedAt(w, w.players[0].pos)).toBe(false);
        expect(blockedAt(w, w.players[1].pos)).toBe(false);
      }
      expect(w.players[0].blocked).toBe(true);
    });

    it("each seat's own input sequence is what is acknowledged to it, whoever walks the pair", () => {
      // `ack` (lastSeq) is how a client reconciles its predicted position: a counter of its own
      // inputs. The towed seat's number must never land on the leader, or the leader's client is
      // told it is acknowledged for an input it never sent.
      const w = pair();
      step(w, {
        0: { seq: 101, move: { x: 0, y: 0 }, act: false },
        1: { seq: 907, move: { x: 1, y: 0 }, act: false },
      });
      expect(w.players[0].lastSeq, "the leader's own counter").toBe(101);
      expect(w.players[1].lastSeq, "the towed seat's own counter").toBe(907);
      // and with the leader sending nothing at all, its counter is left as it was
      const v = pair();
      step(v, { 1: { seq: 55, move: { x: 1, y: 0 }, act: false } });
      expect(
        v.players[0].lastSeq,
        "no input from the leader: not the towed seat's number",
      ).not.toBe(55);
      expect(v.players[1].lastSeq).toBe(55);
    });

    it("a tug of war is one 'pull' event when it starts, never one a tick, and again after a rest", () => {
      const w = pair();
      const pulls = (inputs: Parameters<typeof step>[1], ticks: number) => {
        let n = 0;
        for (let i = 0; i < ticks; i++) {
          step(w, inputs);
          n += w.events.filter((e) => e.kind === "pull").length;
        }
        return n;
      };
      expect(pulls({ 0: input(1, 0), 1: input(-1, 0) }, 30), "30 ticks of tug: one event").toBe(1);
      expect(pulls({}, 3), "let go: none").toBe(0);
      expect(pulls({ 0: input(1, 0), 1: input(-1, 0) }, 10), "a second tug: a second event").toBe(
        1,
      );
    });

    it("only a deliberate tug is a pull: one idle, one pushing, or both the same way, never", () => {
      for (const inputs of [
        { 0: input(1, 0) },
        { 1: input(1, 0) },
        { 0: input(1, 0), 1: input(1, 0) },
        { 0: input(1, 0), 1: input(0, 1) },
        { 0: input(0, 0), 1: input(0, 0) },
      ] as const) {
        const w = pair();
        let n = 0;
        for (let i = 0; i < 10; i++) {
          step(w, inputs);
          n += w.events.filter((e) => e.kind === "pull").length;
        }
        expect(n, JSON.stringify(inputs)).toBe(0);
      }
    });

    it("a pull names the two holders, and letting go in the middle of a tug ends it", () => {
      const w = pair();
      step(w, { 0: input(1, 0), 1: input(-1, 0) });
      expect(w.events.find((e) => e.kind === "pull")).toMatchObject({ leader: 0, towed: 1 });
      expect(w.pulling).toEqual({ 1: true });
      press(w, 0); // Act lets go
      expect(w.pulling).toEqual({});
    });

    it("a checkpoint reset in the middle of a tug lets go, and leaves nothing pulling", () => {
      const w = holding();
      at(w, 2, { x: 11, y: 2 });
      press(w, 0);
      step(w, { 0: input(1, 0), 1: input(-1, 0) });
      expect(w.pulling).toEqual({ 1: true });
      // seat 2 cuts a wrong wire: the team is caught and sent back, and hands are let go
      const station = w.stations.Q1;
      const tiles = [
        { x: 11, y: 2 },
        { x: 12, y: 2 },
        { x: 12, y: 3 },
      ];
      const wrongWire = [0, 1, 2].find((i) => i !== station?.answer[0]) as number;
      at(w, 2, tiles[wrongWire] as Vec);
      expect(kinds(press(w, 2))).toContain("caught");
      expect(w.holding).toEqual({});
      expect(w.pulling, "nobody is pulling once they are let go").toEqual({});
    });

    it("a let-go clears the pull in that very tick, not the next", () => {
      const w = pair();
      step(w, { 0: input(1, 0), 1: input(-1, 0) });
      expect(w.pulling).toEqual({ 1: true });
      // Act lets go: look at the world straight after that one step, without another
      step(w, { 0: input(0, 0, true) });
      expect(w.holding).toEqual({});
      expect(w.pulling).toEqual({});
    });

    it("a held bot (idle input) never stalls the human who leads", () => {
      const w = pair();
      // seat 1 is a bot with no input at all (undefined), seat 0 is the human
      const lead = moved(w, 0, 5, { 0: input(1, 0) });
      expect(lead.dx).toBeGreaterThan(STEP(5) * 0.9);
      // and the other way: the bot leads (seat 1 holds seat 0), the human is towed and steers
      const v = holding();
      at(v, 1, { x: 3, y: 1 });
      press(v, 1); // seat 1 leads seat 0
      expect(v.holding).toEqual({ 0: 1 });
      const led = moved(v, 1, 5, { 0: input(1, 0) });
      expect(led.dx).toBeGreaterThan(STEP(5) * 0.9);
    });
  });

  it("either of the two Acting lets go", () => {
    const w = holding();
    press(w, 0);
    expect(press(w, 1)).toContainEqual({ kind: "hold", seat: 1, leader: null });
    expect(w.holding).toEqual({});
    press(w, 0);
    expect(w.holding).toEqual({ 1: 0 });
    expect(press(w, 0)).toContainEqual({ kind: "hold", seat: 1, leader: null });
    expect(w.holding).toEqual({});
  });

  it("a checkpoint reset lets go", () => {
    const w = holding();
    at(w, 2, { x: 11, y: 2 });
    press(w, 0);
    expect(w.holding).toEqual({ 1: 0 });
    const station = w.stations.Q1;
    const tiles = [
      { x: 11, y: 2 },
      { x: 12, y: 2 },
      { x: 12, y: 3 },
    ];
    const wrongWire = [0, 1, 2].find((i) => i !== station?.answer[0]) as number;
    at(w, 2, tiles[wrongWire] as Vec);
    expect(kinds(press(w, 2))).toContain("caught");
    expect(w.holding).toEqual({});
  });
});

describe("bell and lamp", () => {
  it("Act on the rope rings the bell; Act on the switch flashes the lamp", () => {
    const w = fresh();
    at(w, 0, { x: 8, y: 3 });
    expect(press(w, 0)).toContainEqual({ kind: "bell", id: "b1", at: { x: 8.5, y: 3.5 } });
    at(w, 0, { x: 10, y: 3 });
    expect(press(w, 0)).toContainEqual({ kind: "lamp", id: "l1", seat: 0 });
  });
});
