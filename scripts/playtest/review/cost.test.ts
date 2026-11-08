import { describe, expect, it } from "vitest";
import type { ReviewItem } from "./collect.ts";
import { estimate, tally } from "./cost.ts";

const item = (role: ReviewItem["role"], width: number): ReviewItem => ({
  room: "r",
  beat: "1",
  role,
  width,
  perceived: "",
  prior: "",
});
// room 01: 3 blind, 3 deaf (the phone seat), 3 mute
const room01 = [
  ...[1, 2, 3].map(() => item("blind", 1280)),
  ...[1, 2, 3].map(() => item("deaf", 375)),
  ...[1, 2, 3].map(() => item("mute", 1280)),
];

describe("estimate", () => {
  it("matches the hand-computed figure for room 01 within 1%", () => {
    // blind: 1500*.2 + 1500*2 + 500*10 = 8300 micro$; phone: +400*2 = 9100; desktop: +1400*2 = 11100
    const hand = (3 * 8300 + 3 * 9100 + 3 * 11100) / 1e6;
    const e = estimate(room01, "claude-sonnet-5-5");
    expect(e.calls).toBe(9);
    expect(Math.abs((e.usd as number) - hand) / hand).toBeLessThan(0.01);
  });
  it("says unknown price for an unknown model, with the call count", () => {
    const e = estimate(room01, "mystery");
    expect(e.usd).toBeNull();
    expect(e.text).toContain("unknown price");
    expect(e.text).toContain("9 calls");
  });
});

describe("tally", () => {
  const model = "claude-sonnet-5-5";
  it("prices cache reads apart from input", () => {
    const a = tally([{ input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 }], model);
    const b = tally([{ input: 0, output: 0, cacheRead: 1_000_000, cacheWrite: 0 }], model);
    expect(a.usd).toBeCloseTo(2);
    expect(b.usd).toBeCloseTo(0.2);
  });
  it("prices output and gives null for an unknown model", () => {
    const u = { input: 0, output: 1_000_000, cacheRead: 0, cacheWrite: 0 };
    expect(tally([u], model).usd).toBeCloseTo(10);
    expect(tally([u], "mystery").usd).toBeNull();
  });
});
