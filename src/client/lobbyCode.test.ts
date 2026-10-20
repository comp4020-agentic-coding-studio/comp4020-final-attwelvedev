import { describe, expect, it } from "vitest";
import { codeLetters } from "./lobbyCode.ts";

describe("codeLetters", () => {
  it("upper-cases and keeps only letters a code can have", () => {
    expect(codeLetters("ab-cd")).toBe("ABCD");
    expect(codeLetters("a1 b2")).toBe("AB");
    expect(codeLetters("oil")).toBe(""); // read as 0, 1 and 1 across a room: never in a code
  });

  it("stops at a code's length", () => {
    expect(codeLetters("abcdef")).toBe("ABCD");
  });
});
