// Pure and free of node imports, so the browser can import it as well as the
// server. The table it reads is built from USDA FoodKeeper by
// scripts/build-foodkeeper.ts (src/data/FOODKEEPER.md).

export type Measure = "fill" | "count" | "have";
export type Category =
  | "dairy"
  | "produce"
  | "grains"
  | "tins"
  | "meat"
  | "frozen"
  | "condiments"
  | "drinks"
  | "snacks"
  | "other";
export interface Guess {
  category: Category;
  measure: Measure;
  shelfDays: number | null;
  iconKey: string | null;
}
export interface GuessEntry {
  keywords: string[];
  category: Category;
  measure: Measure;
  shelfDays: number | null;
  iconKey: string | null;
}
export type GuessTable = GuessEntry[];

const IRREGULAR: Record<string, string> = { loaves: "loaf", halves: "half", leaves: "leaf" };

function singular(word: string): string {
  const irregular = IRREGULAR[word];
  if (irregular) return irregular;
  if (word.length > 3 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && /(s|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("oes")) return word.slice(0, -2);
  if (word.endsWith("s") && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

// "  Soy  sauce! " -> "soy sauce"; "Eggs" -> "egg"; "Tomatoes" -> "tomato".
export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean)
    .map(singular)
    .join(" ");
}

const UNKNOWN: Guess = { category: "other", measure: "have", shelfDays: null, iconKey: null };

// Tries every run of words in the name, longest first, so "coconut milk" is
// not "milk". The first entry wins on a duplicate keyword. Anything unknown is
// a Have: the app never asks for a measure it can't guess.
export function makeGuesser(table: GuessTable): (name: string) => Guess {
  const byKeyword = new Map<string, GuessEntry>();
  for (const entry of table) {
    for (const keyword of entry.keywords) {
      const key = normaliseName(keyword);
      if (key && !byKeyword.has(key)) byKeyword.set(key, entry);
    }
  }
  return (name) => {
    const words = normaliseName(name).split(" ").filter(Boolean);
    for (let length = words.length; length >= 1; length--) {
      for (let start = 0; start + length <= words.length; start++) {
        const entry = byKeyword.get(words.slice(start, start + length).join(" "));
        if (entry) {
          const { category, measure, shelfDays, iconKey } = entry;
          return { category, measure, shelfDays, iconKey };
        }
      }
    }
    return { ...UNKNOWN };
  };
}
