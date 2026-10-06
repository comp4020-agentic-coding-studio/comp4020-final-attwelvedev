import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { Db, Tx } from "./db.ts";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors.ts";
import type { Category, Measure } from "./guess.ts";
import type { Session } from "./households.ts";
import { type HistoryEntry, type Item, toItem, type Unit } from "./items.ts";
import {
  communities,
  communityHouseholds,
  history,
  households,
  items,
  offers,
  offerTargets,
} from "./schema.ts";

export type OfferStatus = "offered" | "claimed" | "collected" | "withdrawn";

// What an item is, for the neighbours and the claimer: its amount and dates,
// never who said so (no valueSetBy or expirySetBy, no member id).
export interface OfferValue {
  category: Category;
  iconKey: string | null;
  measure: Measure;
  fillStop: number;
  count: number;
  exactAmount: number | null;
  exactUnit: Unit | null;
  estimatedExpiry: string | null;
  exactExpiry: string | null;
}

// What a neighbour sees: no note, no claimer, no id of the offering household.
export interface PublicOffer {
  id: string;
  itemName: string;
  fromName: string;
  communityIds: string[];
  createdAt: number;
  value: OfferValue;
}
// The offerer's view. It carries the offer's own note so the household can read
// and edit it per item; no neighbour's view ever does.
export interface MyOffer {
  id: string;
  itemId: string;
  itemName: string;
  note: string;
  status: OfferStatus;
  claimedBy: string | null; // the claimer's display name
  claimedAt: number | null;
  communityIds: string[];
  createdAt: number;
}
// The claimer's view: the only one that carries the pickup note.
export interface ClaimedOffer {
  id: string;
  itemName: string;
  fromName: string;
  note: string;
  status: "claimed" | "released" | "collected" | "withdrawn";
  claimedAt: number;
  value: OfferValue;
}
// Offer some made a new item from part of one: both rows as they now stand, for
// the household's own events.
export interface ItemSplit {
  remainder: Item;
  portion: Item;
  by: { id: string; name: string };
}
// A withdrawn portion folded back into its original, which now holds the sum.
export interface ItemMerge {
  portionId: string;
  remainder: Item;
}
// One change to one offer as a self-contained value, so its events can be built
// with no database read (a deleted household's offers are gone after the commit).
export interface OfferChange {
  kind: "posted" | "taken" | "closed" | "note" | "valued";
  offer: MyOffer; // the offerer's view after the change
  value: OfferValue; // what the item is, for the events neighbours and the claimer hear
  split: ItemSplit | null; // set when this offer was made from part of an item
  merge: ItemMerge | null; // set when withdrawing folded a portion back
  offererHouseholdId: string;
  communities: { id: string; fromName: string }[]; // where neighbours hear of it, in announce order
  claim: { householdId: string; offer: ClaimedOffer } | null; // the claim this change touched
}
export interface OffersSnapshot {
  communities: { id: string; name: string }[];
  incoming: PublicOffer[];
  mine: MyOffer[];
  claimed: ClaimedOffer[];
}
export interface Offering {
  communities: { id: string; name: string }[];
  defaultPickupNote: string | null;
  open: MyOffer[];
}

export const MAX_NOTE = 280;

type Reader = Db | Tx;
type Target = { id: string; fromName: string };
const OPEN = ["offered", "claimed"] as const;

interface OfferRow {
  id: string;
  itemId: string;
  itemName: string;
  householdId: string;
  pickupNote: string;
  status: OfferStatus;
  claimedByHouseholdId: string | null;
  claimedCommunityId: string | null;
  claimedAt: number | null;
  createdAt: number;
  category: Category;
  iconKey: string | null;
  measure: Measure;
  fillStop: number;
  count: number;
  exactAmount: number | null;
  exactUnit: Unit | null;
  estimatedExpiry: string | null;
  exactExpiry: string | null;
}

