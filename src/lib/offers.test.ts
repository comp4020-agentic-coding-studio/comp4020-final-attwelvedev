import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  createCommunity,
  joinCommunityByCode,
  leaveCommunity,
  removeHouseholdFromCommunity,
} from "./communities.ts";
import { openDb } from "./db.ts";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors.ts";
import { createHousehold, removeMember, type Session } from "./households.ts";
import { addItem, listHistory, listPantry, recordOutcome, undoOutcome } from "./items.ts";
import {
  claimOffer,
  collectOffer,
  createOffer,
  MAX_NOTE,
  offeringFor,
  offersSnapshotFor,
  releaseOffer,
  setDefaultPickupNote,
  updateOfferNote,
  withdrawOffer,
} from "./offers.ts";
import { communities, households, offers } from "./schema.ts";

// A (Unit 4) offers to B (Flat 2) and C (House 9), who all share community X.
function setup() {
  const db = openDb(":memory:");
  const household = (name: string): Session =>
    createHousehold(db, { householdName: name, memberName: `${name} person` });
  const a = household("Unit 4");
  const b = household("Flat 2");
  const c = household("House 9");
  const x = createCommunity(db, a, "Elm Street");
  joinCommunityByCode(db, b, x.joinCode);
  joinCommunityByCode(db, c, x.joinCode);
  const milk = addItem(db, a, "milk");
  const offer = (note = "Porch, after 5") => createOffer(db, a, { itemId: milk.id, note });
  const created = (id: string, at: number) =>
    db.update(communities).set({ createdAt: at }).where(eq(communities.id, id)).run();
  const statusOf = (id: string) =>
    db.select({ status: offers.status }).from(offers).where(eq(offers.id, id)).get()?.status;
  return { db, household, a, b, c, x, milk, offer, created, statusOf };
}

describe("createOffer", () => {
  it("offers the whole item to every community of the household by default", () => {
    const { db, a, b, x, offer } = setup();
    const y = createCommunity(db, a, "Oak Lane");
    joinCommunityByCode(db, b, y.joinCode);
    const change = offer();
    expect(change.kind).toBe("posted");
    expect(change.communities.map((c) => c.id).sort()).toEqual([x.id, y.id].sort());
    expect(change.offer).toMatchObject({
      itemName: "milk",
      status: "offered",
      claimedBy: null,
      claimedAt: null,
    });
    expect([...change.offer.communityIds].sort()).toEqual([x.id, y.id].sort());
    expect(change.offererHouseholdId).toBe(a.household.id);
    expect(change.claim).toBeNull();
    expect(change.communities.every((c) => c.fromName === "Unit 4")).toBe(true);
  });

  it("offers to just the communities named", () => {
    const { db, a, milk } = setup();
    const y = createCommunity(db, a, "Oak Lane");
    const change = createOffer(db, a, { itemId: milk.id, note: "Porch", communityIds: [y.id] });
    expect(change.communities.map((c) => c.id)).toEqual([y.id]);
    expect(change.offer.communityIds).toEqual([y.id]);
  });

  it.each([
    ["an unknown community", () => ({ communityIds: ["nope"] }), "Porch"],
    [
      "a community the household is not in",
      (s: ReturnType<typeof setup>) => ({
        communityIds: [createCommunity(s.db, s.b, "Other").id],
      }),
      "Porch",
    ],
    ["a blank note with no default", () => ({}), "   "],
    ["a note over the limit", () => ({}), "x".repeat(MAX_NOTE + 1)],
  ])("rejects %s", (_, extra, note) => {
    const s = setup();
    expect(() => createOffer(s.db, s.a, { itemId: s.milk.id, note, ...extra(s) })).toThrow(
      ValidationError,
    );
  });

  it("asks a household in no community to join one first", () => {
    const { db, household } = setup();
    const lone = household("Lone");
    const item = addItem(db, lone, "rice");
    expect(() => createOffer(db, lone, { itemId: item.id, note: "Gate" })).toThrow(
      "Join a community first.",
    );
  });

  it("accepts a note of exactly the limit", () => {
    const { db, a, milk } = setup();
    expect(() => createOffer(db, a, { itemId: milk.id, note: "x".repeat(MAX_NOTE) })).not.toThrow();
  });

  it("does not offer another household's item or one already removed", () => {
    const { db, a, b, milk, offer } = setup();
    expect(() => createOffer(db, b, { itemId: milk.id, note: "Hi" })).toThrow(NotFoundError);
    recordOutcome(db, a, milk.id, "used");
    expect(() => offer()).toThrow(NotFoundError);
  });

  it("refuses a second open offer, and the database enforces it too", () => {
    const { db, a, milk, offer } = setup();
    const first = offer();
    expect(() => offer()).toThrow(ConflictError);
    expect(() =>
      db
        .insert(offers)
        .values({
          id: "dup",
          itemId: milk.id,
          householdId: a.household.id,
          pickupNote: "x",
          status: "offered",
          createdAt: 1,
        })
        .run(),
    ).toThrow(/UNIQUE/);
    // a closed offer no longer blocks a new one
    withdrawOffer(db, a, first.offer.id);
    expect(() => offer()).not.toThrow();
  });

  it("saves the first note as the household default and never replaces it", () => {
    const { db, a, milk } = setup();
    const defaultNote = () =>
      db.select().from(households).where(eq(households.id, a.household.id)).get()
        ?.defaultPickupNote;
    expect(defaultNote()).toBeNull();
    const first = createOffer(db, a, { itemId: milk.id, note: "  Porch, after 5 " });
    expect(defaultNote()).toBe("Porch, after 5");
    withdrawOffer(db, a, first.offer.id);
    createOffer(db, a, { itemId: milk.id, note: "Different" });
    expect(defaultNote()).toBe("Porch, after 5");
  });

  it("uses the default note when none is posted", () => {
    const { db, a, b, milk, offer } = setup();
    const first = offer("Porch, after 5");
    withdrawOffer(db, a, first.offer.id);
    const second = createOffer(db, a, { itemId: milk.id });
    const claim = claimOffer(db, b, second.offer.id);
    expect(claim.claim?.offer.note).toBe("Porch, after 5");
  });
});

