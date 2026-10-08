import { describe, expect, it } from "vitest";
import { parseExact } from "./exactAmount.ts";

describe("parseExact", () => {
  it("reads an amount and its unit, spaced or not", () => {
    expect(parseExact("400 g")).toEqual({ amount: 400, unit: "g" });
    expect(parseExact("400g")).toEqual({ amount: 400, unit: "g" });
    expect(parseExact("1.5 L")).toEqual({ amount: 1.5, unit: "L" });
    expect(parseExact("  2 kg ")).toEqual({ amount: 2, unit: "kg" });
    expect(parseExact("250ml")).toEqual({ amount: 250, unit: "ml" });
  });

  it("takes the unit in any case, and l as litres", () => {
    expect(parseExact("1 l")).toEqual({ amount: 1, unit: "L" });
    expect(parseExact("3 KG")).toEqual({ amount: 3, unit: "kg" });
    expect(parseExact("500 ML")).toEqual({ amount: 500, unit: "ml" });
  });

  it("reads a bare number as a count", () => {
    expect(parseExact("2")).toEqual({ amount: 2, unit: "count" });
  });

  it("refuses what it cannot read as an amount", () => {
    expect(parseExact("1,5 l")).toBeNull(); // no comma decimals
    expect(parseExact("0")).toBeNull();
    expect(parseExact("-3 g")).toBeNull();
    expect(parseExact("1000001 g")).toBeNull();
    expect(parseExact("abc")).toBeNull();
    expect(parseExact("")).toBeNull();
    expect(parseExact("5 cups")).toBeNull();
  });
});