const offerColumns = {
  id: offers.id,
  itemId: offers.itemId,
  itemName: items.name,
  householdId: offers.householdId,
  pickupNote: offers.pickupNote,
  status: offers.status,
  claimedByHouseholdId: offers.claimedByHouseholdId,
  claimedCommunityId: offers.claimedCommunityId,
  claimedAt: offers.claimedAt,
  createdAt: offers.createdAt,
  category: items.category,
  iconKey: items.iconKey,
  measure: items.measure,
  fillStop: items.fillStop,
  count: items.count,
  exactAmount: items.exactAmount,
  exactUnit: items.exactUnit,
  estimatedExpiry: items.estimatedExpiry,
  exactExpiry: items.exactExpiry,
};

const offerValueOf = (row: OfferRow): OfferValue => ({
  category: row.category,
  iconKey: row.iconKey,
  measure: row.measure,
  fillStop: row.fillStop,
  count: row.count,
  exactAmount: row.exactAmount,
  exactUnit: row.exactUnit,
  estimatedExpiry: row.estimatedExpiry,
  exactExpiry: row.exactExpiry,
});

// Oldest community first, ties by id: the order events are announced in, and
// the order that decides which display name a neighbour sees.
const announceOrder = [asc(communities.createdAt), asc(communities.id)];

function readOffer(tx: Reader, offerId: string): OfferRow | undefined {
  return tx
    .select(offerColumns)
    .from(offers)
    .innerJoin(items, eq(items.id, offers.itemId))
    .where(eq(offers.id, offerId))
    .get();
}

function nameIn(tx: Reader, communityId: string | null, householdId: string): string | null {
  if (!communityId) return null;
  const row = tx
    .select({ name: communityHouseholds.displayName })
    .from(communityHouseholds)
    .where(
      and(
        eq(communityHouseholds.communityId, communityId),
        eq(communityHouseholds.householdId, householdId),
      ),
    )
    .get();
  return row?.name ?? null;
}

function targetsOf(tx: Reader, offer: { id: string; householdId: string }): Target[] {
  return tx
    .select({ id: communities.id, fromName: communityHouseholds.displayName })
    .from(offerTargets)
    .innerJoin(communities, eq(communities.id, offerTargets.communityId))
    .leftJoin(
      communityHouseholds,
      and(
        eq(communityHouseholds.communityId, offerTargets.communityId),
        eq(communityHouseholds.householdId, offer.householdId),
      ),
    )
    .where(eq(offerTargets.offerId, offer.id))
    .orderBy(...announceOrder)
    .all()
    .map((row) => ({ id: row.id, fromName: row.fromName ?? "" }));
}

function myOfferOf(tx: Reader, row: OfferRow, targets: Target[]): MyOffer {
  return {
    id: row.id,
    itemId: row.itemId,
    itemName: row.itemName,
    note: row.pickupNote,
    status: row.status,
    claimedBy: row.claimedByHouseholdId
      ? nameIn(tx, row.claimedCommunityId, row.claimedByHouseholdId)
      : null,
    claimedAt: row.claimedAt,
    communityIds: targets.map((t) => t.id),
    createdAt: row.createdAt,
  };
}

// The claimer's view of the offer as `row` stands, with the status to report.
function claimedOf(tx: Reader, row: OfferRow, status: ClaimedOffer["status"]): ClaimedOffer {
  return {
    id: row.id,
    itemName: row.itemName,
    fromName: nameIn(tx, row.claimedCommunityId, row.householdId) ?? "",
    note: row.pickupNote,
    status,
    claimedAt: row.claimedAt ?? 0,
    value: offerValueOf(row),
  };
}

