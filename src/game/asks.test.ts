import { describe, expect, it } from "vitest";
import { ASK_COPY, type AskClock, REASK_MS, reaskDue } from "./asks.ts";

const NEVER = Number.NEGATIVE_INFINITY;
const clock = (over: Partial<AskClock> = {}): AskClock => ({
  firstAt: 0,
  lastAt: 0,
  count: 1,
  progressAt: NEVER,
  ...over,
});

// Run the clock in 50 ms steps and say when it fires.
function firings(opts: {
  until: number;
  spot?: (t: number) => boolean;
  heard?: (t: number) => number;
  progress?: number[];
}) {
  const c = clock();
  const at: number[] = [0];
  for (let t = 50; t <= opts.until; t += 50) {
    if (opts.progress?.includes(t)) c.progressAt = t;
    if (reaskDue(c, t, opts.heard?.(t) ?? NEVER, opts.spot?.(t) ?? false)) {
      c.lastAt = t;
      c.count++;
      at.push(t / 1000);
    }
  }
  return at.map((x) => (x === 0 ? 0 : x));
}

describe("the ask clock (BT3)", () => {
  it("asks at 0, 8, 24, 54 and 84 s with no progress, no spot and no messages", () => {
    expect(REASK_MS).toEqual([8000, 16000, 30000]);
    expect(firings({ until: 90000 })).toEqual([0, 8, 24, 54, 84]);
  });

  it("progress resets the gap, counted from the later of the last ask and the last progress", () => {
    expect(firings({ until: 30000, progress: [5000] })).toEqual([0, 13, 29]);
  });

  it("holds while the person is at the spot, and asks as soon as they leave", () => {
    const at = firings({ until: 20000, spot: (t) => t < 15000 });
    expect(at).toEqual([0, 15]);
  });

  it("never lands within 2 s of a message the bot heard", () => {
    const c = clock();
    expect(reaskDue(c, 8000, 7000, false)).toBe(false);
    expect(reaskDue(c, 8000, 6000, false)).toBe(true);
  });
});

describe("ask copy", () => {
  it("is non-empty and carries no digit and no game value in any form", () => {
    for (const [kind, c] of Object.entries(ASK_COPY)) {
      expect(c.say.length, kind).toBeGreaterThan(0);
      expect(c.say, kind).not.toMatch(/\d/);
    }
  });

  it("names the route wherever the person has to send something (Task 313)", () => {
    const route: Partial<Record<keyof typeof ASK_COPY, RegExp>> = {
      "stop-on-click": /wheel, Talk, Stop/,
      "read-plate": /Text/,
      "plate-first": /text/,
      "press-marked": /button/,
      "strike-marked": /bell/,
    };
    for (const [kind, re] of Object.entries(route))
      expect(ASK_COPY[kind as keyof typeof ASK_COPY].say, kind).toMatch(re as RegExp);
  });
});
