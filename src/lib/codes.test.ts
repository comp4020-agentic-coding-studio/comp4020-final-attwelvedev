import { describe, expect, it } from "vitest";
import { newCode, normaliseCode } from "./codes.ts";

describe("newCode", () => {
  it("makes a WORD-NN code", () => {
    expect(newCode(() => false)).toMatch(/^[A-Z]+-\d{2}$/);
  });

  it("keeps drawing until it finds one that isn't taken", () => {
    let tries = 0;
    const code = newCode(() => ++tries < 5);
    expect(tries).toBe(5);
    expect(code).toMatch(/^[A-Z]+-\d{2}$/);
  });
});

describe("normaliseCode", () => {
  it("treats case, spaces and separators as the same code", () => {
    expect(normaliseCode(" kettle 42 ")).toBe("KETTLE-42");
    expect(normaliseCode("KETTLE-42")).toBe("KETTLE-42");
    expect(normaliseCode("kettle_42")).toBe("KETTLE-42");
  });
});