describe("claimOffer", () => {
  it("lets one household win and tells the other it was beaten", () => {
    const { db, b, c, x, offer } = setup();
    const { offer: o } = offer("Porch, after 5");
    const won = claimOffer(db, b, o.id);
    expect(won.kind).toBe("taken");
    expect(won.offer).toMatchObject({ status: "claimed", claimedBy: "Flat 2" });
    expect(won.claim).toEqual({
      householdId: b.household.id,
      offer: {
        id: o.id,
        itemName: "milk",
        fromName: "Unit 4",
        note: "Porch, after 5",
        status: "claimed",
        claimedAt: expect.any(Number),
      },
    });
    expect(won.communities.map((cm) => cm.id)).toEqual([x.id]);
    expect(() => claimOffer(db, c, o.id)).toThrow("Someone claimed this first.");
    expect(() => claimOffer(db, c, o.id)).toThrow(ConflictError);
  });

  it("refuses to claim your own offer", () => {
    const { db, a, offer } = setup();
    expect(() => claimOffer(db, a, offer().offer.id)).toThrow(ForbiddenError);
  });

  it("does not show an offer to a household outside its communities", () => {
    const { db, household, offer } = setup();
    const outsider = household("Outsider");
    createCommunity(db, outsider, "Elsewhere");
    expect(() => claimOffer(db, outsider, offer().offer.id)).toThrow(NotFoundError);
    expect(() => claimOffer(db, outsider, "no-such-offer")).toThrow(NotFoundError);
  });

  it("does not claim an offer that has been withdrawn", () => {
    const { db, a, b, offer } = setup();
    const { offer: o } = offer();
    withdrawOffer(db, a, o.id);
    expect(() => claimOffer(db, b, o.id)).toThrow(NotFoundError);
  });

  it("records the first shared community, oldest first, as the one it went through", () => {
    const { db, a, b, x, created, offer } = setup();
    const y = createCommunity(db, a, "Oak Lane");
    joinCommunityByCode(db, b, y.joinCode);
    created(x.id, 2000);
    created(y.id, 1000);
    const { offer: o } = offer();
    claimOffer(db, b, o.id);
    const row = db.select().from(offers).where(eq(offers.id, o.id)).get();
    expect(row?.claimedCommunityId).toBe(y.id);
    expect(row?.claimedByHouseholdId).toBe(b.household.id);
  });
});

