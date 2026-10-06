import { gzipSync } from "node:zlib";
import {
  type Category,
  type GuessEntry,
  type GuessTable,
  type Measure,
  normaliseName,
} from "./guess.ts";

// Everything that depends on the shape of FoodKeeper's file lives here (see
// src/data/FOODKEEPER.md): sheets of rows, each row an array of one-key
// objects. If a future release changes a column, this is the one place to fix.

type Place = "Pantry" | "Refrigerate" | "Freeze";
type Row = Record<string, unknown>;

const UNIT_DAYS: Record<string, number> = {
  Days: 1,
  Weeks: 7,
  Months: 30,
  Year: 365,
  Years: 365,
};
// "Hours" rounds up to a day; "Indefinitely", "Not Recommended", "When Ripe"
// and "Package use-by date" say nothing a shelf life can be made from.
const HOURS = "Hours";

const MEASURE_BY_CATEGORY: Record<Category, Measure> = {
  produce: "count",
  dairy: "fill",
  drinks: "fill",
  grains: "fill",
  tins: "fill",
  meat: "fill",
  frozen: "fill",
  snacks: "fill",
  condiments: "have",
  other: "have",
};

// The unopened shelf life is read for the place the category is usually kept,
// in order. A fridge category never falls back to the freezer: months in the
// freezer must not become the shelf life of raw meat.
const PLACES: Record<Category, Place[]> = {
  dairy: ["Refrigerate", "Pantry"],
  meat: ["Refrigerate", "Pantry"],
  frozen: ["Freeze"],
  produce: ["Pantry", "Refrigerate"],
  grains: ["Pantry", "Refrigerate"],
  tins: ["Pantry", "Refrigerate"],
  condiments: ["Pantry", "Refrigerate"],
  drinks: ["Pantry", "Refrigerate"],
  snacks: ["Pantry", "Refrigerate"],
  other: ["Pantry", "Refrigerate"],
};

export interface Overrides {
  entries: GuessEntry[];
  categoryMap: Record<string, Category>;
}

function rowsOf(raw: unknown, sheetName: string): Row[] {
  const sheets = (raw as { sheets?: { name: string; data: Row[][] }[] }).sheets ?? [];
  const sheet = sheets.find((s) => s.name === sheetName);
  if (!sheet) throw new Error(`FoodKeeper file has no "${sheetName}" sheet`);
  return sheet.data.map((cells) => Object.assign({}, ...cells));
}

function toDays(min: unknown, max: unknown, metric: unknown): number | null {
  const value = typeof min === "number" ? min : typeof max === "number" ? max : null;
  if (value === null || typeof metric !== "string") return null;
  if (metric === HOURS) return Math.max(1, Math.ceil(value / 24));
  const unit = UNIT_DAYS[metric];
  return unit === undefined ? null : Math.round(value * unit);
}

function shelfDaysFor(row: Row, places: Place[]): number | null {
  for (const place of places) {
    for (const prefix of [place, `DOP_${place}`]) {
      const days = toDays(row[`${prefix}_Min`], row[`${prefix}_Max`], row[`${prefix}_Metric`]);
      if (days !== null) return days;
    }
  }
  return null;
}

// "Carrots, parsnips" -> two keywords; "Cake, brownie and bread mixes" -> three.
function nameParts(name: string): string[] {
  return name
    .split(/[,;/]|\band\b|\bor\b/i)
    .map((part) =>
      part
        .replace(/\(.*?\)/g, "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
}

export function buildTable(raw: unknown, overrides: Overrides): GuessTable {
  const categoryNames = new Map<number, string>();
  for (const row of rowsOf(raw, "Category")) {
    categoryNames.set(Number(row.ID), String(row.Category_Name));
  }

  // One entry per product name: the first row of that name with a shelf life,
  // else its first row. Rows of one name are listed with the usual form first.
  const byName = new Map<string, { row: Row; category: Category; shelfDays: number | null }>();
  for (const row of rowsOf(raw, "Product")) {
    const categoryName = categoryNames.get(Number(row.Category_ID));
    const category = categoryName === undefined ? undefined : overrides.categoryMap[categoryName];
    if (category === undefined) {
      throw new Error(`FoodKeeper category "${categoryName}" has no entry in categoryMap`);
    }
    const key = String(row.Name).trim().toLowerCase();
    const shelfDays = shelfDaysFor(row, PLACES[category]);
    const held = byName.get(key);
    if (!held) byName.set(key, { row, category, shelfDays });
    else if (held.shelfDays === null && shelfDays !== null) {
      byName.set(key, { row, category, shelfDays });
    }
  }

  // Overrides come first, and a keyword is claimed by whoever reaches it first,
  // so an override replaces the FoodKeeper entry for the same keyword.
  const claimed = new Set<string>();
  const table: GuessTable = [];
  const add = (entry: GuessEntry) => {
    const keywords = entry.keywords.filter((k) => {
      const key = normaliseName(k);
      if (!key || claimed.has(key)) return false;
      claimed.add(key);
      return true;
    });
    if (keywords.length) table.push({ ...entry, keywords });
  };
  for (const entry of overrides.entries) add(entry);
  for (const { row, category, shelfDays } of byName.values()) {
    add({
      keywords: nameParts(String(row.Name)),
      category,
      measure: MEASURE_BY_CATEGORY[category],
      shelfDays,
      iconKey: null,
    });
  }
  return table;
}

const gzipSize = (table: GuessTable): number => gzipSync(JSON.stringify(table)).length;

// Drops entries from the end until the gzipped JSON fits: first those with no
// icon key, then, only if that is not enough, those with one. Hand-written
// overrides carry icon keys and sit first, so they go last. Order is kept.
export function shrink(table: GuessTable, maxGzipBytes: number): GuessTable {
  const kept = [...table];
  for (const hasIcon of [false, true]) {
    for (let i = kept.length - 1; i >= 0 && gzipSize(kept) > maxGzipBytes; i--) {
      const entry = kept[i];
      if (entry && (entry.iconKey !== null) === hasIcon) kept.splice(i, 1);
    }
  }
  return kept;
}
