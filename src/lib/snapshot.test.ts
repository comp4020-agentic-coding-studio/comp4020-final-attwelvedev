import { describe, expect, it } from "vitest";
import { openDb } from "./db.ts";
import { createHousehold, createInviteLink, joinByLink } from "./households.ts";
import { addItem, recordOutcome } from "./items.ts";
import { snapshotFor } from "./snapshot.ts";

describe("snapshotFor", () => {
  it("returns the household, the caller, members oldest first and live items newest first", () => {
    const db = openDb(":memory:");
    const sam = createHousehold(db, { householdName: "Unit 4", memberName: "Sam" });
    const { token } = createInviteLink(db, sam);
    const alex = joinByLink(db, { token, memberName: "Alex" });
    addItem(db, sam, "milk");
    const eggs = addItem(db, alex, "eggs");
    const gone = addItem(db, sam, "bread");
    recordOutcome(db, sam, gone.id, "used");

    const snap = snapshotFor(db, alex);
    expect(snap.household).toEqual({ id: sam.household.id, name: "Unit 4" });
    expect(snap.me).toEqual({ id: alex.member.id, name: "Alex" });
    expect(snap.members.map((m) => m.name)).toEqual(["Sam", "Alex"]);
    expect(snap.items.map((i) => i.name)).toEqual(["eggs", "milk"]);
    expect(snap.items[0]).toEqual(eggs);
  });

  it("includes nothing from another household", () => {
    const db = openDb(":memory:");
    const sam = createHousehold(db, { householdName: "Unit 4", memberName: "Sam" });
    const zed = createHousehold(db, { householdName: "Other", memberName: "Zed" });
    addItem(db, zed, "secret tea");
    const snap = snapshotFor(db, sam);
    expect(snap.items).toEqual([]);
    expect(snap.members.map((m) => m.name)).toEqual(["Sam"]);
    expect(JSON.stringify(snap)).not.toContain("Zed");
  });
});