describe("releaseOffer", () => {
  it("returns a claimed offer to offered, from either side", () => {
    const { db, a, b, offer, statusOf } = setup();
    for (const side of [a, b]) {
      const { offer: o } = offer();
      claimOffer(db, b, o.id);
      const change = releaseOffer(db, side, o.id);
      expect(change.kind).toBe("posted");
      expect(change.offer).toMatchObject({ status: "offered", claimedBy: null, claimedAt: null });
      expect(change.claim).toEqual({
        householdId: b.household.id,
        offer: expect.objectContaining({ status: "released", note: "Porch, after 5" }),
      });
      expect(statusOf(o.id)).toBe("offered");
      withdrawOffer(db, a, o.id);
    }
  });

  it("is not for a household that is neither side, or for an unclaimed offer", () => {
    const { db, a, b, c, offer } = setup();
    const { offer: o } = offer();
    expect(() => releaseOffer(db, a, o.id)).toThrow(ConflictError);
    claimOffer(db, b, o.id);
    expect(() => releaseOffer(db, c, o.id)).toThrow(NotFoundError);
  });
});

describe("withdrawOffer", () => {
  it("is the offerer's alone, from offered or claimed", () => {
    const { db, a, b, offer, statusOf } = setup();
    const { offer: o } = offer();
    expect(withdrawOffer(db, a, o.id).offer.status).toBe("withdrawn");
    expect(statusOf(o.id)).toBe("withdrawn");

    const { offer: o2 } = offer();
    claimOffer(db, b, o2.id);
    expect(() => withdrawOffer(db, b, o2.id)).toThrow(ForbiddenError);
    const change = withdrawOffer(db, a, o2.id);
    expect(change.kind).toBe("closed");
    expect(change.claim).toEqual({
      householdId: b.household.id,
      offer: expect.objectContaining({ status: "withdrawn" }),
    });
  });

  it("refuses a closed offer, and a household that is neither side", () => {
    const { db, a, c, offer } = setup();
    const { offer: o } = offer();
    expect(() => withdrawOffer(db, c, o.id)).toThrow(NotFoundError);
    withdrawOffer(db, a, o.id);
    expect(() => withdrawOffer(db, a, o.id)).toThrow(ConflictError);
  });
});

describe("collectOffer", () => {
  it("removes the item and records a given entry with the offerer's member when they tap", () => {
    const { db, a, b, milk, offer } = setup();
    const { offer: o } = offer();
    claimOffer(db, b, o.id);
    const { change, entry, byOfferer } = collectOffer(db, a, o.id);
    expect(byOfferer).toBe(true);
    expect(change.kind).toBe("closed");
    expect(change.offer.status).toBe("collected");
    expect(change.claim?.offer.status).toBe("collected");
    expect(entry).toMatchObject({
      itemId: milk.id,
      outcome: "given",
      memberId: a.member.id,
      memberName: "Unit 4 person",
    });
    expect(listPantry(db, a.household.id)).toEqual([]);
    expect(listHistory(db, a.household.id, "given")).toHaveLength(1);
  });

  it("writes a null member when the claimer collects, so no neighbour's name is kept", () => {
    const { db, a, b, offer } = setup();
    const { offer: o } = offer();
    claimOffer(db, b, o.id);
    const { entry, byOfferer } = collectOffer(db, b, o.id);
    expect(byOfferer).toBe(false);
    expect(entry.memberId).toBeNull();
    expect(entry.memberName).toBeNull();
    const [row] = listHistory(db, a.household.id, "given");
    expect(row.memberId).toBeNull();
    expect(row.memberName).toBeNull();
    expect(JSON.stringify(listHistory(db, a.household.id))).not.toContain("Flat 2");
  });

  it("refuses an unclaimed offer, and a household that is neither side", () => {
    const { db, a, b, c, offer } = setup();
    const { offer: o } = offer();
    expect(() => collectOffer(db, a, o.id)).toThrow(ConflictError);
    expect(() => collectOffer(db, b, o.id)).toThrow(NotFoundError);
    claimOffer(db, b, o.id);
    expect(() => collectOffer(db, c, o.id)).toThrow(NotFoundError);
  });

  it("cannot be undone from history", () => {
    const { db, a, b, offer } = setup();
    const { offer: o } = offer();
    claimOffer(db, b, o.id);
    const { entry } = collectOffer(db, a, o.id);
    expect(() => undoOutcome(db, a, entry.id)).toThrow(NotFoundError);
    expect(listPantry(db, a.household.id)).toEqual([]);
  });
});

