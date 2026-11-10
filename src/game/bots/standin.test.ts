import { describe, expect, it } from "vitest";
import type { ChannelMessage } from "../channels.ts";
import { loadRooms } from "../rooms/load.ts";
import { TICK_MS } from "../sim/world.ts";
import type { Role } from "../types.ts";
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

  it("sends no stop at a safe's back, hearing the tumbler (no ask yet)", () => {
    const person = createStandIn(0, new Set([0]), ROLES).person;
    expect(person?.speak({ method: "callout", callout: "stop" }, 0)).toBeNull();
    // steering is allowed
    const steer = { method: "callout", callout: "left" } as const;
    expect(person?.speak(steer, 0)).toEqual(steer);
  });

  it("never sends a digit text when it reads a plate, nor an x mark (no ask yet)", () => {
    const person = createStandIn(0, new Set([0]), ROLES).person;
    expect(person?.speak({ method: "text", text: "7" }, 0)).toBeNull();
    expect(person?.speak({ method: "mark", id: "x", at: { x: 1, y: 1 } }, 0)).toBeNull();
    const chat = { method: "text", text: "hello" } as const;
    expect(person?.speak(chat, 0)).toEqual(chat);
  });

  it("solveRoom without stand-ins is unchanged, and with one the safe room does not clear", () => {
    const rooms = loadRooms("./rooms");
    const r1 = rooms.find((r) => r.id.startsWith("01"));
    if (!r1) throw new Error("room 1 missing");
    const base = solveRoom(r1, ROLES, 600);
    expect(base.cleared).toBe(true);
    const again = solveRoom(r1, ROLES, 600, { standIns: new Set() });
    expect(again.ticks).toBe(base.ticks);
    const r4 = rooms.find((r) => r.id.startsWith("04"));
    if (!r4) throw new Error("room 4 missing");
    const people = solveRoom(r4, ["deaf", "blind", "mute"], 120, { standIns: new Set([1]) });
    expect(people.cleared, "a person at the safe's back is never told to call stop").toBe(false);
  });
});
