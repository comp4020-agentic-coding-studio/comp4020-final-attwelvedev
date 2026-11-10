import { describe, expect, it } from "vitest";
import type { ChannelMessage } from "../channels.ts";
import { rolesFor } from "../crew.ts";
import { loadRooms } from "../rooms/load.ts";
import { step } from "../sim/step.ts";
import { createWorld, TICK_MS } from "../sim/world.ts";
import type { Role, Seat } from "../types.ts";
import { createBotMemory } from "./brain.ts";
import { type BotSeat, botsAct } from "./crew.ts";
import { solveRoom } from "./solve.ts";
import { createStandIn, STANDIN_DELAY_TICKS } from "./standin.ts";

const ROLES: [Role, Role, Role] = ["blind", "deaf", "mute"];
const callout = (c: "left" | "stop", sentAt: number): ChannelMessage => ({
  method: "callout",
  callout: c,
  from: { seat: 1, role: "deaf", nickname: "Bot 1" },
  sentAt,
});

describe("the stand-in person", () => {
  it("acts on a direction callout 20 ticks after it was sent, not at once", () => {
    const person = createStandIn(0, new Set([0]), ROLES).person;
    if (!person) throw new Error("no person limits");
    expect(person.hear([callout("left", 0)], 0)).toHaveLength(0);
    expect(person.hear([], (STANDIN_DELAY_TICKS - 1) * TICK_MS)).toHaveLength(0);
    expect(person.hear([], STANDIN_DELAY_TICKS * TICK_MS)).toHaveLength(1);
    expect(person.hear([], (STANDIN_DELAY_TICKS + 1) * TICK_MS)).toHaveLength(0);
  });

  it("sends no stop at a safe's back, hearing the tumbler (no ask made)", () => {
    const person = createStandIn(0, new Set([0]), ROLES).person;
    expect(person?.speak({ method: "callout", callout: "stop" }, 0, [])).toBeNull();
    // steering is allowed
    const steer = { method: "callout", callout: "left" } as const;
    expect(person?.speak(steer, 0, [])).toEqual(steer);
  });

  it("never sends a digit text when it reads a plate, nor an x mark (no ask made)", () => {
    const person = createStandIn(0, new Set([0]), ROLES).person;
    expect(person?.speak({ method: "text", text: "7" }, 0, [])).toBeNull();
    expect(person?.speak({ method: "mark", id: "x", at: { x: 1, y: 1 } }, 0, [])).toBeNull();
    const chat = { method: "text", text: "hello" } as const;
    expect(person?.speak(chat, 0, [])).toEqual(chat);
  });

  it("sends a Stop only after an ask of its kind has been live for the delay, and then a reaction late", () => {
    const person = createStandIn(0, new Set([0]), ROLES).person;
    const stop = { method: "callout", callout: "stop" } as const;
    const ask = [{ kind: "stop-on-click", from: 2, to: 0 }] as const;
    const delay = STANDIN_DELAY_TICKS * TICK_MS;
    expect(person?.speak(stop, 1000, ask)).toBeNull(); // just asked
    expect(person?.speak(stop, 1000 + delay - TICK_MS, ask)).toBeNull();
    // the ask is live: the sound is heard, and the Stop follows a reaction later (BP2's late credit)
    expect(person?.speak(stop, 1000 + delay, ask)).toBeNull();
    expect(person?.speak(null, 1000 + 2 * delay - TICK_MS, ask)).toBeNull();
    expect(person?.speak(null, 1000 + 2 * delay, ask)).toEqual(stop);
    // a different kind of ask does not unlock it, and the ask ending takes it away again
    const other = [{ kind: "read-plate", from: 2, to: 0 }] as const;
    expect(person?.speak(stop, 9000, other)).toBeNull();
    expect(person?.speak(null, 9000 + 3 * delay, other)).toBeNull();
    expect(person?.speak(stop, 20000 + delay, [])).toBeNull();
  });

  it("a digit read before it was asked for is kept and sent once the ask has been live for the delay", () => {
    const person = createStandIn(0, new Set([0]), ROLES).person;
    const digit = { method: "text", text: "7" } as const;
    const ask = [{ kind: "read-plate", from: 2, to: 0 }] as const;
    const delay = STANDIN_DELAY_TICKS * TICK_MS;
    expect(person?.speak(digit, 0, [])).toBeNull(); // read, not asked for: kept
    expect(person?.speak(null, 1000, ask)).toBeNull(); // just asked
    expect(person?.speak(null, 1000 + delay, ask)).toEqual(digit);
    expect(person?.speak(null, 1000 + delay + TICK_MS, ask)).toBeNull(); // sent once
  });

  // Task 314: a Can't hear stand-in is told no ask kind; it has a bot's Desperate face and its own view
  const face = (from: Seat, sentAt: number): ChannelMessage => ({
    method: "face",
    id: "f06",
    from: { seat: from, role: "blind", nickname: "Bot" },
    sentAt,
  });
  const DEAF: [Role, Role, Role] = ["blind", "deaf", "mute"];
  const stop = { method: "callout", callout: "stop" } as const;

  it("as Can't hear it calls Stop after a bot's face arrives, and not without one", () => {
    const delay = STANDIN_DELAY_TICKS * TICK_MS;
    const none = createStandIn(1, new Set([1]), DEAF).person;
    expect(none?.speak(stop, 0, [])).toBeNull();
    expect(none?.speak(null, 5 * delay, [])).toBeNull();
    const seen = createStandIn(1, new Set([1]), DEAF).person;
    seen?.hear([face(0, 1000)], 1000);
    expect(seen?.speak(stop, 1000 + delay, [])).toBeNull(); // heard late, reacted late
    expect(seen?.speak(null, 1000 + 2 * delay, [])).toEqual(stop);
  });

  it("as Can't hear it is not unlocked by the ask kind, only by the face", () => {
    const person = createStandIn(1, new Set([1]), DEAF).person;
    const ask = [{ kind: "stop-on-click", from: 0, to: 1 }] as const;
    const delay = STANDIN_DELAY_TICKS * TICK_MS;
    expect(person?.speak(stop, 0, ask)).toBeNull();
    expect(person?.speak(null, 5 * delay, ask)).toBeNull();
  });

  it("a face with nothing waiting makes it do nothing", () => {
    const person = createStandIn(1, new Set([1]), DEAF).person;
    person?.hear([face(0, 0)], 0);
    expect(person?.speak(null, 5000, [])).toBeNull();
  });

  it("solveRoom without stand-ins is unchanged, and with one the safe room clears by an ask", () => {
    const rooms = loadRooms("./rooms");
    const r1 = rooms.find((r) => r.id.startsWith("01"));
    if (!r1) throw new Error("room 1 missing");
    const base = solveRoom(r1, ROLES, 600);
    expect(base.cleared).toBe(true);
    const again = solveRoom(r1, ROLES, 600, { standIns: new Set() });
    expect(again.ticks).toBe(base.ticks);
    const r4 = rooms.find((r) => r.id.startsWith("04"));
    if (!r4) throw new Error("room 4 missing");
    // (this said "does not clear" while nothing told a person at the safe's back to call stop; the bot now
    // asks for it (stop-on-click) and tows them there, so the room clears: overnight log bp05/307)
    const people = solveRoom(r4, ["deaf", "blind", "mute"], 240, { standIns: new Set([1]) });
    expect(people.cleared, "a person at the safe's back is asked to call stop, and does").toBe(
      true,
    );
  });

  it("a person as Can't see is towed onto the safe's back (23, 1) in room 4, not left a tile short at (24, 1)", () => {
    const room = loadRooms("./rooms").find((r) => r.id.startsWith("04"));
    if (!room) throw new Error("room 4 missing");
    const roles = rolesFor(1); // (rotation 0 is still in rooms-people's NOT_YET: bp05/307)
    const seat = roles.indexOf("blind") as Seat;
    const humans = new Set<Seat>([seat]);
    const world = createWorld(room, 1, [...roles]);
    const bots: Partial<Record<Seat, BotSeat>> = {};
    for (const s of [0, 1, 2] as const)
      bots[s] =
        s === seat
          ? createStandIn(s, humans, roles)
          : { memory: createBotMemory(s, humans, roles), inbox: [] };
    const cooldowns = { until: {} };
    let asks: readonly never[] = [];
    let held = false;
    let letGoAt: { x: number; y: number } | null = null;
    for (let i = 0; i < 1500 && letGoAt === null; i++) {
      const full = new Set<Seat>(i === 0 ? [0, 1, 2] : []);
      const turn = botsAct(
        room,
        world,
        roles,
        bots,
        cooldowns,
        world.tick * TICK_MS,
        (n) => `Bot ${n}`,
        full,
        asks,
      );
      asks = turn.sentAsks as never[];
      step(world, turn.inputs, TICK_MS);
      const now = world.holding[seat] !== undefined;
      // the first tow of the room ends at the safe's back, east of the flag
      if (held && !now && world.players[seat].pos.x > 20) letGoAt = { ...world.players[seat].pos };
      held = now;
    }
    expect(letGoAt, "the hand was let go").not.toBeNull();
    expect(Math.floor((letGoAt as { x: number }).x)).toBe(23);
    expect(Math.floor((letGoAt as { y: number }).y)).toBe(1);
  });

  // The owner's check (2026-11-11): is a room with a braille plate and a person as Can't see possible with
  // two bots? Can't see can text (RECEIVES/SENDS), the bot reads a single digit (`readNumber`), and the
  // `read-plate` ask asks for it. Every plate's number is one digit (a dial setting 0-9, a key 1-9, a
  // wire 1-4, a plated radio's band: never more than 9), so a one-digit read is enough.
  it.each(["04", "05", "06", "07", "08", "09"])(
    "room %s: a stand-in as Can't see reads its plate and texts the digit after read-plate; the bot's belief holds it",
    (n) => {
      const room = loadRooms("./rooms").find((r) => r.id.startsWith(n));
      if (!room) throw new Error(`room ${n} missing`);
      const plate = room.objects.find((o) => o.kind === "braille");
      const stationId = String(plate?.params?.for);
      let asked = false;
      let said = "";
      for (const rotation of [0, 1, 2]) {
        const roles = rolesFor(rotation);
        const seat = roles.indexOf("blind") as Seat;
        const humans = new Set<Seat>([seat]);
        const world = createWorld(room, 1, [...roles]);
        const bots: Partial<Record<Seat, BotSeat>> = {};
        for (const x of [0, 1, 2] as const)
          bots[x] =
            x === seat
              ? createStandIn(x, humans, roles)
              : { memory: createBotMemory(x, humans, roles), inbox: [] };
        const cooldowns = { until: {} };
        let asks: readonly never[] = [];
        const budget = (typeof room.meta.budgetS === "number" ? room.meta.budgetS : 240) * 20;
        let digits = 0;
        for (let i = 0; i < budget && world.status !== "cleared"; i++) {
          const turn = botsAct(
            room,
            world,
            roles,
            bots,
            cooldowns,
            world.tick * TICK_MS,
            (b) => `Bot ${b}`,
            new Set<Seat>(i === 0 ? [0, 1, 2] : []),
            asks,
          );
          asks = turn.sentAsks as never[];
          if (
            turn.sentAsks.some(
              (a) => (a.kind === "read-plate" || a.kind === "plate-first") && a.to === seat,
            )
          )
            asked = true; // (room 8's keypad has an earpiece clue: its ask is plate-first)
          for (const sent of turn.sent)
            if (
              sent.from === seat &&
              sent.message.method === "text" &&
              /^\d$/.test(sent.message.text)
            )
              digits++;
          step(world, turn.inputs, TICK_MS);
        }
        if (digits > 0) said += `${rotation}:${digits} `;
        // the bots' belief of the plated station holds a digit the person sent
        const believed = [0, 1, 2]
          .filter((x) => x !== seat)
          .map((x) => bots[x as Seat]?.memory.known?.stations[stationId])
          .some(
            (b) =>
              b && (b.plate !== null || b.numbers.length > 0 || b.answer.some((a) => a !== null)),
          );
        if (digits > 0)
          expect(believed, `rotation ${rotation}: the bot's belief of ${stationId}`).toBe(true);
      }
      expect(asked, "a read-plate (or plate-first) ask was made of the person").toBe(true);
      expect(said, "the stand-in texted a digit in at least one rotation").not.toBe("");
    },
  );
});