function changeOf(
  tx: Reader,
  offerId: string,
  kind: OfferChange["kind"],
  extra: {
    communities?: Target[];
    claim?: OfferChange["claim"];
    split?: ItemSplit;
  } = {},
): OfferChange {
  const row = readOffer(tx, offerId);
  if (!row) throw new NotFoundError("No such offer.");
  const targets = targetsOf(tx, row);
  return {
    kind,
    offer: myOfferOf(tx, row, targets),
    value: offerValueOf(row),
    split: extra.split ?? null,
    merge: null,
    offererHouseholdId: row.householdId,
    communities: extra.communities ?? targets,
    claim: extra.claim ?? null,
  };
}

function cleanNote(raw: string): string {
  const note = raw.trim();
  if (!note) throw new ValidationError("Add a pickup note.");
  if (note.length > MAX_NOTE) {
    throw new ValidationError(`The pickup note must be ${MAX_NOTE} characters or fewer.`);
  }
  return note;
}

function communitiesOf(tx: Reader, householdId: string): { id: string; name: string }[] {
  return tx
    .select({ id: communities.id, name: communities.name })
    .from(communityHouseholds)
    .innerJoin(communities, eq(communities.id, communityHouseholds.communityId))
    .where(eq(communityHouseholds.householdId, householdId))
    .orderBy(...announceOrder)
    .all();
}

export function createOffer(
  db: Db,
  session: Session,
  input: { itemId: string; note?: string; communityIds?: string[]; portion?: number },
): OfferChange {
  return db.transaction((tx) => {
    const householdId = session.household.id;
    const item = tx
      .select()
      .from(items)
      .where(
        and(
          eq(items.id, input.itemId),
          eq(items.householdId, householdId),
          isNull(items.removedAt),
        ),
      )
      .get();
    if (!item) throw new NotFoundError("No such item.");
    const open = tx
      .select({ id: offers.id })
      .from(offers)
      .where(and(eq(offers.itemId, item.id), inArray(offers.status, [...OPEN])))
      .get();
    if (open) throw new ConflictError("Already offered.");

    const mine = communitiesOf(tx, householdId).map((c) => c.id);
    if (mine.length === 0) throw new ValidationError("Join a community first.");
    const asked = [...new Set(input.communityIds ?? [])];
    if (asked.some((id) => !mine.includes(id))) {
      throw new ValidationError("You can only offer to communities you are in.");
    }
    const targets = asked.length ? asked : mine;

    // Notes differ from item to item, so there is no silent fallback: the
    // posted note is required, and becomes the one the next offer starts from.
    const note = cleanNote(input.note ?? "");
    tx.update(households)
      .set({ defaultPickupNote: note })
      .where(eq(households.id, householdId))
      .run();

    // the split runs after every refusal above, so a refused offer never splits
    const split =
      input.portion === undefined ? undefined : splitItem(tx, session, item, input.portion);

    const id = randomUUID();
    tx.insert(offers)
      .values({
        id,
        itemId: split ? split.portion.id : item.id,
        householdId,
        pickupNote: note,
        status: "offered",
        createdAt: Date.now(),
      })
      .run();
    for (const communityId of targets)
      tx.insert(offerTargets).values({ offerId: id, communityId }).run();
    return changeOf(tx, id, "posted", { split });
  });
}

// Offer some: part of a count or fill item becomes its own item (a portion
// that carries the offer) and the original keeps the rest. Both rows are
// stamped as set by the offering member just now.
function splitItem(
  tx: Tx,
  session: Session,
  item: typeof items.$inferSelect,
  portion: number,
): ItemSplit {
  const whole = Number.isInteger(portion);
  let left: Partial<typeof items.$inferSelect>;
  let part: Partial<typeof items.$inferSelect>;
  if (item.measure === "count" && whole && portion >= 1 && portion <= item.count - 1) {
    left = { count: item.count - portion };
    part = { count: portion };
  } else if (
    item.measure === "fill" &&
    item.exactAmount === null &&
    whole &&
    portion >= 1 &&
    portion <= item.fillStop - 1
  ) {
    left = { fillStop: item.fillStop - portion };
    part = { fillStop: portion };
  } else {
    throw new ValidationError("That isn't an amount you can split off.");
  }
  const stamp = { valueSetBy: session.member.id, valueSetAt: Date.now() };
  tx.update(items)
    .set({ ...left, ...stamp })
    .where(eq(items.id, item.id))
    .run();
  const row = { ...item, id: randomUUID(), ...part, ...stamp, portionOf: item.id };
  tx.insert(items).values(row).run();
  return {
    remainder: toItem({ ...item, ...left, ...stamp }),
    portion: toItem(row),
    by: { id: session.member.id, name: session.member.name },
  };
}

