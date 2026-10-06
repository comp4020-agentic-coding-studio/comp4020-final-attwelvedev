import type { Db } from "./db.ts";
import type { Session } from "./households.ts";
import { listMembers } from "./households.ts";
import { type Item, listPantry } from "./items.ts";
import { type Offering, offeringFor } from "./offers.ts";

// Everything a pantry page needs to start from: what the island fetches on
// every stream open, so nothing that happened before the stream began is lost.
export interface Snapshot {
  household: { id: string; name: string };
  me: { id: string; name: string };
  members: { id: string; name: string }[]; // oldest first
  items: Item[]; // newest first
  offering: Offering;
}

export function snapshotFor(db: Db, session: Session): Snapshot {
  return {
    household: { id: session.household.id, name: session.household.name },
    me: { id: session.member.id, name: session.member.name },
    members: listMembers(db, session.household.id).map((m) => ({ id: m.id, name: m.name })),
    items: listPantry(db, session.household.id),
    offering: offeringFor(db, session),
  };
}
