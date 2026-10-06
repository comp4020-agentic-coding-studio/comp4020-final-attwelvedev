import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "./db.ts";
import { NotFoundError, ValidationError } from "./errors.ts";
import type { Session } from "./households.ts";
import { type OfferChange, withdrawOpenOffersForItem } from "./offers.ts";
import { history, items, members } from "./schema.ts";

export { NotFoundError, ValidationError };

export type Outcome = "used" | "binned" | "given";
export interface Item {
  id: string;
  householdId: string;
  name: string;
  createdBy: string;
  createdAt: number;
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

function toItem(row: ItemRow): Item {
  return {
    id: row.id,
    householdId: row.householdId,
    name: row.name,
    createdBy: row.createdBy ?? "",
    createdAt: row.createdAt,
  };
}

export function addItem(db: Db, session: Session, name: string): Item {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError("Name can't be blank.");
  if (trimmed.length > MAX_NAME) {
    throw new ValidationError(`Name must be ${MAX_NAME} characters or fewer.`);
  }
  const row: ItemRow = {
    id: randomUUID(),
    householdId: session.household.id,
    name: trimmed,
    createdBy: session.member.id,
    createdAt: Date.now(),
    removedAt: null,
  };
  db.insert(items).values(row).run();
  return toItem(row);
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