// Withdrawing a portion's offer folds it back into the original when that is
// still sensible: the original is in the pantry with no offer of its own, both
// are counts or both fills with no exact amount, and the sum fits. Called after
// the offer's status is updated, and before nothing else deletes the portion
// row (its offer rows cascade), so the `closed` change is built first.
function mergePortionBack(tx: Tx, itemId: string): ItemMerge | null {
  const portion = tx.select().from(items).where(eq(items.id, itemId)).get();
  if (!portion || portion.removedAt !== null || portion.portionOf === null) return null;
  const original = tx.select().from(items).where(eq(items.id, portion.portionOf)).get();
  if (!original || original.removedAt !== null) return null;
  if (original.measure !== portion.measure) return null;
  if (original.exactAmount !== null || portion.exactAmount !== null) return null;
  const hasOffer = tx
    .select({ id: offers.id })
    .from(offers)
    .where(and(eq(offers.itemId, original.id), inArray(offers.status, [...OPEN])))
    .get();
  if (hasOffer) return null;

  let sum: Partial<typeof items.$inferSelect>;
  if (original.measure === "count" && original.count + portion.count <= 999) {
    sum = { count: original.count + portion.count };
  } else if (original.measure === "fill" && original.fillStop + portion.fillStop <= 4) {
    sum = { fillStop: original.fillStop + portion.fillStop };
  } else {
    return null;
  }
  tx.update(items).set(sum).where(eq(items.id, original.id)).run();
  tx.delete(items).where(eq(items.id, portion.id)).run();
  return { portionId: portion.id, remainder: toItem({ ...original, ...sum }) };
}

// The caller as a side of the offer: the offerer, the claimer, or neither
// (which reads as "no such offer").
function sideOf(row: OfferRow, session: Session): "offerer" | "claimer" {
  if (row.householdId === session.household.id) return "offerer";
  if (row.claimedByHouseholdId === session.household.id) return "claimer";
  throw new NotFoundError("No such offer.");
}

function requireOffer(tx: Reader, offerId: string): OfferRow {
  const row = readOffer(tx, offerId);
  if (!row) throw new NotFoundError("No such offer.");
  return row;
}

export function claimOffer(db: Db, session: Session, offerId: string): OfferChange {
  return db.transaction((tx) => {
    const row = readOffer(tx, offerId);
    const mine = communitiesOf(tx, session.household.id).map((c) => c.id);
    const shared =
      row && mine.length > 0
        ? tx
            .select({ id: communities.id })
            .from(offerTargets)
            .innerJoin(communities, eq(communities.id, offerTargets.communityId))
            .where(and(eq(offerTargets.offerId, row.id), inArray(offerTargets.communityId, mine)))
            .orderBy(...announceOrder)
            .all()
        : [];
    if (!row || shared.length === 0 || (row.status !== "offered" && row.status !== "claimed")) {
      throw new NotFoundError("No such offer.");
    }
    if (row.householdId === session.household.id) {
      throw new ForbiddenError("That's your own offer.");
    }
    const now = Date.now();
    const won = tx
      .update(offers)
      .set({
        status: "claimed",
        claimedByHouseholdId: session.household.id,
        claimedCommunityId: shared[0].id,
        claimedAt: now,
      })
      .where(
        and(
          eq(offers.id, offerId),
          eq(offers.status, "offered"),
          ne(offers.householdId, session.household.id),
        ),
      )
      .run();
    if (won.changes === 0) throw new ConflictError("Someone claimed this first.");
    const after = requireOffer(tx, offerId);
    return changeOf(tx, offerId, "taken", {
      claim: {
        householdId: session.household.id,
        offer: claimedOf(tx, after, "claimed"),
      },
    });
  });
}

