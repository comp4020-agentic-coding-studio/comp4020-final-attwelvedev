import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildTable, shrink } from "./foodkeeperTable.ts";
import { type GuessEntry, makeGuesser } from "./guess.ts";

// The raw file is sheets of rows, each row an array of one-key objects.
const asRow = (fields: Record<string, unknown>) =>
  Object.entries(fields).map(([k, v]) => ({ [k]: v }));
const sheet = (name: string, rows: Record<string, unknown>[]) => ({ name, data: rows.map(asRow) });

// Rows copied from scripts/data/foodkeeper-en.json (only the columns that have a value).
const raw = {
  sheets: [
    sheet("Category", [
      { ID: 5, Category_Name: "Beverages", Subcategory_Name: null },
      { ID: 7, Category_Name: "Dairy Products & Eggs", Subcategory_Name: null },
      { ID: 8, Category_Name: "Food Purchased Frozen", Subcategory_Name: null },
      { ID: 18, Category_Name: "Produce", Subcategory_Name: "Fresh Fruits" },
      { ID: 23, Category_Name: "Shelf Stable Foods", Subcategory_Name: null },
    ]),
    sheet("Product", [
      {
        ID: 1,
        Category_ID: 7,
        Name: "Butter",
        DOP_Refrigerate_Min: 1,
        DOP_Refrigerate_Max: 2,
        DOP_Refrigerate_Metric: "Months",
      },
      {
        ID: 21,
        Category_ID: 7,
        Name: "Eggs",
        Name_subtitle: "in shell",
        DOP_Refrigerate_Min: 3,
        DOP_Refrigerate_Max: 5,
        DOP_Refrigerate_Metric: "Weeks",
      },
      {
        ID: 22,
        Category_ID: 7,
        Name: "Eggs",
        Name_subtitle: "raw whites, yolks",
        Refrigerate_Min: 2,
        Refrigerate_Max: 4,
        Refrigerate_Metric: "Days",
      },
      {
        ID: 27,
        Category_ID: 7,
        Name: "Milk",
        Name_subtitle: "plain or flavored",
        Refrigerate_Metric: "Package use-by date",
        DOP_Freeze_Min: 3,
        DOP_Freeze_Max: 3,
        DOP_Freeze_Metric: "Months",
      },
      {
        ID: 77,
        Category_ID: 8,
        Name: "Ice cream",
        Freeze_Min: 6,
        Freeze_Max: 6,
        Freeze_Metric: "Months",
      },
      {
        ID: 90,
        Category_ID: 18,
        Name: "Apples",
        Pantry_Min: 3,
        Pantry_Max: 3,
        Pantry_Metric: "Weeks",
        Refrigerate_Min: 4,
        Refrigerate_Max: 6,
        Refrigerate_Metric: "Weeks",
      },
      {
        ID: 100,
        Category_ID: 23,
        Name: "Cumin",
        DOP_Pantry_Min: 3,
        DOP_Pantry_Max: 4,
        DOP_Pantry_Metric: "Years",
      },
      {
        ID: 101,
        Category_ID: 18,
        Name: "Carrots, parsnips",
        Refrigerate_Min: 2,
        Refrigerate_Max: 3,
        Refrigerate_Metric: "Weeks",
      },
      {
        ID: 102,
        Category_ID: 5,
        Name: "Fresh juice",
        Pantry_Min: 8,
        Pantry_Max: 12,
        Pantry_Metric: "Hours",
      },
      { ID: 103, Category_ID: 23, Name: "Honey", Pantry_Metric: "Indefinitely" },
    ]),
  ],
};

const categoryMap = {
  Beverages: "drinks",
  "Dairy Products & Eggs": "dairy",
  "Food Purchased Frozen": "frozen",
  Produce: "produce",
  "Shelf Stable Foods": "condiments",
} as const;
const none = { entries: [], categoryMap };

const find = (table: GuessEntry[], keyword: string) =>
  table.find((e) => e.keywords.includes(keyword));

