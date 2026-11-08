import { describe, expect, it } from "vitest";
import { INTRO_TOTAL, introAt } from "./intro.ts";

describe("the start of a room (FR14)", () => {
  it("hold: rise 0 for the first 300 ms", () => {
    for (const ms of [0, 150, 300]) {
      const f = introAt(ms, false);
      expect(f.rise, `${ms}`).toBe(0);
      expect(f.swoop).toBe(0);
      expect(f.done).toBe(false);
    }
    expect(introAt(310, false).rise).toBeGreaterThan(0);
  });

  it("the tilt finishes at 1200 ms; the swoop has not begun before it", () => {
    expect(introAt(1199, false).rise).toBeLessThan(1);
    expect(introAt(1200, false).rise).toBe(1);
    for (const ms of [300, 700, 1100, 1200]) expect(introAt(ms, false).swoop, `${ms}`).toBe(0);
  });

  it("the swoop runs 1200–2100, the land 2100–2400, done at 2400", () => {
    const mid = introAt(1650, false);
    expect(mid.swoop).toBeGreaterThan(0.4);
    expect(mid.swoop).toBeLessThan(0.6);
    expect(mid.land).toBe(0);
    expect(introAt(2100, false).swoop).toBe(1);
    expect(introAt(2100, false).land).toBe(0);
    expect(introAt(2250, false).land).toBeCloseTo(0.5, 6);
    expect(introAt(2399, false).done).toBe(false);
    const end = introAt(INTRO_TOTAL, false);
    expect(end).toEqual({ rise: 1, swoop: 1, land: 1, sunrise: 1, done: true });
  });

  it("reduced: rise and swoop are 1 at once, done at 600", () => {
    const first = introAt(0, true);
    expect(first.rise).toBe(1);
    expect(first.swoop).toBe(1);
    expect(first.done).toBe(false);
    expect(introAt(599, true).done).toBe(false);
    expect(introAt(600, true).done).toBe(true);
  });

  it("ms = 0 is done at once", () => {
    expect(introAt(0, false, 0)).toEqual({ rise: 1, swoop: 1, land: 1, sunrise: 1, done: true });
    expect(introAt(0, true, 0).done).toBe(true);
  });

  it("the sunrise: 0 through the hold, rising from the tilt's start to the swoop's end, never back", () => {
    for (const ms of [0, 150, 300]) expect(introAt(ms, false).sunrise, `${ms}`).toBe(0);
    expect(introAt(2100, false).sunrise).toBe(1);
    expect(introAt(INTRO_TOTAL, false).sunrise).toBe(1);
    const mid = introAt(1200, false).sunrise;
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
    let last = 0;
    for (let ms = 300; ms <= 2400; ms += 25) {
      const s = introAt(ms, false).sunrise;
      expect(s, `${ms}`).toBeGreaterThanOrEqual(last);
      last = s;
    }
  });

  it("reduced motion, or no hold: the room's colours at once", () => {
    expect(introAt(0, true).sunrise).toBe(1);
    expect(introAt(0, false, 0).sunrise).toBe(1);
  });

  it("is scaled to the server's hold: half the hold is half the timeline", () => {
    expect(introAt(600, false, 1200)).toEqual(introAt(1200, false));
  });
});
