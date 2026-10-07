import { describe, expect, it } from "vitest";
import type { Guess } from "../lib/guess.ts";
import type { Item } from "../lib/items.ts";
import type { MyOffer } from "../lib/offers.ts";
import { testItem } from "../lib/testItem.ts";
import {
  type Action,
  initialState,
  type PantryState,
  pantryReducer,
  visibleRows,
} from "./pantryState.ts";

const item = (id: string, name: string, createdAt: number): Item =>
  testItem({ id, name, createdAt });
const milk = item("milk", "milk", 30);
const eggs = item("eggs", "eggs", 20);
const bread = item("bread", "bread", 10);

// the guess for a name nothing is known about, counted from a fixed day
const TODAY = "2026-10-07";
const NO_GUESS: Guess = { category: "other", measure: "have", shelfDays: null, iconKey: null };
const addTea = {
  type: "add.pending",
  rid: "r1",
  name: "tea",
  at: 40,
  guess: NO_GUESS,
  today: TODAY,
} as const;

const run = (state: PantryState, ...actions: Action[]) => actions.reduce(pantryReducer, state);
const names = (state: PantryState) => state.rows.map((r) => r.item.name);
const shown = (state: PantryState) => visibleRows(state).map((r) => r.item.name);

describe("snapshot", () => {
  it("sets the rows, newest first as given", () => {
    const s = run(initialState([]), { type: "snapshot", items: [milk, eggs] });
    expect(names(s)).toEqual(["milk", "eggs"]);
  });

  it("keeps pending rows and rows hidden by an optimistic remove", () => {
    let s = initialState([milk, eggs]);
    s = run(s, addTea, { type: "remove.pending", itemId: "eggs" });
    s = run(s, { type: "snapshot", items: [milk, eggs, bread] });
    expect(names(s)).toEqual(["tea", "milk", "eggs", "bread"]);
    expect(shown(s)).toEqual(["tea", "milk", "bread"]);
  });

  it("drops a row the server no longer has, unless it is pending", () => {
    const s = run(initialState([milk, eggs]), { type: "snapshot", items: [milk] });
    expect(names(s)).toEqual(["milk"]);
  });
});

describe("optimistic add", () => {
  it("builds the temporary item from the client's guess, counted from today", () => {
    const s = run(initialState([]), {
      ...addTea,
      name: "milk",
      guess: { measure: "fill", category: "dairy", shelfDays: 7, iconKey: "milk" },
    });
    expect(s.rows[0].item).toMatchObject({
      measure: "fill",
      category: "dairy",
      iconKey: "milk",
      estimatedExpiry: "2026-10-14",
      exactExpiry: null,
      valueSetAt: null,
      expirySetAt: null,
    });
  });

  it("builds the temporary item with neutral defaults", () => {
    const s = run(initialState([]), addTea);
    expect(s.rows[0].item).toEqual({
      id: "pending:r1",
      householdId: "",
      name: "tea",
      createdBy: "",
      createdAt: 40,
      category: "other",
      iconKey: null,
      measure: "have",
      fillStop: 4,
      count: 1,
      exactAmount: null,
      exactUnit: null,
      estimatedExpiry: null,
      exactExpiry: null,
      valueSetBy: null,
      valueSetAt: null,
      expirySetBy: null,
      expirySetAt: null,
    });
  });

  it("puts a pending row first, and confirming swaps it for the real item in place", () => {
    let s = run(initialState([milk]), addTea);
    expect(names(s)).toEqual(["tea", "milk"]);
    expect(s.rows[0].pending).toEqual({ rid: "r1" });
    s = run(s, { type: "add.confirmed", rid: "r1", item: item("tea-id", "tea", 41) });
    expect(s.rows.map((r) => r.item.id)).toEqual(["tea-id", "milk"]);
    expect(s.rows[0].pending).toBeUndefined();
  });

  it("an item.added event carrying that rid does the same", () => {
    const s = run(initialState([milk]), addTea, {
      type: "event.added",
      item: item("tea-id", "tea", 41),
      rid: "r1",
    });
    expect(s.rows.map((r) => r.item.id)).toEqual(["tea-id", "milk"]);
  });

  it("leaves one row whether the confirm or the echo comes first", () => {
    const real = item("tea-id", "tea", 41);
    const pending = addTea;
    const confirm = { type: "add.confirmed", rid: "r1", item: real } as const;
    const echo = { type: "event.added", item: real, rid: "r1" } as const;
    expect(names(run(initialState([]), pending, confirm, echo))).toEqual(["tea"]);
    expect(names(run(initialState([]), pending, echo, confirm))).toEqual(["tea"]);
  });

  it("a rollback removes the pending row", () => {
    const s = run(initialState([milk]), addTea, { type: "add.rolledBack", rid: "r1" });
    expect(names(s)).toEqual(["milk"]);
  });
});