describe("recordOutcome and open offers", () => {
  it("withdraws an offered item, closing it over every target", () => {
    const { db, a, milk, x, offer, statusOf } = setup();
    const y = createCommunity(db, a, "Oak Lane");
    const { offer: o } = offer();
    const result = recordOutcome(db, a, milk.id, "used");
    expect(statusOf(o.id)).toBe("withdrawn");
    expect(result.offerChanges).toHaveLength(1);
    const [change] = result.offerChanges;
    expect(change.kind).toBe("closed");
    expect(change.offer.status).toBe("withdrawn");
    expect(change.communities.map((cm) => cm.id).sort()).toEqual([x.id, y.id].sort());
    expect(change.claim).toBeNull();
  });

  it("touches the claimer's claim as withdrawn for a claimed item", () => {
    const { db, a, b, milk, offer } = setup();
    const { offer: o } = offer();
    claimOffer(db, b, o.id);
    const { offerChanges } = recordOutcome(db, a, milk.id, "binned");
    expect(offerChanges[0].claim).toEqual({
      householdId: b.household.id,
      offer: expect.objectContaining({ id: o.id, status: "withdrawn" }),
    });
  });

  it("has no offer changes for an item that was never offered", () => {
    const { db, a, milk } = setup();
    expect(recordOutcome(db, a, milk.id, "used").offerChanges).toEqual([]);
  });
});

