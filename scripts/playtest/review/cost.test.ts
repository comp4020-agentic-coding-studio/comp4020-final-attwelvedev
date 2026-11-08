import { describe, expect, it } from "vitest";
import type { ReviewItem } from "./collect.ts";
import { estimate, tally } from "./cost.ts";

const item = (role: ReviewItem["role"], width: number): ReviewItem => ({
  room: "r",
  beat: "1",
  role,
  width,
  rotation: 0,
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
  it("matches the measured room 01 tally within 15%", () => {
    // the six calls of review/playtest/2026-11-08T23-57 (blind at 375, deaf and mute at 1280,
    // beats start and 2): 6 calls cost $0.0734 (7666 in, 4183 written, 4183 read, 4678 out)
    const measured = 0.0734;
    const six = [
      ...[1, 2].map(() => item("blind", 375)),
      ...[1, 2].map(() => item("deaf", 1280)),
      ...[1, 2].map(() => item("mute", 1280)),
    ];
    const e = estimate(six, "claude-sonnet-5-5");
    expect(Math.abs((e.usd as number) - measured) / measured).toBeLessThan(0.15);
  });
  it("matches a hand-computed figure for 9 items within 1%", () => {
    // per role: one cache write and two reads of the 1394-token prefix, then text, image, output
    const role = (img: number) =>
      (1394 * 2.5 + 2 * 1394 * 0.2 + 3 * ((img + 700) * 2 + 780 * 10)) / 1e6;
    const hand = role(0) + role(260) + role(870);
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
