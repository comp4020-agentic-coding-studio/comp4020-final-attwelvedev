import { describe, expect, it } from "vitest";
import {
  CALLOUTS,
  COOLDOWN_MS,
  type CooldownState,
  cleanText,
  FACES,
  type Outgoing,
  route,
} from "./channels.ts";
import { canReceive, canSend, type METHODS, ROLES, type Role, type Seat } from "./types.ts";

// seat 0 blind, seat 1 deaf, seat 2 mute
const roles: [Role, Role, Role] = ["blind", "deaf", "mute"];
const fresh = (): CooldownState => ({ until: {} });
const seatOf = (role: Role): Seat => roles.indexOf(role) as Seat;

const sample: Record<Exclude<(typeof METHODS)[number], "voice">, Outgoing> = {
  callout: { method: "callout", callout: "go" },
  text: { method: "text", text: "hi" },
  clip: { method: "clip", clip: "airhorn" },
  face: { method: "face", id: "f01" },
  mark: { method: "mark", id: "x", at: { x: 1.5, y: 1.5 } },
};

describe("route follows the send/receive table", () => {
  for (const role of ROLES) {
    for (const [name, msg] of Object.entries(sample)) {
      it(`${role} on ${name}`, () => {
        const result = route(roles, seatOf(role), msg, fresh(), 1000);
        if (!canSend(role, msg.method)) {
          expect(result).toEqual({ ok: false, code: "cant-send" });
          return;
        }
        const expected = ROLES.filter((r) => canReceive(r, msg.method) && r !== role).map(seatOf);
        expect(result.ok).toBe(true);
        if (result.ok) expect([...result.receivers].sort()).toEqual([...expected].sort());
      });
    }
  }

  it("never lists the sender among the receivers", () => {
    for (const role of ROLES) {
      for (const msg of Object.values(sample)) {
        const result = route(roles, seatOf(role), msg, fresh(), 0);
        if (result.ok) expect(result.receivers).not.toContain(seatOf(role));
      }
    }
  });

  it("sends Can't see's callout, text and face; refuses its clip and mark", () => {
    expect(route(roles, 0, sample.callout, fresh(), 0).ok).toBe(true);
    expect(route(roles, 0, sample.text, fresh(), 0).ok).toBe(true);
    expect(route(roles, 0, sample.face, fresh(), 0).ok).toBe(true);
    expect(route(roles, 0, sample.clip, fresh(), 0)).toEqual({ ok: false, code: "cant-send" });
    expect(route(roles, 0, sample.mark, fresh(), 0)).toEqual({ ok: false, code: "cant-send" });
  });

  it("sends Can't hear's face to Can't speak only", () => {
    const result = route(roles, 1, sample.face, fresh(), 0);
    expect(result.ok && result.receivers).toEqual([2]);
  });

  it("sends Can't speak's clip to Can't see only", () => {
    const result = route(roles, 2, sample.clip, fresh(), 0);
    expect(result.ok && result.receivers).toEqual([0]);
  });

  it("sends Can't hear's callout to Can't see and Can't speak", () => {
    const result = route(roles, 1, sample.callout, fresh(), 0);
    expect(result.ok && [...result.receivers].sort()).toEqual([0, 2]);
  });

  it("refuses text and callouts from Can't speak", () => {
    expect(route(roles, 2, sample.text, fresh(), 0)).toEqual({ ok: false, code: "cant-send" });
    expect(route(roles, 2, sample.callout, fresh(), 0)).toEqual({ ok: false, code: "cant-send" });
  });

  it("follows the roles it is given, not the seat numbers", () => {
    const rotated: [Role, Role, Role] = ["deaf", "mute", "blind"];
    const result = route(rotated, 0, sample.callout, fresh(), 0);
    expect(result.ok && [...result.receivers].sort()).toEqual([1, 2]);
  });
});

describe("cooldowns", () => {
  it("has the spec's constants", () => {
    expect(COOLDOWN_MS).toEqual({
      callout: 0,
      text: 0,
      voice: 0,
      clip: 3000,
      face: 1500,
      mark: 1000,
    });
  });

  it("refuses a second clip within 3 s and allows it after", () => {
    const cd = fresh();
    const first = route(roles, 2, sample.clip, cd, 10_000);
    expect(first.ok && first.until).toBe(13_000);
    if (first.ok && first.cooldownKey) cd.until[first.cooldownKey] = first.until;
    expect(route(roles, 2, sample.clip, cd, 12_999)).toEqual({
      ok: false,
      code: "cooldown",
      until: 13_000,
    });
    expect(route(roles, 2, sample.clip, cd, 13_000).ok).toBe(true);
  });

  it("is per sender", () => {
    const cd = fresh();
    const first = route(roles, 2, sample.clip, cd, 0);
    if (first.ok && first.cooldownKey) cd.until[first.cooldownKey] = first.until;
    expect(route(roles, 1, sample.clip, cd, 100).ok).toBe(true);
  });

  it("cools marks for 1 s, independently of faces", () => {
    const cd = fresh();
    const face = route(roles, 2, sample.face, cd, 0);
    if (face.ok && face.cooldownKey) cd.until[face.cooldownKey] = face.until;
    const m1 = route(roles, 2, sample.mark, cd, 100);
    expect(m1.ok && m1.until).toBe(100 + COOLDOWN_MS.mark);
    if (m1.ok && m1.cooldownKey) cd.until[m1.cooldownKey] = m1.until;
    expect(route(roles, 2, sample.mark, cd, 900)).toMatchObject({ ok: false, code: "cooldown" });
    expect(route(roles, 2, sample.mark, cd, 1100).ok).toBe(true);
    // a face is still cooling on its own clock
    expect(route(roles, 2, sample.face, cd, 1100)).toMatchObject({ ok: false, code: "cooldown" });
    expect(route(roles, 2, sample.face, cd, 1500).ok).toBe(true);
  });

  it("has no cooldown on callouts or text", () => {
    for (const msg of [sample.callout, sample.text]) {
      const first = route(roles, 0, msg, fresh(), 0);
      expect(first.ok && first.cooldownKey).toBeNull();
    }
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

describe("FACES", () => {
  it("is exactly f01 to f12, each with a file and a label", () => {
    expect(FACES.map((f) => f.id)).toEqual(
      Array.from({ length: 12 }, (_, i) => `f${String(i + 1).padStart(2, "0")}`),
    );
    for (const f of FACES) {
      expect(f.file).toMatch(/^[a-z-]+\.png$/);
      expect(f.label.length).toBeGreaterThan(0);
    }
    expect(new Set(FACES.map((f) => f.file)).size).toBe(12);
  });
});
