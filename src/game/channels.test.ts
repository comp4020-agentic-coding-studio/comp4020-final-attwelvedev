import { describe, expect, it } from "vitest";
import {
  CALLOUTS,
  COOLDOWN_MS,
  type CooldownState,
  cleanText,
  type Outgoing,
  route,
  STAMP_COOLDOWN_MS,
} from "./channels.ts";
import { CHANNEL_RULES, type Family, ROLES, type Role, type Seat } from "./types.ts";

// seat 0 blind, seat 1 deaf, seat 2 mute
const roles: [Role, Role, Role] = ["blind", "deaf", "mute"];
const fresh = (): CooldownState => ({ until: {} });
const seatOf = (role: Role): Seat => roles.indexOf(role) as Seat;

const sample: Record<Family, Outgoing> = {
  say: { family: "say", kind: "callout", callout: "go" },
  sound: { family: "sound", clip: "c1" },
  show: { family: "show", kind: "face", id: "f01" },
};

describe("route follows CHANNEL_RULES", () => {
  for (const role of ROLES) {
    for (const family of ["say", "sound", "show"] as const) {
      it(`${role} on ${family}`, () => {
        const rule = CHANNEL_RULES[family];
        const result = route(roles, seatOf(role), sample[family], fresh(), 1000);
        if (!rule.send.includes(role)) {
          expect(result).toEqual({ ok: false, code: "cant-send" });
          return;
        }
        const expected = ROLES.filter((r) => rule.receive.includes(r)).map(seatOf);
        expect(result.ok).toBe(true);
        if (result.ok) expect([...result.receivers].sort()).toEqual([...expected].sort());
      });
    }
  }

  it("includes the sender only when their role receives the family", () => {
    const blindSound = route(roles, 0, sample.sound, fresh(), 0);
    expect(blindSound.ok && blindSound.receivers).toContain(0);
    const deafSay = route(roles, 1, sample.say, fresh(), 0);
    expect(deafSay.ok && deafSay.receivers).not.toContain(1);
  });

  it("refuses text and callouts from Can't speak", () => {
    const mute = seatOf("mute");
    expect(route(roles, mute, { family: "say", kind: "text", text: "hi" }, fresh(), 0)).toEqual({
      ok: false,
      code: "cant-send",
    });
    expect(route(roles, mute, sample.say, fresh(), 0)).toEqual({ ok: false, code: "cant-send" });
  });

  it("lets Can't see send Show to Can't hear and Can't speak (FR22)", () => {
    const result = route(roles, seatOf("blind"), sample.show, fresh(), 0);
    expect(result.ok && [...result.receivers].sort()).toEqual([1, 2]);
  });

  it("follows the roles it is given, not the seat numbers", () => {
    const rotated: [Role, Role, Role] = ["deaf", "mute", "blind"];
    const result = route(rotated, 0, sample.say, fresh(), 0);
    expect(result.ok && [...result.receivers].sort()).toEqual([1, 2]);
  });
});

describe("cooldowns", () => {
  it("has the spec's constants", () => {
    expect(COOLDOWN_MS).toEqual({ say: 0, sound: 3000, show: 1500 });
    expect(STAMP_COOLDOWN_MS).toBe(1000);
  });

  it("refuses a second sound within 3 s and allows it after", () => {
    const cd = fresh();
    const first = route(roles, 0, sample.sound, cd, 10_000);
    expect(first.ok && first.until).toBe(13_000);
    if (first.ok && first.cooldownKey) cd.until[first.cooldownKey] = first.until;
    expect(route(roles, 0, sample.sound, cd, 12_999)).toEqual({
      ok: false,
      code: "cooldown",
      until: 13_000,
    });
    expect(route(roles, 0, sample.sound, cd, 13_000).ok).toBe(true);
  });

  it("is per sender", () => {
    const cd = fresh();
    const first = route(roles, 0, sample.sound, cd, 0);
    if (first.ok && first.cooldownKey) cd.until[first.cooldownKey] = first.until;
    expect(route(roles, 2, sample.sound, cd, 100).ok).toBe(true);
  });

  it("cools stamps for 1 s, independently of faces", () => {
    const cd = fresh();
    const stamp: Outgoing = { family: "show", kind: "stamp", id: "x", at: { x: 1, y: 1 } };
    const face = route(roles, 2, sample.show, cd, 0);
    if (face.ok && face.cooldownKey) cd.until[face.cooldownKey] = face.until;
    const s1 = route(roles, 2, stamp, cd, 100);
    expect(s1.ok && s1.until).toBe(100 + STAMP_COOLDOWN_MS);
    if (s1.ok && s1.cooldownKey) cd.until[s1.cooldownKey] = s1.until;
    expect(route(roles, 2, stamp, cd, 900)).toMatchObject({ ok: false, code: "cooldown" });
    expect(route(roles, 2, stamp, cd, 1100).ok).toBe(true);
    // a face is still cooling on its own clock
    expect(route(roles, 2, sample.show, cd, 1100)).toMatchObject({ ok: false, code: "cooldown" });
    expect(route(roles, 2, sample.show, cd, 1500).ok).toBe(true);
  });

  it("has no cooldown on Say", () => {
    const first = route(roles, 0, sample.say, fresh(), 0);
    expect(first.ok && first.cooldownKey).toBeNull();
  });
});

describe("cleanText", () => {
  it("trims, strips control characters and caps at 120", () => {
    expect(cleanText("  hello\u0007 there\n ")).toBe("hello there");
    expect(cleanText("a".repeat(200))).toBe("a".repeat(120));
  });

  it("is null when nothing is left", () => {
    expect(cleanText("   ")).toBeNull();
    expect(cleanText("\u0000\u0001")).toBeNull();
  });
});

describe("CALLOUTS", () => {
  it("is the 3×3 grid in reading order", () => {
    expect(CALLOUTS).toEqual(["push", "up", "here", "left", "stop", "right", "wait", "down", "go"]);
  });
});
