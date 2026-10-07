import { type Bucket, bucketFor, daysUntil } from "../lib/expiry.ts";
import type { Item } from "../lib/items.ts";
import { ago } from "./ago.ts";
import type { Row } from "./pantryState.ts";

// What the pantry list shows and in what order, with no DOM, so the rules
// (buckets, the tape, the words) are unit-tested and the components only draw.

export const BUCKET_ORDER: readonly Bucket[] = [
  "past",
  "use-soon",
  "this-week",
  "this-month",
  "long-lasting",
  "unknown",
];

export const BUCKET_LABEL: Record<Bucket, string> = {
  past: "Past estimate",
  "use-soon": "Use soon",
  "this-week": "This week",
  "this-month": "This month",
  "long-lasting": "Long-lasting",
  unknown: "Unknown",
};

export interface BucketGroup {
  bucket: Bucket;
  rows: Row[];
}

export const effectiveDate = (item: Item): string | null =>
  item.exactExpiry ?? item.estimatedExpiry;

export const bucketOf = (item: Item, today: string): Bucket =>
  bucketFor(item.estimatedExpiry, item.exactExpiry, today);

// Sooner first, then newest; a row added here and still pending leads its bucket.
// Unknown has no date, so it is newest first.
function compare(a: Row, b: Row): number {
  if (Boolean(a.pending) !== Boolean(b.pending)) return a.pending ? -1 : 1;
  const da = effectiveDate(a.item);
  const db = effectiveDate(b.item);
  if (da && db && da !== db) return da < db ? -1 : 1;
  return b.item.createdAt - a.item.createdAt;
}

export function groupRows(rows: Row[], today: string): BucketGroup[] {
  const byBucket = new Map<Bucket, Row[]>();
  for (const row of rows) {
    const bucket = bucketOf(row.item, today);
    byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), row]);
  }
  return BUCKET_ORDER.flatMap((bucket) => {
    const members = byBucket.get(bucket);
    return members ? [{ bucket, rows: [...members].sort(compare) }] : [];
  });
}

const FLOOR = 0.08;

// The share of shelf life left, a month or more being full; a stub once past.
export function tapeFraction(item: Item, today: string): number {
  const date = effectiveDate(item);
  if (!date) return 1;
  const days = daysUntil(date, today);
  if (days < 0) return FLOOR;
  return Math.max(FLOOR, Math.min(days, 30) / 30);
}

export function glyphLevel(item: Item): 0 | 1 | 2 | 3 | 4 | null {
  if (item.measure !== "fill" || item.exactAmount !== null) return null;
  return Math.min(4, Math.max(0, Math.round(item.fillStop))) as 0 | 1 | 2 | 3 | 4;
}

const STOP_TEXT = ["Nearly out", "¼", "½", "¾", "Full"];
const STOP_WORDS = ["nearly out", "quarter left", "half left", "three quarters left", "full"];

const amountText = (item: Item): string => {
  const amount = Number(item.exactAmount?.toFixed(3));
  return item.exactUnit === "count" ? `${amount}` : `${amount} ${item.exactUnit}`;
};

export function valueText(item: Item): string {
  if (item.exactAmount !== null) return `~${amountText(item)}`;
  if (item.measure === "fill") return STOP_TEXT[glyphLevel(item) ?? 4];
  if (item.measure === "count") return String(item.count);
  return "have";
}

function valueWords(item: Item): string | null {
  if (item.exactAmount !== null) return `about ${amountText(item)} left`;
  if (item.measure === "fill") return STOP_WORDS[glyphLevel(item) ?? 4];
  if (item.measure === "count") return `${item.count} left`;
  return null;
}

// "Spinach, quarter left, use soon": what a screen reader says for the row.
export function rowLabel(item: Item, today: string): string {
  return [item.name, valueWords(item), BUCKET_LABEL[bucketOf(item, today)].toLowerCase()]
    .filter(Boolean)
    .join(", ");
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// A calendar date has no time zone, so read it at noon UTC and take UTC parts:
// the day shown is the day stored wherever the viewer is.
export function dateText(date: string): string {
  const at = new Date(`${date}T12:00:00Z`);
  return `by ${WEEKDAYS[at.getUTCDay()]} ${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}`;
}

// The viewer's own date, from their clock's local parts.
export function localToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function attribution(
  group: "value" | "expiry",
  item: Item,
  members: { id: string; name: string }[],
  now: number,
): string {
  const at = group === "value" ? item.valueSetAt : item.expirySetAt;
  const by = group === "value" ? item.valueSetBy : item.expirySetBy;
  if (at === null) return "Guessed";
  const name = by ? members.find((m) => m.id === by)?.name : undefined;
  return `${name ?? "A former member"}'s estimate, ${ago(at, now)}`;
}
