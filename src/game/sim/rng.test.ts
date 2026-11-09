import { describe, expect, it } from "vitest";
import { rng } from "./rng.ts";

describe("rng", () => {
  it("gives the same sequence for the same seed", () => {
    const a = rng(42);
    const b = rng(42);
    const xs = Array.from({ length: 20 }, () => a());
    expect(Array.from({ length: 20 }, () => b())).toEqual(xs);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("gives different sequences for different seeds", () => {
    const a = rng(1);
    const b = rng(2);
    expect(Array.from({ length: 5 }, () => a())).not.toEqual(Array.from({ length: 5 }, () => b()));
  });
});
