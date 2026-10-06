import { describe, expect, it } from "vitest";
import { openDb } from "./db.ts";
import { createHousehold, type Session } from "./households.ts";
import {
  addItem,
  listHistory,
  listPantry,
  NotFoundError,
  recordOutcome,
  undoOutcome,
  ValidationError,
} from "./items.ts";

function setup(memberName = "Sam") {
  const db = openDb(":memory:");
  const session: Session = createHousehold(db, { householdName: "Unit 4", memberName });
  return { db, session };
}

describe("addItem", () => {
  it("trims names", () => {
    const { db, session } = setup();
    expect(addItem(db, session, "  milk ").name).toBe("milk");
  });

  it.each([
    ["blank", "   "],
    ["over 120 chars", "x".repeat(121)],
  ])("rejects a %s name", (_label, name) => {
    const { db, session } = setup();
    expect(() => addItem(db, session, name)).toThrow(ValidationError);
  });

  it("accepts a name of exactly 120 chars", () => {
    const { db, session } = setup();
    expect(addItem(db, session, "x".repeat(120)).name).toHaveLength(120);
  });

  it("allows duplicates and lists both", () => {
    const { db, session } = setup();
    addItem(db, session, "Milk");
    addItem(db, session, "Milk");
    expect(listPantry(db, session.household.id).map((i) => i.name)).toEqual(["Milk", "Milk"]);
  });
});

describe("listPantry", () => {
  it("is newest first and excludes removed items", () => {
    const { db, session } = setup();
    const a = addItem(db, session, "a");
    addItem(db, session, "b");
    const c = addItem(db, session, "c");
    recordOutcome(db, session, a.id, "used");
    expect(listPantry(db, session.household.id).map((i) => i.name)).toEqual(["c", "b"]);
    expect(listPantry(db, session.household.id)[0].id).toBe(c.id);
  });

  it("only lists the household's own items", () => {
    const { db, session } = setup();
    addItem(db, session, "mine");
    const other = createHousehold(db, { householdName: "Other", memberName: "Kim" });
    expect(listPantry(db, other.household.id)).toEqual([]);
  });
});

describe("recordOutcome", () => {
  it("removes the item and returns an entry naming the member and item", () => {
    const { db, session } = setup("Sam");
    const item = addItem(db, session, "milk");
    const entry = recordOutcome(db, session, item.id, "binned");
    expect(entry).toMatchObject({
      householdId: session.household.id,
      itemId: item.id,
      itemName: "milk",
      outcome: "binned",
      memberId: session.member.id,
      memberName: "Sam",
    });
    expect(listPantry(db, session.household.id)).toEqual([]);
  });

  it("throws NotFoundError on a second outcome for the same item", () => {
    const { db, session } = setup();
    const item = addItem(db, session, "milk");
    recordOutcome(db, session, item.id, "used");
    expect(() => recordOutcome(db, session, item.id, "binned")).toThrow(NotFoundError);
  });

  it("throws NotFoundError for another household's item", () => {
    const { db, session } = setup();
    const item = addItem(db, session, "milk");
    const other = createHousehold(db, { householdName: "Other", memberName: "Kim" });
    expect(() => recordOutcome(db, other, item.id, "used")).toThrow(NotFoundError);
    expect(listPantry(db, session.household.id)).toHaveLength(1);
  });

  it("throws NotFoundError for an unknown item", () => {
    const { db, session } = setup();
    expect(() => recordOutcome(db, session, "nope", "used")).toThrow(NotFoundError);
  });
});

describe("undoOutcome", () => {
  it("restores the item and removes the history row", () => {
    const { db, session } = setup();
    const item = addItem(db, session, "milk");
    const entry = recordOutcome(db, session, item.id, "used");
    const restored = undoOutcome(db, session, entry.id);
    expect(restored.id).toBe(item.id);
    expect(listPantry(db, session.household.id).map((i) => i.id)).toEqual([item.id]);
    expect(listHistory(db, session.household.id)).toEqual([]);
  });

  it("throws NotFoundError when undone twice", () => {
    const { db, session } = setup();
    const entry = recordOutcome(db, session, addItem(db, session, "milk").id, "used");
    undoOutcome(db, session, entry.id);
    expect(() => undoOutcome(db, session, entry.id)).toThrow(NotFoundError);
  });

  it("throws NotFoundError for another household's entry, leaving it in place", () => {
    const { db, session } = setup();
    const entry = recordOutcome(db, session, addItem(db, session, "milk").id, "used");
    const other = createHousehold(db, { householdName: "Other", memberName: "Kim" });
    expect(() => undoOutcome(db, other, entry.id)).toThrow(NotFoundError);
    expect(listHistory(db, session.household.id)).toHaveLength(1);
  });
});

describe("listHistory", () => {
  it("filters by outcome and is newest first", () => {
    const { db, session } = setup();
    const a = addItem(db, session, "a");
    const b = addItem(db, session, "b");
    const c = addItem(db, session, "c");
    recordOutcome(db, session, a.id, "binned");
    recordOutcome(db, session, b.id, "used");
    recordOutcome(db, session, c.id, "binned");
    const id = session.household.id;
    expect(listHistory(db, id).map((h) => h.itemName)).toEqual(["c", "b", "a"]);
    expect(listHistory(db, id, "binned").map((h) => h.itemName)).toEqual(["c", "a"]);
    expect(listHistory(db, id, "used").map((h) => h.itemName)).toEqual(["b"]);
    expect(listHistory(db, id, "given")).toEqual([]);
  });

  it("carries the member name", () => {
    const { db, session } = setup("Sam");
    recordOutcome(db, session, addItem(db, session, "milk").id, "used");
    expect(listHistory(db, session.household.id)[0].memberName).toBe("Sam");
  });
});