describe("remote add", () => {
  it("ignores an item.added for an id already present", () => {
    const s = run(initialState([milk]), { type: "event.added", item: milk });
    expect(names(s)).toEqual(["milk"]);
  });

  it("puts a new item first among the real rows", () => {
    const s = run(initialState([eggs]), { type: "event.added", item: milk });
    expect(names(s)).toEqual(["milk", "eggs"]);
  });
});

describe("remove", () => {
  it("an optimistic remove hides the row, and a rollback brings it back in its place", () => {
    let s = run(initialState([milk, eggs, bread]), { type: "remove.pending", itemId: "eggs" });
    expect(shown(s)).toEqual(["milk", "bread"]);
    s = run(s, { type: "remove.rolledBack", itemId: "eggs" });
    expect(shown(s)).toEqual(["milk", "eggs", "bread"]);
  });

  it("confirming an optimistic remove, or hearing your own echo, drops the row with no note", () => {
    const hidden = run(initialState([milk, eggs]), { type: "remove.pending", itemId: "eggs" });
    expect(names(run(hidden, { type: "remove.confirmed", itemId: "eggs" }))).toEqual(["milk"]);
    const echoed = run(hidden, {
      type: "event.removed",
      itemId: "eggs",
      outcome: "used",
      byName: "Sam",
      mine: true,
    });
    expect(names(echoed)).toEqual(["milk"]);
    expect(echoed.rows.some((r) => r.note)).toBe(false);
  });

  it("a remote removal keeps the row as a note until forget, then drops it", () => {
    let s = run(initialState([milk, eggs]), {
      type: "event.removed",
      itemId: "eggs",
      outcome: "used",
      byName: "Alex",
      mine: false,
    });
    expect(s.rows.find((r) => r.item.id === "eggs")?.note).toBe("Used by Alex");
    s = run(s, { type: "forget", itemId: "eggs" });
    expect(names(s)).toEqual(["milk"]);
  });

  it("says Binned for a binned outcome", () => {
    const s = run(initialState([milk]), {
      type: "event.removed",
      itemId: "milk",
      outcome: "binned",
      byName: "Alex",
      mine: false,
    });
    expect(s.rows[0].note).toBe("Binned by Alex");
  });

  it("ignores a removal for an unknown id", () => {
    const s = initialState([milk]);
    expect(
      run(s, {
        type: "event.removed",
        itemId: "nope",
        outcome: "used",
        byName: "Alex",
        mine: false,
      }),
    ).toEqual(s);
  });

  it("keeps a noted row through a snapshot, until forgotten", () => {
    const noted = run(initialState([milk, eggs]), {
      type: "event.removed",
      itemId: "eggs",
      outcome: "used",
      byName: "Alex",
      mine: false,
    });
    const s = run(noted, { type: "snapshot", items: [milk] });
    expect(s.rows.find((r) => r.item.id === "eggs")?.note).toBe("Used by Alex");
  });
});

describe("restore", () => {
  it("inserts by createdAt descending", () => {
    const s = run(initialState([milk, bread]), { type: "event.restored", item: eggs });
    expect(names(s)).toEqual(["milk", "eggs", "bread"]);
  });

  it("is idempotent, and clears a pending 'Used by' note", () => {
    let s = run(initialState([milk, eggs]), {
      type: "event.removed",
      itemId: "eggs",
      outcome: "used",
      byName: "Alex",
      mine: false,
    });
    s = run(s, { type: "event.restored", item: eggs }, { type: "event.restored", item: eggs });
    expect(names(s)).toEqual(["milk", "eggs"]);
    expect(s.rows.some((r) => r.note)).toBe(false);
  });

  it("brings back an optimistically hidden row", () => {
    const s = run(
      initialState([milk, eggs]),
      { type: "remove.pending", itemId: "eggs" },
      { type: "event.restored", item: eggs },
    );
    expect(shown(s)).toEqual(["milk", "eggs"]);
  });
});

describe("failures", () => {
  it("adds a failure record and dismisses it", () => {
    const failure = {
      id: "f1",
      message: "Couldn't save “tea”.",
      retry: { kind: "add", name: "tea" },
    } as const;
    let s = run(initialState([]), { type: "failed", failure });
    expect(s.failures).toEqual([failure]);
    s = run(s, { type: "dismiss", failureId: "f1" });
    expect(s.failures).toEqual([]);
  });
});

const offerOn = (
  itemId: string,
  status: MyOffer["status"] = "offered",
  claimedBy: string | null = null,
): MyOffer => ({
  id: `offer-${itemId}`,
  itemId,
  itemName: itemId,
  note: `note for ${itemId}`,
  status,
  claimedBy,
  claimedAt: claimedBy ? 50 : null,
  communityIds: ["c1"],
  createdAt: 40,
});
const marked = (state: PantryState, itemId: string) =>
  state.rows.find((r) => r.item.id === itemId)?.offer;

