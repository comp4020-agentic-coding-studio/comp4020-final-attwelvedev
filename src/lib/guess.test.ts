import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { type GuessTable, makeGuesser, normaliseName } from "./guess.ts";

const CATEGORIES = [
  "dairy",
  "produce",
  "grains",
  "tins",
  "meat",
  "frozen",
  "condiments",
  "drinks",
  "snacks",
  "other",
];

describe("normaliseName", () => {
  it.each([
    ["Eggs ", "egg"],
    ["Tomatoes", "tomato"],
    ["BERRIES", "berry"],
    ["Loaves", "loaf"],
    ["hummus", "hummus"],
    ["  Soy  sauce! ", "soy sauce"],
    ["Cheese", "cheese"],
    ["peaches", "peach"],
    ["swiss", "swiss"],
    ["", ""],
  ])("%j -> %j", (input, expected) => {
    expect(normaliseName(input)).toBe(expected);
  });
});

const fixture: GuessTable = [
  { keywords: ["milk"], category: "dairy", measure: "fill", shelfDays: 7, iconKey: "milk" },
  { keywords: ["coconut milk"], category: "tins", measure: "fill", shelfDays: 700, iconKey: null },
  { keywords: ["eggs"], category: "dairy", measure: "count", shelfDays: 21, iconKey: "egg" },
  { keywords: ["milk", "cream"], category: "other", measure: "have", shelfDays: 1, iconKey: null },
];

describe("makeGuesser", () => {
  const guess = makeGuesser(fixture);

  it("takes the longest run of words, so coconut milk is not milk", () => {
    expect(guess("coconut milk").shelfDays).toBe(700);
    expect(guess("skim milk").iconKey).toBe("milk");
  });

  it("matches case and plural insensitively", () => {
    expect(guess("MILK").iconKey).toBe("milk");
    expect(guess("milks").iconKey).toBe("milk");
    expect(guess("Egg")).toEqual(guess("eggs"));
    expect(guess("Eggs").category).toBe("dairy");
  });

  it("guesses Have, other, no shelf life for anything unknown", () => {
    const unknown = { category: "other", measure: "have", shelfDays: null, iconKey: null };
    expect(guess("an unknown word")).toEqual(unknown);
    expect(guess("")).toEqual(unknown);
  });

  it("lets the first entry win on a duplicate keyword", () => {
    expect(guess("cream").iconKey).toBeNull();
    expect(guess("milk").shelfDays).toBe(7);
  });
});

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

describe("the generated tables", () => {
  const full = readJson<GuessTable>("src/data/foodkeeper.json");
  const client = readJson<GuessTable>("src/data/guess-client.json");
  const guess = makeGuesser(full);

  it("guesses the staples", () => {
    expect(guess("milk")).toMatchObject({ measure: "fill", category: "dairy" });
    expect(guess("eggs").measure).toBe("count");
    const cumin = guess("cumin");
    expect(cumin.measure).toBe("have");
    expect(cumin.shelfDays).toBeGreaterThanOrEqual(365);
    expect(guess("an unknown word")).toMatchObject({ measure: "have", shelfDays: null });
  });

  it("ignores case and plurals", () => {
    expect(guess("EGGS")).toEqual(guess("eggs"));
    expect(guess("Egg")).toEqual(guess("eggs"));
  });

  it("keeps the client table within 8 KB gzipped and guessing the same staples", () => {
    expect(gzipSync(JSON.stringify(client)).length).toBeLessThanOrEqual(8 * 1024);
    const small = makeGuesser(client);
    for (const name of ["milk", "eggs", "cumin"]) expect(small(name)).toEqual(guess(name));
  });

  it("uses only slug icon keys and the ten categories", () => {
    for (const entry of [...full, ...client]) {
      expect(CATEGORIES).toContain(entry.category);
      if (entry.iconKey !== null) expect(entry.iconKey).toMatch(/^[a-z0-9-]+$/);
    }
  });
});