describe("buildTable", () => {
  it("converts days, weeks, months and years to days, taking the minimum of the range", () => {
    const table = buildTable(raw, none);
    expect(find(table, "butter")?.shelfDays).toBe(30);
    expect(find(table, "apples")?.shelfDays).toBe(21);
    expect(find(table, "cumin")?.shelfDays).toBe(3 * 365);
    expect(find(table, "ice cream")?.shelfDays).toBe(180);
  });

  it("is null when the file gives no usable value, and at least a day for hours", () => {
    const table = buildTable(raw, none);
    expect(find(table, "milk")?.shelfDays).toBeNull();
    expect(find(table, "honey")?.shelfDays).toBeNull();
    expect(find(table, "fresh juice")?.shelfDays).toBe(1);
  });

  it("uses the storage place that fits the category", () => {
    const table = buildTable(raw, none);
    expect(find(table, "butter")?.category).toBe("dairy");
    expect(find(table, "ice cream")?.category).toBe("frozen");
    // produce reads pantry before refrigerator, so apples is 3 weeks, not 4
    expect(find(table, "apples")?.shelfDays).toBe(21);
  });

  it("never gives a fridge category a freezer shelf life", () => {
    // Milk has only a freezer value in the file: it stays null
    expect(find(buildTable(raw, none), "milk")?.shelfDays).toBeNull();
  });

  it("gives each product one keyword per part of its name, and no icon key", () => {
    const carrots = find(buildTable(raw, none), "carrots");
    expect(carrots?.keywords).toEqual(["carrots", "parsnips"]);
    expect(carrots?.iconKey).toBeNull();
  });

  it("takes the first of several rows with one name that has a value", () => {
    const eggs = buildTable(raw, none).filter((e) => e.keywords.includes("eggs"));
    expect(eggs).toHaveLength(1);
    expect(eggs[0]?.shelfDays).toBe(21);
  });

  it("applies the measure rules by category", () => {
    const table = buildTable(raw, none);
    expect(find(table, "apples")?.measure).toBe("count");
    expect(find(table, "butter")?.measure).toBe("fill");
    expect(find(table, "cumin")?.measure).toBe("have");
  });

  it("lets an override replace the entry for the same keyword, and sit before the rest", () => {
    const override: GuessEntry = {
      keywords: ["eggs"],
      category: "dairy",
      measure: "count",
      shelfDays: 28,
      iconKey: "egg",
    };
    const table = buildTable(raw, { entries: [override], categoryMap });
    expect(table[0]).toEqual(override);
    expect(table.filter((e) => e.keywords.includes("eggs"))).toEqual([override]);
    expect(makeGuesser(table)("eggs").shelfDays).toBe(28);
  });

  it("names the category it cannot map", () => {
    const { Beverages: _drop, ...partial } = categoryMap;
    expect(() => buildTable(raw, { entries: [], categoryMap: partial })).toThrow(/Beverages/);
  });

  it("maps every category name in the real raw file", () => {
    const real = JSON.parse(readFileSync("scripts/data/foodkeeper-en.json", "utf-8"));
    const overrides = JSON.parse(readFileSync("src/data/keyword-overrides.json", "utf-8"));
    const names = new Set<string>();
    for (const row of real.sheets.find((s: { name: string }) => s.name === "Category").data) {
      for (const cell of row) if ("Category_Name" in cell) names.add(cell.Category_Name);
    }
    const unmapped = [...names].filter((n) => !(n in overrides.categoryMap));
    expect(unmapped).toEqual([]);
  });
});

describe("shrink", () => {
  const entry = (n: number, iconKey: string | null): GuessEntry => ({
    keywords: [`food number ${n} with a long enough name ${"x".repeat(n % 7)}`],
    category: "other",
    measure: "have",
    shelfDays: n,
    iconKey,
  });
  const table = [
    ...Array.from({ length: 5 }, (_, i) => entry(i, `icon-${i}`)),
    ...Array.from({ length: 800 }, (_, i) => entry(100 + i * 13, null)),
  ];
  const size = (t: GuessEntry[]) => gzipSync(JSON.stringify(t)).length;

  it("fits the budget, keeping overrides first and the original order", () => {
    const budget = 1500;
    expect(size(table)).toBeGreaterThan(budget);
    const small = shrink(table, budget);
    expect(size(small)).toBeLessThanOrEqual(budget);
    expect(small.slice(0, 5)).toEqual(table.slice(0, 5));
    const positions = small.map((e) => table.indexOf(e));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("returns the table unchanged when it already fits", () => {
    expect(shrink(table.slice(0, 5), 100_000)).toEqual(table.slice(0, 5));
  });

  it("drops entries without an icon key before any with one", () => {
    const tight = shrink(table, size(table.slice(0, 5)) + 10);
    expect(tight.slice(0, 5)).toEqual(table.slice(0, 5));
  });
});
