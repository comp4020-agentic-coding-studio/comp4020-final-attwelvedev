import { describe, expect, it } from "vitest";
import { CHIME_TICKS } from "../game/sim/chimes.ts";
import { TICK_MS } from "../game/sim/world.ts";
import type { SoundCue } from "../net/protocol.ts";
import { CHIME_GAP_S, chimePlan, isChimeCue } from "./chimeSound.ts";

// Task 36: a keypad key, a music-box bell and the earpiece each play as a GROUP of chimes, one more
// chime for each step up the scale, so the group's length is the note and can be counted by ear.
describe("chimePlan: what one chime cue sounds like", () => {
  it("plays n + 1 chimes for a note n, each higher than the one before", () => {
    for (const kind of ["key", "bellnote", "earpiece", "clue"] as const) {
      for (const n of [0, 1, 4, 8]) {
        const plan = chimePlan(kind, n);
        expect(plan, `${kind} ${n}`).toHaveLength(n + 1);
        for (let i = 1; i < plan.length; i++) {
          expect(plan[i]?.hz, `${kind} ${n} chime ${i} rises`).toBeGreaterThan(
            plan[i - 1]?.hz ?? 0,
          );
          expect(plan[i]?.at).toBeGreaterThan(plan[i - 1]?.at ?? 0);
        }
      }
    }
  });

  it("spaces the chimes of a group 200 ms apart, so they read as one group", () => {
    const plan = chimePlan("key", 3);
    for (const [i, c] of plan.entries()) expect(c.at).toBeCloseTo(i * 0.2, 9);
    expect(plan).toHaveLength(4);
  });

  it("starts every group on the same pitch, so a group of 3 and a group of 4 differ by the extra chime", () => {
    const three = chimePlan("bellnote", 2);
    const four = chimePlan("bellnote", 3);
    expect(four.slice(0, 3).map((c) => c.hz)).toEqual(three.map((c) => c.hz));
  });

  it("keeps the three voices apart: a key is a soft triangle, a bell rings, the earpiece is a plain sine", () => {
    expect(
      new Set([
        chimePlan("key", 0)[0]?.voice,
        chimePlan("bellnote", 0)[0]?.voice,
        chimePlan("earpiece", 0)[0]?.voice,
      ]).size,
    ).toBe(3);
  });

  it("makes a vent's clue a chime kind: seven is eight chimes rising, past the old cap of three", () => {
    expect(isChimeCue({ kind: "clue", n: 8 } as SoundCue)).toBe(true);
    const plan = chimePlan("clue", 7);
    expect(plan).toHaveLength(8);
    for (let i = 1; i < plan.length; i++) expect(plan[i]?.hz).toBeGreaterThan(plan[i - 1]?.hz ?? 0);
    // a vent is neither a key nor a bell
    const voice = (k: "key" | "bellnote" | "clue") => chimePlan(k, 0)[0];
    expect(`${voice("clue")?.voice}${voice("clue")?.hz}`).not.toBe(
      `${voice("key")?.voice}${voice("key")?.hz}`,
    );
    expect(voice("clue")?.voice).not.toBe(voice("bellnote")?.voice);
  });

  it("never plays fewer than one chime or more than nine, whatever it is sent", () => {
    expect(chimePlan("key", -3)).toHaveLength(1);
    expect(chimePlan("key", 99)).toHaveLength(9);
    expect(chimePlan("key", Number.NaN)).toHaveLength(1);
  });

  it("is quiet enough to count nine in a row: no chime louder than the last", () => {
    const plan = chimePlan("bellnote", 8);
    for (let i = 1; i < plan.length; i++)
      expect(plan[i]?.level).toBeLessThanOrEqual(plan[i - 1]?.level ?? 0);
  });

  it("repeats the simulation's chime spacing (the client may not import it)", () => {
    expect(CHIME_GAP_S).toBe((CHIME_TICKS * TICK_MS) / 1000);
  });
});
