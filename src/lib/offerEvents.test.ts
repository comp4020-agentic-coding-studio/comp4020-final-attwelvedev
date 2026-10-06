import { describe, expect, it } from "vitest";
import { createCommunity, joinCommunityByCode } from "./communities.ts";
import { openDb } from "./db.ts";
import { createHousehold, type Session } from "./households.ts";
import { addItem } from "./items.ts";
import { collectedEvents, offerEvents } from "./offerEvents.ts";
import {
  claimOffer,
  collectOffer,
  createOffer,
  type MyOffer,
  type OfferChange,
  releaseOffer,
  updateOfferNote,
  withdrawOffer,
} from "./offers.ts";

const mine: MyOffer = {
  id: "o1",
  itemId: "i1",
  itemName: "milk",
  note: "Porch",
  status: "offered",
  claimedBy: null,
  claimedAt: null,
  communityIds: ["c1", "c2"],
  createdAt: 5,
};
const communities = [
  { id: "c1", fromName: "Unit 4" },
  { id: "c2", fromName: "Unit 4 · 2" },
];
const claim = {
  householdId: "hB",
  offer: {
    id: "o1",
    itemName: "milk",
    fromName: "Unit 4",
    note: "SECRET-NOTE",
    status: "claimed" as const,
    claimedAt: 9,
  },
};
const base = { offer: mine, offererHouseholdId: "hA", communities, claim: null };
const shape = (change: OfferChange) =>
  offerEvents(change).map((r) => `${r.channel} ${r.event.type}`);

describe("offerEvents: channels and order", () => {
  it("posted: offer.mine, then offer.posted per community in announce order", () => {
    expect(shape({ ...base, kind: "posted" })).toEqual([
      "household:hA offer.mine",
      "community:c1 offer.posted",
      "community:c2 offer.posted",
    ]);
  });

  it("posted with a released claim: offer.mine, offer.claim, then the community events", () => {
    expect(shape({ ...base, kind: "posted", claim })).toEqual([
      "household:hA offer.mine",
      "household:hB offer.claim",
      "community:c1 offer.posted",
      "community:c2 offer.posted",
    ]);
  });

  it("taken: offer.mine, offer.claim, then offer.taken per community", () => {
    expect(shape({ ...base, kind: "taken", claim })).toEqual([
      "household:hA offer.mine",
      "household:hB offer.claim",
      "community:c1 offer.taken",
      "community:c2 offer.taken",
    ]);
  });

  it("closed: offer.mine, offer.claim when a claim was touched, then offer.closed", () => {
    expect(shape({ ...base, kind: "closed" })).toEqual([
      "household:hA offer.mine",
      "community:c1 offer.closed",
      "community:c2 offer.closed",
    ]);
    expect(shape({ ...base, kind: "closed", claim })).toContain("household:hB offer.claim");
  });

  it("note: only the offerer and the claimer hear it", () => {
    expect(shape({ ...base, kind: "note", communities: [], claim })).toEqual([
      "household:hA offer.mine",
      "household:hB offer.claim",
    ]);
  });

  it("posts a community its own display name and only that community's id", () => {
    const posted = offerEvents({ ...base, kind: "posted" }).filter(
      (r) => r.event.type === "offer.posted",
    );
    expect(posted.map((r) => r.event)).toEqual([
      {
        type: "offer.posted",
        communityId: "c1",
        offer: {
          id: "o1",
          itemName: "milk",
          fromName: "Unit 4",
          communityIds: ["c1"],
          createdAt: 5,
        },
      },
      {
        type: "offer.posted",
        communityId: "c2",
        offer: {
          id: "o1",
          itemName: "milk",
          fromName: "Unit 4 · 2",
          communityIds: ["c2"],
          createdAt: 5,
        },
      },
    ]);
  });
});