function clearClaim(tx: Tx, offerId: string): void {
  tx.update(offers)
    .set({
      status: "offered",
      claimedByHouseholdId: null,
      claimedCommunityId: null,
      claimedAt: null,
    })
    .where(eq(offers.id, offerId))
    .run();
}

export function releaseOffer(db: Db, session: Session, offerId: string): OfferChange {
  return db.transaction((tx) => {
    const row = requireOffer(tx, offerId);
    sideOf(row, session);
    if (row.status !== "claimed" || !row.claimedByHouseholdId) {
      throw new ConflictError("That offer isn't claimed.");
    }
    const claim = {
      householdId: row.claimedByHouseholdId,
      offer: claimedOf(tx, row, "released"),
    };
    clearClaim(tx, offerId);
    return changeOf(tx, offerId, "posted", { claim });
  });
}

function withdrawRow(tx: Tx, row: OfferRow): OfferChange {
  const claim =
    row.status === "claimed" && row.claimedByHouseholdId
      ? { householdId: row.claimedByHouseholdId, offer: claimedOf(tx, row, "withdrawn") }
      : null;
  tx.update(offers).set({ status: "withdrawn" }).where(eq(offers.id, row.id)).run();
  return changeOf(tx, row.id, "closed", { claim });
}

export function withdrawOffer(db: Db, session: Session, offerId: string): OfferChange {
  return db.transaction((tx) => {
    const row = requireOffer(tx, offerId);
    if (sideOf(row, session) !== "offerer") {
      throw new ForbiddenError("Only the household that offered it can withdraw it.");
    }
    if (row.status !== "offered" && row.status !== "claimed") {
      throw new ConflictError("That offer is already closed.");
    }
    const change = withdrawRow(tx, row);
    const merge = mergePortionBack(tx, row.itemId);
    return merge ? { ...change, merge } : change;
  });
}

export function updateOfferNote(
  db: Db,
  session: Session,
  offerId: string,
  note: string,
): OfferChange {
  return db.transaction((tx) => {
    const row = requireOffer(tx, offerId);
    if (sideOf(row, session) !== "offerer") {
      throw new ForbiddenError("Only the household that offered it can change the note.");
    }
    const cleaned = cleanNote(note);
    if (row.status !== "offered" && row.status !== "claimed") {
      throw new ConflictError("That offer is already closed.");
    }
    tx.update(offers).set({ pickupNote: cleaned }).where(eq(offers.id, offerId)).run();
    const after = requireOffer(tx, offerId);
    const claim =
      after.status === "claimed" && after.claimedByHouseholdId
        ? { householdId: after.claimedByHouseholdId, offer: claimedOf(tx, after, "claimed") }
        : null;
    return changeOf(tx, offerId, "note", { communities: [], claim });
  });
}

