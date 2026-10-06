import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "./db.ts";
import { estimateFor, isCalendarDate, type SettableBucket } from "./expiry.ts";
import type { Measure } from "./guess.ts";
import type { Session } from "./households.ts";
import {
  type ItemUpdate,
  NotFoundError,
  toItem,
  UNITS,
  type Unit,
  ValidationError,
} from "./items.ts";
import { valueChangesFor } from "./offers.ts";
import { items } from "./schema.ts";

// Writes to what an item is: its amount, its measure and its expiry. Each
// write replaces one group's columns and stamps who and when, unconditionally:
// the server applies writes in arrival order, so the latest one wins.

export type ValueChange =
  | { kind: "fill"; stop: number }
  | { kind: "count"; count: number }
  | { kind: "exact"; amount: number; unit: Unit }
  | { kind: "clearExact" };
export type ExpiryChange =
  | { kind: "bucket"; bucket: SettableBucket }
  | { kind: "date"; date: string }
  | { kind: "clearDate" };

const MAX_COUNT = 999;
const MAX_AMOUNT = 1_000_000;
const MIN_DATE = "2000-01-01";
const MAX_DATE = "2100-12-31";
const BUCKETS: readonly SettableBucket[] = [
  "use-soon",
  "this-week",
  "this-month",
  "long-lasting",
  "unknown",
];
const MEASURES: readonly Measure[] = ["fill", "count", "have"];

const text = (form: FormData, key: string): string | null => {
  const value = form.get(key);
  return typeof value === "string" ? value : null;
};

// a whole number in range; "1.5", "-1", "1e3" and "" are all refused
function wholeNumber(raw: string, min: number, max: number, what: string): number {
  const n = /^\d{1,6}$/.test(raw) ? Number(raw) : Number.NaN;
  if (!(n >= min && n <= max)) throw new ValidationError(`${what} must be ${min}–${max}.`);
  return n;
}

export function parseValueChange(form: FormData): ValueChange {
  const present = ["fillStop", "count", "exactAmount"].filter((key) => form.has(key));
  if (present.length !== 1) throw new ValidationError("Set one amount at a time.");
  if (present[0] === "fillStop") {
    return { kind: "fill", stop: wholeNumber(text(form, "fillStop") ?? "", 0, 4, "Fill") };
  }
  if (present[0] === "count") {
    return { kind: "count", count: wholeNumber(text(form, "count") ?? "", 1, MAX_COUNT, "Count") };
  }
  const raw = (text(form, "exactAmount") ?? "").trim();
  if (raw === "") return { kind: "clearExact" };
  const amount = /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : Number.NaN;
  if (!(amount > 0 && amount <= MAX_AMOUNT)) throw new ValidationError("That amount isn't valid.");
  const unit = text(form, "exactUnit");
  if (!UNITS.includes(unit as Unit)) throw new ValidationError("Pick a unit.");
  return { kind: "exact", amount, unit: unit as Unit };
}

export function parseExpiryChange(form: FormData): ExpiryChange {
  const present = ["bucket", "date", "clearDate"].filter((key) => form.has(key));
  if (present.length !== 1) throw new ValidationError("Set one expiry at a time.");
  if (present[0] === "bucket") {
    const bucket = text(form, "bucket");
    if (!BUCKETS.includes(bucket as SettableBucket)) throw new ValidationError("Pick a bucket.");
    return { kind: "bucket", bucket: bucket as SettableBucket };
  }
  if (present[0] === "date") {
    const date = text(form, "date");
    if (!isCalendarDate(date) || date < MIN_DATE || date > MAX_DATE) {
      throw new ValidationError("That date isn't valid.");
    }
    return { kind: "date", date };
  }
  return { kind: "clearDate" };
}

export function parseMeasure(form: FormData): Measure {
  const measure = text(form, "measure");
  if (!MEASURES.includes(measure as Measure)) throw new ValidationError("Pick a measure.");
  return measure as Measure;
}

type ItemRow = typeof items.$inferSelect;

// Reads the caller's own live item inside a transaction, applies `change` to
// the row it returns, and gives back the updated item.
function update(
  db: Db,
  session: Session,
  itemId: string,
  change: (row: ItemRow) => Partial<ItemRow>,
): ItemUpdate {
  return db.transaction((tx) => {
    const row = tx
      .select()
      .from(items)
      .where(
        and(
          eq(items.id, itemId),
          eq(items.householdId, session.household.id),
          isNull(items.removedAt),
        ),
      )
      .get();
    if (!row) throw new NotFoundError("No such item.");
    const set = change(row);
    tx.update(items).set(set).where(eq(items.id, row.id)).run();
    return { item: toItem({ ...row, ...set }), offerChanges: valueChangesFor(tx, row.id) };
  });
}

const valueStamp = (session: Session) => ({
  valueSetBy: session.member.id,
  valueSetAt: Date.now(),
});

export function setValue(
  db: Db,
  session: Session,
  itemId: string,
  change: ValueChange,
): ItemUpdate {
  return update(db, session, itemId, (row) => {
    const needs: Measure = change.kind === "count" ? "count" : "fill";
    if (row.measure !== needs)
      throw new ValidationError(`That item is measured by ${row.measure}.`);
    const stamp = valueStamp(session);
    switch (change.kind) {
      case "fill":
        return { fillStop: change.stop, exactAmount: null, exactUnit: null, ...stamp };
      case "count":
        return { count: change.count, ...stamp };
      case "exact":
        return { exactAmount: change.amount, exactUnit: change.unit, ...stamp };
      case "clearExact":
        return { exactAmount: null, exactUnit: null, ...stamp };
    }
  });
}

// The other measures' columns are kept, so switching back restores them.
export function setMeasure(db: Db, session: Session, itemId: string, measure: Measure): ItemUpdate {
  return update(db, session, itemId, () => ({ measure, ...valueStamp(session) }));
}

export function setExpiry(
  db: Db,
  session: Session,
  itemId: string,
  change: ExpiryChange,
  today: string,
): ItemUpdate {
  return update(db, session, itemId, () => {
    const stamp = { expirySetBy: session.member.id, expirySetAt: Date.now() };
    switch (change.kind) {
      case "bucket":
        return { estimatedExpiry: estimateFor(change.bucket, today), exactExpiry: null, ...stamp };
      case "date":
        return { exactExpiry: change.date, ...stamp };
      case "clearDate":
        return { exactExpiry: null, ...stamp };
    }
  });
}