describe("leaving a community", () => {
  it("keeps an offer on its other communities and closes it on the one left", () => {
    const { db, a, x, offer, statusOf } = setup();
    const y = createCommunity(db, a, "Oak Lane");
    const { offer: o } = offer();
    const leave = leaveCommunity(db, a, x.id);
    expect(statusOf(o.id)).toBe("offered");
    expect(leave.offerChanges).toHaveLength(1);
    expect(leave.offerChanges[0]).toMatchObject({
      kind: "closed",
      offer: { status: "offered", communityIds: [y.id] },
      communities: [{ id: x.id, fromName: "Unit 4" }],
    });
  });

  it("withdraws an offer whose only community is the one left", () => {
    const { db, a, x, offer, statusOf } = setup();
    const { offer: o } = offer();
    const leave = leaveCommunity(db, a, x.id);
    expect(statusOf(o.id)).toBe("withdrawn");
    expect(leave.offerChanges[0]).toMatchObject({
      kind: "closed",
      offer: { status: "withdrawn", communityIds: [] },
      communities: [{ id: x.id, fromName: "Unit 4" }],
    });
  });

  it("releases a claim made through the community the offerer leaves, and re-posts the rest", () => {
    const { db, a, b, x, created, offer, statusOf } = setup();
    const y = createCommunity(db, a, "Oak Lane");
    joinCommunityByCode(db, b, y.joinCode);
    created(x.id, 1000);
    created(y.id, 2000);
    const { offer: o } = offer();
    claimOffer(db, b, o.id);
    const leave = leaveCommunity(db, a, x.id);
    expect(statusOf(o.id)).toBe("offered");
    const [closed, posted] = leave.offerChanges;
    expect(closed).toMatchObject({
      kind: "closed",
      communities: [{ id: x.id }],
      claim: { householdId: b.household.id, offer: { status: "released" } },
    });
    expect(posted).toMatchObject({
      kind: "posted",
      communities: [{ id: y.id, fromName: "Unit 4" }],
      offer: { status: "offered", claimedBy: null },
      claim: null,
    });
  });

  it("releases the leaver's own claims made through it", () => {
    const { db, a, b, x, offer, statusOf } = setup();
    const { offer: o } = offer();
    claimOffer(db, b, o.id);
    const leave = leaveCommunity(db, b, x.id);
    expect(statusOf(o.id)).toBe("offered");
    expect(leave.offerChanges).toHaveLength(1);
    expect(leave.offerChanges[0]).toMatchObject({
      kind: "posted",
      offererHouseholdId: a.household.id,
      offer: { status: "offered", claimedBy: null },
      communities: [{ id: x.id, fromName: "Unit 4" }],
      claim: { householdId: b.household.id, offer: { status: "released" } },
    });
  });

  it("keeps a claim made through a different community", () => {
    const { db, a, b, x, created, offer, statusOf } = setup();
    const y = createCommunity(db, a, "Oak Lane");
    joinCommunityByCode(db, b, y.joinCode);
    created(y.id, 1);
    created(x.id, 2);
    const { offer: o } = offer();
    claimOffer(db, b, o.id);
    const leave = leaveCommunity(db, b, x.id);
    expect(statusOf(o.id)).toBe("claimed");
    expect(leave.offerChanges).toEqual([]);
  });

  it("does the same when the creator removes a household", () => {
    const { db, a, b, x, statusOf } = setup();
    const eggs = addItem(db, b, "eggs");
    const { offer: o } = createOffer(db, b, { itemId: eggs.id, note: "Gate" });
    const leave = removeHouseholdFromCommunity(db, a, x.id, b.household.id);
    expect(statusOf(o.id)).toBe("withdrawn");
    expect(leave.offerChanges[0]).toMatchObject({
      kind: "closed",
      offererHouseholdId: b.household.id,
      offer: { status: "withdrawn" },
    });
  });

  it("returns complete withdrawals when a household is deleted with its last member", () => {
    const { db, a, x, offer } = setup();
    const { offer: o } = offer();
    const result = removeMember(db, a, a.member.id);
    expect(result.householdDeleted).toBe(true);
    expect(db.select().from(offers).where(eq(offers.id, o.id)).all()).toEqual([]);
    const changes = result.communityLeaves.flatMap((l) => l.offerChanges);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      kind: "closed",
      offererHouseholdId: a.household.id,
      offer: { id: o.id, itemName: "milk", status: "withdrawn" },
      communities: [{ id: x.id, fromName: "Unit 4" }],
    });
  });
});

describe("notes", () => {
  it("lets only the offerer edit a note, and tells a claimer the new text", () => {
    const { db, a, b, offer } = setup();
    const { offer: o } = offer("Old");
    claimOffer(db, b, o.id);
    expect(() => updateOfferNote(db, b, o.id, "Mine")).toThrow(ForbiddenError);
    const change = updateOfferNote(db, a, o.id, " New note ");
    expect(change.kind).toBe("note");
    expect(change.claim?.offer).toMatchObject({ note: "New note", status: "claimed" });
  });

  it("validates an edited note and refuses a closed offer", () => {
    const { db, a, offer } = setup();
    const { offer: o } = offer();
    expect(() => updateOfferNote(db, a, o.id, "  ")).toThrow(ValidationError);
    expect(() => updateOfferNote(db, a, o.id, "x".repeat(MAX_NOTE + 1))).toThrow(ValidationError);
    withdrawOffer(db, a, o.id);
    expect(() => updateOfferNote(db, a, o.id, "Late")).toThrow(ConflictError);
  });

  it("validates and trims the household default", () => {
    const { db, a } = setup();
    expect(setDefaultPickupNote(db, a, "  Gate 3 ")).toBe("Gate 3");
    expect(() => setDefaultPickupNote(db, a, " ")).toThrow(ValidationError);
    expect(() => setDefaultPickupNote(db, a, "x".repeat(MAX_NOTE + 1))).toThrow(ValidationError);
  });
});