export function collectOffer(
  db: Db,
  session: Session,
  offerId: string,
): { change: OfferChange; entry: HistoryEntry; byOfferer: boolean } {
  return db.transaction((tx) => {
    const row = requireOffer(tx, offerId);
    const byOfferer = sideOf(row, session) === "offerer";
    if (row.status !== "claimed" || !row.claimedByHouseholdId) {
      throw new ConflictError("That offer isn't claimed.");
    }
    const claim = {
      householdId: row.claimedByHouseholdId,
      offer: claimedOf(tx, row, "collected"),
    };
    const at = Date.now();
    // a neighbour's member id must never land in this household's history
    const memberId = byOfferer ? session.member.id : null;
    const entry: HistoryEntry = {
      id: randomUUID(),
      householdId: row.householdId,
      itemId: row.itemId,
      itemName: row.itemName,
      outcome: "given",
      memberId,
      memberName: byOfferer ? session.member.name : null,
      at,
    };
    tx.update(offers).set({ status: "collected" }).where(eq(offers.id, offerId)).run();
    tx.update(items).set({ removedAt: at }).where(eq(items.id, row.itemId)).run();
    tx.insert(history)
      .values({
        id: entry.id,
        householdId: entry.householdId,
        itemId: entry.itemId,
        itemName: entry.itemName,
        outcome: "given",
        memberId,
        at,
      })
      .run();
    return { change: changeOf(tx, offerId, "closed", { claim }), entry, byOfferer };
  });
}

export function setDefaultPickupNote(db: Db, session: Session, note: string): string {
  const cleaned = cleanNote(note);
  db.update(households)
    .set({ defaultPickupNote: cleaned })
    .where(eq(households.id, session.household.id))
    .run();
  return cleaned;
}

// Called by recordOutcome inside its transaction: an item that is used or
// binned is no longer on offer.
export function withdrawOpenOffersForItem(tx: Tx, itemId: string): OfferChange[] {
  return tx
    .select({ id: offers.id })
    .from(offers)
    .where(and(eq(offers.itemId, itemId), inArray(offers.status, [...OPEN])))
    .all()
    .map(({ id }) => withdrawRow(tx, requireOffer(tx, id)));
}

// Called by the item writers inside their transaction: what an open offer on
// the item now shows. A claimed offer is told to its claimer alone; the
// neighbours' copy is gone from their feed already.
export function valueChangesFor(tx: Tx, itemId: string): OfferChange[] {
  const open = tx
    .select({ id: offers.id })
    .from(offers)
    .where(and(eq(offers.itemId, itemId), inArray(offers.status, [...OPEN])))
    .get();
  if (!open) return [];
  const row = requireOffer(tx, open.id);
  if (row.status === "claimed" && row.claimedByHouseholdId) {
    const claim = {
      householdId: row.claimedByHouseholdId,
      offer: claimedOf(tx, row, "claimed"),
    };
    return [changeOf(tx, row.id, "valued", { communities: [], claim })];
  }
  return [changeOf(tx, row.id, "valued")];
}

// Called by leaving a community, before the household's membership row goes
// (its display name there is still needed). Covers the leaver's own open
// offers and the claims it made through that community.
export function retargetOnLeave(tx: Tx, householdId: string, communityId: string): OfferChange[] {
  const changes: OfferChange[] = [];

  const ownOffers = tx
    .select({ id: offers.id })
    .from(offers)
    .innerJoin(offerTargets, eq(offerTargets.offerId, offers.id))
    .where(
      and(
        eq(offers.householdId, householdId),
        inArray(offers.status, [...OPEN]),
        eq(offerTargets.communityId, communityId),
      ),
    )
    .orderBy(asc(offers.createdAt), sql`"offers".rowid asc`)
    .all();
  for (const { id } of ownOffers) {
    const row = requireOffer(tx, id);
    const left: Target = {
      id: communityId,
      fromName: nameIn(tx, communityId, householdId) ?? "",
    };
    const remaining = targetsOf(tx, row).filter((t) => t.id !== communityId);
    tx.delete(offerTargets)
      .where(and(eq(offerTargets.offerId, id), eq(offerTargets.communityId, communityId)))
      .run();
    if (remaining.length === 0) {
      const claim =
        row.status === "claimed" && row.claimedByHouseholdId
          ? { householdId: row.claimedByHouseholdId, offer: claimedOf(tx, row, "withdrawn") }
          : null;
      tx.update(offers).set({ status: "withdrawn" }).where(eq(offers.id, id)).run();
      const closed = changeOf(tx, id, "closed", { communities: [left], claim });
      const merge = mergePortionBack(tx, row.itemId);
      changes.push(merge ? { ...closed, merge } : closed);
    } else if (row.status === "claimed" && row.claimedCommunityId === communityId) {
      const claim = row.claimedByHouseholdId
        ? { householdId: row.claimedByHouseholdId, offer: claimedOf(tx, row, "released") }
        : null;
      clearClaim(tx, id);
      changes.push(changeOf(tx, id, "closed", { communities: [left], claim }));
      changes.push(changeOf(tx, id, "posted"));
    } else {
      changes.push(changeOf(tx, id, "closed", { communities: [left] }));
    }
  }

  const claimed = tx
    .select({ id: offers.id })
    .from(offers)
    .where(
      and(
        eq(offers.status, "claimed"),
        eq(offers.claimedByHouseholdId, householdId),
        eq(offers.claimedCommunityId, communityId),
      ),
    )
    .orderBy(asc(offers.createdAt), sql`"offers".rowid asc`)
    .all();
  for (const { id } of claimed) {
    const row = requireOffer(tx, id);
    const claim = { householdId, offer: claimedOf(tx, row, "released") };
    clearClaim(tx, id);
    changes.push(changeOf(tx, id, "posted", { claim }));
  }
  return changes;
}

