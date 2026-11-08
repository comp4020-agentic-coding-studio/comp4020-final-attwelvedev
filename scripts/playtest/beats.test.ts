import { describe, expect, it } from "vitest";
import { freshBeats, nextShot } from "./beats.ts";

describe("beat shots", () => {
  it("shoots beat 1 on the first poll that finds it, and only once", () => {
    const [prev] = freshBeats(3) as [number];
    expect(nextShot(prev, 1)).toBe(true);
    expect(nextShot(1, 1)).toBe(false);
  });

  it("shoots nothing for a seat outside every beat", () => {
    for (const prev of freshBeats(3)) expect(nextShot(prev, 0)).toBe(false);
  });

  it("gives every seat its own start", () => {
    expect(freshBeats(3)).toHaveLength(3);
  });
});
