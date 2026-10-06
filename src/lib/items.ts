import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Db, Tx } from "./db.ts";
import { NotFoundError, ValidationError } from "./errors.ts";
import { addDays, utcToday } from "./expiry.ts";
import type { Category, Measure } from "./guess.ts";
import { guessItem } from "./guessServer.ts";
import type { Session } from "./households.ts";
import { type OfferChange, withdrawOpenOffersForItem } from "./offers.ts";
import { history, items, members } from "./schema.ts";

export { NotFoundError, ValidationError };

export type Outcome = "used" | "binned" | "given";
// An item write, and what it did to the item's open offer for the endpoint to publish.
export interface ItemUpdate {
  item: Item;
  offerChanges: OfferChange[];
}

export type Unit = "g" | "kg" | "ml" | "L" | "count";
export const UNITS: readonly Unit[] = ["g", "kg", "ml", "L", "count"];

export interface Item {
  id: string;
  householdId: string;
  name: string;
  createdBy: string;
  createdAt: number;
  category: Category;
  iconKey: string | null;
  measure: Measure;
  fillStop: number; // 4 Full, 3 three quarters, 2 half, 1 a quarter, 0 Nearly out
  count: number;
  exactAmount: number | null;
  exactUnit: Unit | null;
  estimatedExpiry: string | null; // YYYY-MM-DD
  exactExpiry: string | null; // YYYY-MM-DD, wins over the estimate
  // who last set each group, and when; both null means Guessed, a time with no
  // member means the member has since left
  valueSetBy: string | null;
  valueSetAt: number | null;
  expirySetBy: string | null;
  expirySetAt: number | null;
}
export interface HistoryEntry {
  id: string;
  householdId: string;
  itemId: string;
  itemName: string;
  outcome: Outcome;
  memberId: string | null;
  memberName: string | null;
  at: number;
}

const MAX_NAME = 120;

// Newest first. Two things added in the same millisecond keep their insertion
// order, so ties fall back to rowid (qualified, because history joins members).
const newestFirst = (at: Parameters<typeof desc>[0], table: "items" | "history") => [
  desc(at),
  sql.raw(`"${table}".rowid desc`),
];

type ItemRow = typeof items.$inferSelect;

export function toItem(row: ItemRow): Item {
  return {
    id: row.id,
    householdId: row.householdId,
    name: row.name,
    createdBy: row.createdBy ?? "",
    createdAt: row.createdAt,
    category: row.category,
    iconKey: row.iconKey,
    measure: row.measure,
    fillStop: row.fillStop,
    count: row.count,
    exactAmount: row.exactAmount,
    exactUnit: row.exactUnit,
    estimatedExpiry: row.estimatedExpiry,
    exactExpiry: row.exactExpiry,
    valueSetBy: row.valueSetBy,
    valueSetAt: row.valueSetAt,
    expirySetBy: row.expirySetBy,
    expirySetAt: row.expirySetAt,
  };
}

// The one place an item row is made: its measure, category, icon and estimate
// come from the name's guess, counted from `today`. Nobody has set anything yet,
// so both attributions stay empty (Guessed).
export function insertItem(
  tx: Db | Tx,
  input: {
    householdId: string;
    createdBy: string | null;
    name: string;
    today: string;
    at?: number;
  },
): Item {
  const guess = guessItem(input.name);
  const row: ItemRow = {
    id: randomUUID(),
    householdId: input.householdId,
    name: input.name,
    createdBy: input.createdBy,
    createdAt: input.at ?? Date.now(),
    removedAt: null,
    category: guess.category,
    iconKey: guess.iconKey,
    measure: guess.measure,
    fillStop: 4,
    count: 1,
    exactAmount: null,
    exactUnit: null,
    estimatedExpiry: guess.shelfDays === null ? null : addDays(input.today, guess.shelfDays),
    exactExpiry: null,
    valueSetBy: null,
    valueSetAt: null,
    expirySetBy: null,
    expirySetAt: null,
    portionOf: null,
  };
  tx.insert(items).values(row).run();
  return toItem(row);
}

export function addItem(db: Db, session: Session, name: string, today = utcToday()): Item {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError("Name can't be blank.");
  if (trimmed.length > MAX_NAME) {
    throw new ValidationError(`Name must be ${MAX_NAME} characters or fewer.`);
  }
  return insertItem(db, {
    householdId: session.household.id,
    createdBy: session.member.id,
    name: trimmed,
    today,
  });
}

export function listPantry(db: Db, householdId: string): Item[] {
  return db
    .select()
    .from(items)
    .where(and(eq(items.householdId, householdId), isNull(items.removedAt)))
    .orderBy(...newestFirst(items.createdAt, "items"))
    .all()
    .map(toItem);
}

export function recordOutcome(
  db: Db,
  session: Session,
  itemId: string,
  outcome: "used" | "binned",
): HistoryEntry & { offerChanges: OfferChange[] } {
  return db.transaction((tx) => {
    const item = tx
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
    if (!item) throw new NotFoundError("No such item.");

    const entry: HistoryEntry = {
      id: randomUUID(),
      householdId: session.household.id,
      itemId: item.id,
      itemName: item.name,
      outcome,
      memberId: session.member.id,
      memberName: session.member.name,
      at: Date.now(),
    };
    tx.update(items).set({ removedAt: entry.at }).where(eq(items.id, item.id)).run();
    tx.insert(history)
      .values({
        id: entry.id,
        householdId: entry.householdId,
        itemId: entry.itemId,
        itemName: entry.itemName,
        outcome: entry.outcome,
        memberId: entry.memberId,
        at: entry.at,
      })
      .run();
    // an item that is used or binned is no longer on offer
    return { ...entry, offerChanges: withdrawOpenOffersForItem(tx, item.id) };
  });
}

export function undoOutcome(db: Db, session: Session, historyId: string): Item {
  return db.transaction((tx) => {
    const entry = tx
      .select()
      .from(history)
      .where(and(eq(history.id, historyId), eq(history.householdId, session.household.id)))
      .get();
    // a given item has left the house: Undo would bring back food a neighbour took
    if (!entry || entry.outcome === "given") throw new NotFoundError("No such record.");
    const item = tx.select().from(items).where(eq(items.id, entry.itemId)).get();
    if (!item) throw new NotFoundError("That item is gone.");

    tx.update(items).set({ removedAt: null }).where(eq(items.id, item.id)).run();
    tx.delete(history).where(eq(history.id, entry.id)).run();
    return toItem({ ...item, removedAt: null });
  });
}

export function listHistory(db: Db, householdId: string, filter?: Outcome): HistoryEntry[] {
  return db
    .select({ entry: history, memberName: members.name })
    .from(history)
    .leftJoin(members, eq(members.id, history.memberId))
    .where(
      filter
        ? and(eq(history.householdId, householdId), eq(history.outcome, filter))
        : eq(history.householdId, householdId),
    )
    .orderBy(...newestFirst(history.at, "history"))
    .all()
    .map(({ entry, memberName }) => ({ ...entry, memberName }));
}