describe("offerEvents: what never leaves where", () => {
  function flow() {
    const db = openDb(":memory:");
    const household = (name: string): Session =>
      createHousehold(db, { householdName: name, memberName: `${name} person` });
    const a = household("Unit 4");
    const b = household("Flat 2");
    const c = household("House 9");
    const x = createCommunity(db, a, "Elm Street");
    joinCommunityByCode(db, b, x.joinCode);
    joinCommunityByCode(db, c, x.joinCode);
    const item = addItem(db, a, "milk");
    const note = "UNIQUE-PICKUP-NOTE";
    const changes: OfferChange[] = [];
    const posted = createOffer(db, a, { itemId: item.id, note });
    changes.push(posted);
    const id = posted.offer.id;
    changes.push(claimOffer(db, b, id));
    changes.push(updateOfferNote(db, a, id, `${note} v2`));
    changes.push(releaseOffer(db, b, id));
    changes.push(claimOffer(db, b, id));
    changes.push(withdrawOffer(db, a, id));
    const item2 = addItem(db, a, "eggs");
    const second = createOffer(db, a, { itemId: item2.id, note });
    changes.push(second);
    claimOffer(db, c, second.offer.id);
    changes.push(collectOffer(db, c, second.offer.id).change);
    return { changes: changes.flatMap(offerEvents), a, b, c, note };
  }

  // The offering household may read its own note (the user wanted to view and
  // edit it per item); the claimer reads it too. No one else, and never a community.
  it("sends the note only to the offering household and the claiming household", () => {
    const { changes, a } = flow();
    const withNote = changes.filter((r) => JSON.stringify(r.event).includes("UNIQUE-PICKUP-NOTE"));
    expect(withNote.length).toBeGreaterThan(0);
    for (const r of withNote) {
      expect(r.channel).toMatch(/^household:/);
      if (r.event.type === "offer.mine") expect(r.channel).toBe(`household:${a.household.id}`);
      else {
        expect(r.event.type).toBe("offer.claim");
        expect(r.channel).not.toBe(`household:${a.household.id}`);
      }
    }
  });

  it("carries the offer's note in the offerer's offer.mine, including after an edit", () => {
    const { changes, a } = flow();
    const mineEvents = changes.filter((r) => r.event.type === "offer.mine");
    expect(mineEvents.every((r) => r.channel === `household:${a.household.id}`)).toBe(true);
    const notes = mineEvents.map((r) => (r.event.type === "offer.mine" ? r.event.offer.note : ""));
    expect(notes).toContain("UNIQUE-PICKUP-NOTE");
    expect(notes).toContain("UNIQUE-PICKUP-NOTE v2");
  });

  it("names the claimer's household only in the offerer's offer.mine", () => {
    const { changes, b, c } = flow();
    for (const r of changes) {
      for (const who of ["Flat 2", "House 9"]) {
        if (JSON.stringify(r.event).includes(who)) {
          expect(r.event.type).toBe("offer.mine");
          expect(r.channel).toMatch(/^household:/);
        }
      }
      if (r.channel.startsWith("community:")) {
        const text = JSON.stringify(r.event);
        for (const s of [b, c]) expect(text).not.toContain(s.household.id);
      }
    }
  });

  it("puts no household id of the offerer on a community channel, and no member name anywhere", () => {
    const { changes, a } = flow();
    for (const r of changes) {
      const text = JSON.stringify(r.event);
      if (r.channel.startsWith("community:")) expect(text).not.toContain(a.household.id);
      expect(text).not.toMatch(/ person/);
    }
  });

  it("gives community events only the offer id for taken and closed", () => {
    const { changes } = flow();
    for (const r of changes.filter((e) => /^offer\.(taken|closed)$/.test(e.event.type))) {
      expect(Object.keys(r.event).sort()).toEqual(["communityId", "offerId", "type"]);
    }
  });
});

describe("collectedEvents", () => {
  const entry = {
    id: "h1",
    householdId: "hA",
    itemId: "i1",
    itemName: "milk",
    outcome: "given" as const,
    memberId: "mA",
    memberName: "Sam",
    at: 7,
  };

  it("names the offerer's own member when the offerer collects", () => {
    expect(collectedEvents(entry, true)).toEqual([
      {
        channel: "household:hA",
        event: {
          type: "item.removed",
          itemId: "i1",
          itemName: "milk",
          outcome: "given",
          historyId: "h1",
          by: { id: "mA", name: "Sam" },
        },
      },
    ]);
  });

  it("says a neighbour collected, naming no one, when the claimer does", () => {
    const [routed] = collectedEvents({ ...entry, memberId: null, memberName: null }, false);
    expect(routed.channel).toBe("household:hA");
    expect(routed.event).toMatchObject({ by: { id: "", name: "a neighbour" } });
  });
});
