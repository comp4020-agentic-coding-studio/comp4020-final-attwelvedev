import { describe, expect, it } from "vitest";
import { clockMatches } from "./roomEnd.ts";

describe("clockMatches", () => {
  it("is true within one second of the server's time", () => {
    expect(clockMatches("1:04", 64_400)).toBe(true);
    expect(clockMatches("1:05", 64_400)).toBe(true);
  });
  it("is false further off", () => {
    expect(clockMatches("1:06", 64_400)).toBe(false);
    expect(clockMatches("0:58", 64_400)).toBe(false);
  });
  it("is false for text that is not a time", () => {
    expect(clockMatches("soon", 64_400)).toBe(false);
  });
});
