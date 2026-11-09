import { describe, expect, it } from "vitest";
import { hollowPlan } from "./hollowSound.ts";

describe("hollowPlan: the step on a cache dial's inspection plate", () => {
  const plan = hollowPlan();

  it("is a low drop with a ring above it that outlasts it", () => {
    const [drop, ring] = plan;
    expect(plan).toHaveLength(2);
    expect(drop?.to).toBeLessThan(drop?.from ?? 0);
    expect(drop?.from).toBeLessThan(300);
    expect(ring?.from).toBeGreaterThan(1000);
    expect((ring?.at ?? 0) + (ring?.secs ?? 0)).toBeGreaterThan(
      (drop?.at ?? 0) + (drop?.secs ?? 0),
    );
  });

  it("is not the dial's tick (a 2200 Hz square blip) or its tumbler (two triangle clicks, 260 to 420 Hz)", () => {
    for (const t of plan) {
      expect(t.type).not.toBe("square"); // the tick is a square wave
      expect(t.from).not.toBe(2200);
    }
    // the tumbler is triangle clicks of at most 0.07 s: nothing here is both
    expect(plan.some((t) => t.type === "triangle" && t.secs <= 0.07)).toBe(false);
    expect(Math.max(...plan.map((t) => t.secs))).toBeGreaterThan(0.07);
  });
});

import { tumblerPlan } from "./hollowSound.ts";

// The tumbler is the whole clue of a safe, and the user heard its caption but not the sound: two
// clicks of 0.07 s under the dial's own 2200 Hz tick. It has to last long enough to be heard over it
// and sound like nothing else.
describe("tumblerPlan: a pin dropping in the safe", () => {
  const plan = tumblerPlan();

  it("rings for at least a quarter of a second, well past the 0.025 s tick it lands beside", () => {
    const end = Math.max(...plan.map((t) => t.at + t.secs));
    expect(end).toBeGreaterThanOrEqual(0.25);
  });

  it("is lower than the tick and is not a square wave, so it is never mistaken for it", () => {
    for (const t of plan) {
      expect(t.type).not.toBe("square");
      expect(Math.max(t.from, t.to)).toBeLessThan(2200);
    }
  });

  it("is not the hollow step", () => {
    expect(JSON.stringify(plan)).not.toBe(JSON.stringify(hollowPlan()));
  });
});