const newestFirst = [desc(offers.createdAt), sql`"offers".rowid desc`];

function myOffersOf(tx: Reader, householdId: string): MyOffer[] {
  return tx
    .select(offerColumns)
    .from(offers)
    .innerJoin(items, eq(items.id, offers.itemId))
    .where(and(eq(offers.householdId, householdId), inArray(offers.status, [...OPEN])))
    .orderBy(...newestFirst)
    .all()
    .map((row) => myOfferOf(tx, row, targetsOf(tx, row)));
}

export function offersSnapshotFor(db: Db, session: Session): OffersSnapshot {
  const householdId = session.household.id;
  const mineCommunities = communitiesOf(db, householdId);
  const myIds = mineCommunities.map((c) => c.id);

  const incoming: PublicOffer[] = [];
  if (myIds.length > 0) {
    const open = db
      .select(offerColumns)
      .from(offers)
      .innerJoin(items, eq(items.id, offers.itemId))
      .where(
        and(
          eq(offers.status, "offered"),
          ne(offers.householdId, householdId),
          inArray(
            offers.id,
            db
              .select({ id: offerTargets.offerId })
              .from(offerTargets)
              .where(inArray(offerTargets.communityId, myIds)),
          ),
        ),
      )
      .orderBy(...newestFirst)
      .all();
    for (const row of open) {
      const shared = targetsOf(db, row).filter((t) => myIds.includes(t.id));
      incoming.push({
        id: row.id,
        itemName: row.itemName,
        fromName: shared[0]?.fromName ?? "",
        communityIds: shared.map((t) => t.id),
        createdAt: row.createdAt,
        value: offerValueOf(row),
      });
    }
  }

  const claimed = db
    .select(offerColumns)
    .from(offers)
    .innerJoin(items, eq(items.id, offers.itemId))
    .where(and(eq(offers.status, "claimed"), eq(offers.claimedByHouseholdId, householdId)))
    .orderBy(desc(offers.claimedAt), sql`"offers".rowid desc`)
    .all()
    .map((row) => claimedOf(db, row, "claimed"));

  return { communities: mineCommunities, incoming, mine: myOffersOf(db, householdId), claimed };
}

export function offeringFor(db: Db, session: Session): Offering {
  const saved = db
    .select({ note: households.defaultPickupNote })
    .from(households)
    .where(eq(households.id, session.household.id))
    .get()?.note;
  return {
    communities: communitiesOf(db, session.household.id),
    defaultPickupNote: saved ?? null,
    open: myOffersOf(db, session.household.id),
  };
}
