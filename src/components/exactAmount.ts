import type { Unit } from "../lib/items.ts";

const UNIT_OF: Record<string, Unit> = { g: "g", kg: "kg", ml: "ml", l: "L", count: "count" };
const MAX = 1_000_000;

// "400 g", "400g", "1.5 L", "2" (a bare number is a count). Dot decimals only:
// "1,5" is refused rather than guessed. Pure, so the field's rules are unit-tested.
export function parseExact(text: string): { amount: number; unit: Unit } | null {
  const match = /^(\d+(?:\.\d+)?)\s*([a-z]*)$/i.exec(text.trim());
  if (!match) return null;
  const amount = Number(match[1]);
  if (!(amount > 0) || amount > MAX) return null;
  const word = match[2].toLowerCase();
  const unit = word === "" ? "count" : UNIT_OF[word];
  return unit ? { amount, unit } : null;
}
