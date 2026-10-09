import { describe, expect, it } from "vitest";
import { offsetFromPings } from "./clock.ts";

// A sample taken when the client's clock is `skew` ms behind the server's and the one-way trip is `trip` ms.
const sample = (at: number, skew: number, trip: number, extra = 0) => ({
  sent: at,
  serverAt: at + trip + skew + extra,
  received: at + 2 * trip,
});

describe("offsetFromPings", () => {
  it("is the server's clock minus the middle of the round trip", () => {
    expect(offsetFromPings([sample(1000, 500, 20)])).toBe(500);
  });
  it("ignores one outlier among the last five", () => {
    const samples = [sample(0, 500, 20), sample(2000, 500, 20), sample(4000, 500, 20)];
    samples.push(sample(6000, 500, 20, 900)); // a ping that sat in a queue
    samples.push(sample(8000, 500, 20));
    expect(offsetFromPings(samples)).toBe(500);
  });
  it("only counts the last five", () => {
    const old = [0, 1, 2, 3, 4].map((i) => sample(i * 2000, 0, 20));
    const recent = [5, 6, 7, 8, 9].map((i) => sample(i * 2000, 300, 20));
    expect(offsetFromPings([...old, ...recent])).toBe(300);
  });
  it("is null with no samples", () => {
    expect(offsetFromPings([])).toBeNull();
  });
});
