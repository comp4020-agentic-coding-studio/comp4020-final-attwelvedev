import { describe, expect, it } from "vitest";
import { homePath, revealPath, shotStem } from "./evidence.ts";

describe("evidence names", () => {
  it("keep each rotation's shot and perceived text apart", () => {
    expect(shotStem("deaf", 1280, "2", 1)).not.toBe(shotStem("deaf", 1280, "2", 2));
    expect(shotStem("deaf", 1280, "2", 0)).toBe("deaf-1280-r0-2");
  });

  it("keep each rotation's home and reveal apart", () => {
    expect(homePath(0, 1)).not.toBe(homePath(0, 2));
    expect(revealPath("01-first-steps", "blind", 1)).not.toBe(
      revealPath("01-first-steps", "blind", 2),
    );
  });
});