describe("offers on rows", () => {
  it("marks a row from the snapshot and clears the marks the snapshot no longer lists", () => {
    let s = run(initialState([milk, eggs]), { type: "offers.snapshot", open: [offerOn("milk")] });
    expect(marked(s, "milk")).toEqual({
      id: "offer-milk",
      status: "offered",
      claimedBy: null,
      note: "note for milk",
    });
    expect(marked(s, "eggs")).toBeUndefined();
    s = run(s, { type: "offers.snapshot", open: [offerOn("eggs", "claimed", "House 9")] });
    expect(marked(s, "milk")).toBeUndefined();
    expect(marked(s, "eggs")).toEqual({
      id: "offer-eggs",
      status: "claimed",
      claimedBy: "House 9",
      note: "note for eggs",
    });
  });

  it("marks and updates a row on offer.mine, and a terminal status clears it", () => {
    let s = run(initialState([milk]), { type: "offer.mine", offer: offerOn("milk") });
    expect(marked(s, "milk")?.status).toBe("offered");
    s = run(s, { type: "offer.mine", offer: offerOn("milk", "claimed", "House 9") });
    expect(marked(s, "milk")).toEqual({
      id: "offer-milk",
      status: "claimed",
      claimedBy: "House 9",
      note: "note for milk",
    });
    for (const status of ["withdrawn", "collected"] as const) {
      const cleared = run(s, { type: "offer.mine", offer: offerOn("milk", status) });
      expect(marked(cleared, "milk")).toBeUndefined();
    }
  });

  it("is idempotent, and ignores an offer for an item that isn't a row", () => {
    const once = run(initialState([milk]), { type: "offer.mine", offer: offerOn("milk") });
    const twice = run(once, { type: "offer.mine", offer: offerOn("milk") });
    expect(twice).toEqual(once);
    const snap = run(once, { type: "offers.snapshot", open: [offerOn("milk")] });
    expect(run(snap, { type: "offers.snapshot", open: [offerOn("milk")] })).toEqual(snap);
    expect(run(once, { type: "offer.mine", offer: offerOn("ghost") })).toEqual(once);
  });

  it("keeps the offer mark through an items snapshot", () => {
    const s = run(
      initialState([milk]),
      { type: "offer.mine", offer: offerOn("milk") },
      { type: "snapshot", items: [milk, eggs] },
    );
    expect(marked(s, "milk")?.status).toBe("offered");
  });

  it("shows an optimistic offer until the server's offer arrives, or rolls it back", () => {
    let s = run(initialState([milk]), { type: "offer.pending", itemId: "milk" });
    expect(s.rows[0].offering).toBe(true);
    s = run(s, { type: "offers.snapshot", open: [] });
    expect(s.rows[0].offering).toBe(true);
    expect(run(s, { type: "offer.rolledBack", itemId: "milk" }).rows[0].offering).toBeUndefined();
    s = run(s, { type: "offer.mine", offer: offerOn("milk") });
    expect(s.rows[0].offering).toBeUndefined();
    expect(marked(s, "milk")?.status).toBe("offered");
  });

  it("hides a mark while a withdraw is pending, restores it on rollback and drops it on confirm", () => {
    const base = run(initialState([milk]), { type: "offer.mine", offer: offerOn("milk") });
    const pending = run(base, { type: "withdraw.pending", itemId: "milk" });
    expect(pending.rows[0].withdrawing).toBe(true);
    expect(run(pending, { type: "withdraw.rolledBack", itemId: "milk" })).toEqual(base);
    const done = run(pending, { type: "withdraw.confirmed", itemId: "milk" });
    expect(marked(done, "milk")).toBeUndefined();
    expect(done.rows[0].withdrawing).toBeUndefined();
  });

  it("shows an edited note at once, and puts the old one back on rollback", () => {
    const base = run(initialState([milk]), { type: "offer.mine", offer: offerOn("milk") });
    const edited = run(base, { type: "offer.noted", itemId: "milk", note: "Side gate" });
    expect(marked(edited, "milk")?.note).toBe("Side gate");
    expect(run(edited, { type: "offer.noted", itemId: "milk", note: "Side gate" })).toEqual(edited);
    expect(run(edited, { type: "offer.noted", itemId: "milk", note: "note for milk" })).toEqual(
      base,
    );
    // the server's own offer.mine wins whenever it arrives
    const echoed = run(edited, {
      type: "offer.mine",
      offer: { ...offerOn("milk"), note: "Gate 3" },
    });
    expect(marked(echoed, "milk")?.note).toBe("Gate 3");
  });

  it("ignores an edited note for a row with no offer", () => {
    const s = initialState([milk]);
    expect(run(s, { type: "offer.noted", itemId: "milk", note: "x" })).toEqual(s);
  });

  it("does not allow offering a pending row", () => {
    const s = run(initialState([]), addTea, { type: "offer.pending", itemId: "pending:r1" });
    expect(s.rows[0].offering).toBeUndefined();
  });

  it("notes a neighbour's collection as Given to a neighbour, whoever tapped", () => {
    for (const byName of ["a neighbour", "Alex"]) {
      const s = run(initialState([milk]), {
        type: "event.removed",
        itemId: "milk",
        outcome: "given",
        byName,
        mine: false,
      });
      expect(s.rows[0].note).toBe("Given to a neighbour");
    }
  });
});