describe("offersSnapshotFor", () => {
  it("lists neighbours' open offers once each, never my own, claimed, closed or unshared ones", () => {
    const { db, a, b, c, x, household, offer } = setup();
    const y = createCommunity(db, a, "Oak Lane");
    joinCommunityByCode(db, c, y.joinCode);
    const first = offer();
    // an offer of B's own, a claimed one, a withdrawn one and an unshared one
    const bItem = addItem(db, b, "eggs");
    createOffer(db, b, { itemId: bItem.id, note: "Gate" });
    const claimedItem = addItem(db, a, "bread");
    const claimed = createOffer(db, a, { itemId: claimedItem.id, note: "Porch" });
    claimOffer(db, c, claimed.offer.id);
    const goneItem = addItem(db, a, "jam");
    withdrawOffer(db, a, createOffer(db, a, { itemId: goneItem.id, note: "Porch" }).offer.id);
    const stranger = household("Stranger");
    const z = createCommunity(db, stranger, "Elsewhere");
    createOffer(db, stranger, {
      itemId: addItem(db, stranger, "tea").id,
      note: "Hi",
      communityIds: [z.id],
    });

    const forB = offersSnapshotFor(db, b);
    expect(forB.communities).toEqual([{ id: x.id, name: "Elm Street" }]);
    expect(forB.incoming.map((o) => o.itemName)).toEqual(["milk"]);
    expect(forB.incoming[0]).toEqual({
      id: first.offer.id,
      itemName: "milk",
      fromName: "Unit 4",
      communityIds: [x.id],
      createdAt: expect.any(Number),
    });

    const forC = offersSnapshotFor(db, c);
    const milkRow = forC.incoming.filter((o) => o.itemName === "milk");
    expect(milkRow).toHaveLength(1);
    expect([...milkRow[0].communityIds].sort()).toEqual([x.id, y.id].sort());
    expect(forC.claimed.map((o) => o.itemName)).toEqual(["bread"]);
    expect(forC.claimed[0]).toMatchObject({ note: "Porch", status: "claimed", fromName: "Unit 4" });

    const forA = offersSnapshotFor(db, a);
    expect(forA.incoming.map((o) => o.itemName)).toEqual(["eggs"]); // B's, never A's own
    expect(forA.mine.map((o) => o.itemName).sort()).toEqual(["bread", "milk"]);
    expect(forA.mine.find((o) => o.itemName === "bread")?.claimedBy).toBe("House 9");
  });

  it("shows a clash suffix in fromName", () => {
    const { db, household, x, c, a } = setup();
    const twin = household("Unit 4");
    joinCommunityByCode(db, twin, x.joinCode);
    const item = addItem(db, twin, "rice");
    createOffer(db, twin, { itemId: item.id, note: "Gate" });
    expect(offersSnapshotFor(db, c).incoming[0].fromName).toBe("Unit 4 · 2");
    expect(a.household.name).toBe("Unit 4");
  });

  it("lists newest offers first", () => {
    const { db, a, b, offer } = setup();
    offer();
    createOffer(db, a, { itemId: addItem(db, a, "eggs").id, note: "Porch" });
    expect(offersSnapshotFor(db, b).incoming.map((o) => o.itemName)).toEqual(["eggs", "milk"]);
  });
});

describe("offeringFor", () => {
  it("lists the communities, the default note and the open offers", () => {
    const { db, a, x, offer } = setup();
    const empty = offeringFor(db, a);
    expect(empty).toEqual({
      communities: [{ id: x.id, name: "Elm Street" }],
      defaultPickupNote: null,
      open: [],
    });
    const { offer: o } = offer("Porch");
    expect(offeringFor(db, a)).toMatchObject({ defaultPickupNote: "Porch", open: [{ id: o.id }] });
  });
});
