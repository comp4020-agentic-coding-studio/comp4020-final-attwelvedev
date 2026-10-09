import { describe, expect, it } from "vitest";
import { isAllowedName } from "./names.ts";

describe("isAllowedName", () => {
  it("allows ordinary nicknames and team names", () => {
    expect(isAllowedName("Ana")).toBe(true);
    expect(isAllowedName("Team Rocket")).toBe(true);
    expect(isAllowedName("The Fast Crew")).toBe(true);
  });

  it("blocks a word on the list, case-insensitively", () => {
    expect(isAllowedName("fuck")).toBe(false);
    expect(isAllowedName("FUCK")).toBe(false);
    expect(isAllowedName("FuCkFace")).toBe(false);
  });

  it("blocks a blocked word hidden with spacing or punctuation", () => {
    expect(isAllowedName("f u c k")).toBe(false);
    expect(isAllowedName("f.u.c.k")).toBe(false);
    expect(isAllowedName("f-u-c-k crew")).toBe(false);
  });
});