describe("event.updated", () => {
  const base = testItem({ id: "milk", name: "milk", createdAt: 30 });

  it("replaces the matching row's item and ignores an unknown id", () => {
    const s = initialState([base, eggs]);
    const updated = { ...base, fillStop: 2, valueSetAt: 100, valueSetBy: "a" };
    const after = run(s, { type: "event.updated", item: updated });
    expect(after.rows[0].item).toEqual(updated);
    expect(after.rows[1].item).toEqual(eggs);
    expect(run(s, { type: "event.updated", item: { ...base, id: "nope" } })).toEqual(s);
  });

  it("keeps the row's other state (an offer, a note)", () => {
    const s = initialState([base]);
    s.rows[0] = { ...s.rows[0], offering: true };
    const after = run(s, {
      type: "event.updated",
      item: { ...base, fillStop: 1, valueSetAt: 5 },
    });
    expect(after.rows[0].offering).toBe(true);
  });

  it("lets a stale echo lose per group, while still taking the newer group", () => {
    const row = { ...base, fillStop: 1, valueSetAt: 200, valueSetBy: "sam", expirySetAt: 50 };
    const s = initialState([row]);
    const echo = {
      ...base,
      fillStop: 3,
      valueSetAt: 100,
      valueSetBy: "alex",
      estimatedExpiry: "2026-11-01",
      expirySetAt: 300,
      expirySetBy: "alex",
    };
    const item = run(s, { type: "event.updated", item: echo }).rows[0].item;
    expect(item).toMatchObject({ fillStop: 1, valueSetBy: "sam", valueSetAt: 200 });
    expect(item).toMatchObject({ estimatedExpiry: "2026-11-01", expirySetBy: "alex" });

    const reverse = initialState([
      { ...base, estimatedExpiry: "2026-12-01", expirySetAt: 400, expirySetBy: "sam" },
    ]);
    const kept = run(reverse, {
      type: "event.updated",
      item: {
        ...base,
        estimatedExpiry: "2026-11-01",
        expirySetAt: 300,
        fillStop: 2,
        valueSetAt: 90,
      },
    }).rows[0].item;
    expect(kept).toMatchObject({ estimatedExpiry: "2026-12-01", expirySetBy: "sam", fillStop: 2 });
  });

  it("treats a null stamp as older than any write, and is idempotent", () => {
    const s = initialState([base]);
    const write = { ...base, count: 4, valueSetAt: 10, valueSetBy: "a" };
    const once = run(s, { type: "event.updated", item: write });
    const twice = run(once, { type: "event.updated", item: write });
    expect(once.rows[0].item).toMatchObject({ count: 4, valueSetAt: 10 });
    expect(twice).toEqual(once);
    const guessedAgain = run(once, { type: "event.updated", item: base });
    expect(guessedAgain.rows[0].item.count).toBe(4);
  });
});

describe("event.merged", () => {
  const original = testItem({ id: "orig", name: "eggs", createdAt: 20, count: 3 });
  const portion = testItem({ id: "part", name: "eggs", createdAt: 20, count: 3 });

  it("removes the portion's row and replaces the original's item", () => {
    const s = initialState([portion, original, milk]);
    const merged = { ...original, count: 6 };
    const after = run(s, { type: "event.merged", itemId: "part", item: merged });
    expect(after.rows.map((r) => r.item.id)).toEqual(["orig", "milk"]);
    expect(after.rows[0].item.count).toBe(6);
  });

  it("is a no-op for an unknown portion id", () => {
    const s = initialState([original]);
    expect(
      run(s, { type: "event.merged", itemId: "nope", item: { ...original, count: 9 } }),
    ).toEqual(s);
  });
});

describe("a portion arriving as event.added", () => {
  it("is inserted next to its original, before it", () => {
    const original = testItem({ id: "orig", name: "eggs", createdAt: 20, count: 3 });
    const portion = testItem({ id: "part", name: "eggs", createdAt: 20, count: 3 });
    const s = run(
      initialState([milk, original, bread]),
      { type: "event.added", item: portion },
      { type: "event.added", item: portion },
    );
    expect(s.rows.map((r) => r.item.id)).toEqual(["milk", "part", "orig", "bread"]);
  });
});
