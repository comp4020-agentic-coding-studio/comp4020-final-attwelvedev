import { describe, expect, it } from "vitest";
import { percentile, schedule } from "./playback.ts";

describe("schedule", () => {
  it("puts the first frame after a 60 ms buffer, then frames back to back", () => {
    const first = schedule(80, 10, 0);
    expect(first.play).toBe(true);
    expect(first.at).toBeCloseTo(10.06);
    const second = schedule(80, 10.02, first.at + 0.06);
    expect(second.at).toBeCloseTo(10.12);
    const third = schedule(80, 10.04, second.at + 0.06);
    expect(third.at).toBeCloseTo(10.18);
  });
  it("drops a frame that is more than 300 ms late, and keeps one at exactly 300", () => {
    expect(schedule(301, 10, 0).play).toBe(false);
    expect(schedule(300, 10, 0).play).toBe(true);
  });
  it("after a gap, plays again after a fresh 60 ms buffer", () => {
    const resumed = schedule(80, 12, 10.5);
    expect(resumed.play).toBe(true);
    expect(resumed.at).toBeCloseTo(12.06);
  });
  it("drops a frame that would queue behind more than the buffer and two frames of audio", () => {
    expect(schedule(80, 10, 10.5).play).toBe(false);
    expect(schedule(80, 10, 10.17).play).toBe(true);
  });
  it("honours a different frame length", () => {
    expect(schedule(50, 5, 5.05, 20).at).toBeCloseTo(5.05);
  });
});

describe("percentile", () => {
  it("picks the p50 and p95 of a set", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(values, 50)).toBe(50);
    expect(percentile(values, 95)).toBe(95);
    expect(percentile([], 50)).toBe(0);
  });
});
