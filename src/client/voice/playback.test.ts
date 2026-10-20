import { describe, expect, it } from "vitest";
import { parseFrame, percentile, schedule, WATCHER_LANE } from "./playback.ts";

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

describe("parseFrame", () => {
  const frame = (kind: number, id: number, bytes = 20): Uint8Array => {
    const buf = new Uint8Array(14 + bytes).fill(0xcd);
    const view = new DataView(buf.buffer);
    buf[0] = kind;
    buf[1] = id;
    view.setUint32(2, 7);
    view.setFloat64(6, 1234.5);
    return buf;
  };
  it("reads a player's frame (0x01) by seat", () => {
    expect(parseFrame(frame(1, 2))).toMatchObject({ lane: 2, seq: 7, captureServerMs: 1234.5 });
  });
  it("reads a watcher's frame (0x02) into a lane of its own, apart from the seats", () => {
    const parsed = parseFrame(frame(2, 1));
    expect(parsed?.lane).toBe(WATCHER_LANE + 1);
    expect(WATCHER_LANE).toBeGreaterThan(2);
    expect(parsed?.opus.length).toBe(20);
  });
  it("drops a header with no audio after it, and any other first byte", () => {
    expect(parseFrame(new Uint8Array(14).fill(1))).toBeNull();
    expect(parseFrame(frame(3, 0))).toBeNull();
    expect(parseFrame(new Uint8Array(0))).toBeNull();
  });
});
