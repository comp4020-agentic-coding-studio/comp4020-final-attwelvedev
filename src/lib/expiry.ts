// Pure and free of node imports, so the pantry island can use it too.
// Calendar dates are `YYYY-MM-DD` strings with no time zone: an item expires on
// a day, not at an instant.

export type Bucket = "past" | "use-soon" | "this-week" | "this-month" | "long-lasting" | "unknown";
// `past` is only ever read off a date, never chosen
export type SettableBucket = Exclude<Bucket, "past">;

// What choosing a bucket stores: a date in the middle of its range.
export const REPRESENTATIVE_DAYS: Record<Exclude<SettableBucket, "unknown">, number> = {
  "use-soon": 2,
  "this-week": 5,
  "this-month": 20,
  "long-lasting": 90,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;

const toUtcMs = (date: string): number => Date.parse(`${date}T00:00:00Z`);
const fromUtcMs = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_SHAPE.test(value)) return false;
  const ms = toUtcMs(value);
  // Date rolls 2026-02-30 over to March, so a real date reads back unchanged
  return !Number.isNaN(ms) && fromUtcMs(ms) === value;
}

export function addDays(date: string, days: number): string {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

// Whole days from `today` to `date`; negative once `date` has passed.
export function daysUntil(date: string, today: string): number {
  return Math.round((toUtcMs(date) - toUtcMs(today)) / DAY_MS);
}

// The exact date wins over the estimate when there is one.
export function bucketFor(estimated: string | null, exact: string | null, today: string): Bucket {
  const date = exact ?? estimated;
  if (!date) return "unknown";
  const d = daysUntil(date, today);
  if (d < 0) return "past";
  if (d <= 2) return "use-soon";
  if (d <= 7) return "this-week";
  if (d <= 31) return "this-month";
  return "long-lasting";
}

export function estimateFor(bucket: SettableBucket, today: string): string | null {
  return bucket === "unknown" ? null : addDays(today, REPRESENTATIVE_DAYS[bucket]);
}

export function utcToday(now: number = Date.now()): string {
  return fromUtcMs(now);
}

// "Today" comes from the viewer's clock, but a client can send anything. Every
// real time zone is within a day of UTC, so only a date that close is believed.
export function cleanToday(raw: unknown, now: number = Date.now()): string {
  const server = utcToday(now);
  if (!isCalendarDate(raw)) return server;
  return Math.abs(daysUntil(raw, server)) <= 1 ? raw : server;
}
