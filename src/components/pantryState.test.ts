import { describe, expect, it } from "vitest";
import type { Item } from "../lib/items.ts";
import {
  type Action,
  initialState,
  type PantryState,
  pantryReducer,
  visibleRows,
} from "./pantryState.ts";

const item = (id: string, name: string, createdAt: number): Item => ({
  id,
  householdId: "h",
  name,
  createdBy: "m",
  createdAt,
});
const milk = item("milk", "milk", 30);
const eggs = item("eggs", "eggs", 20);
const bread = item("bread", "bread", 10);

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
    s = run(
      s,
      { type: "add.pending", rid: "r1", name: "tea", at: 40 },
      { type: "remove.pending", itemId: "eggs" },
    );
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
  it("puts a pending row first, and confirming swaps it for the real item in place", () => {
    let s = run(initialState([milk]), { type: "add.pending", rid: "r1", name: "tea", at: 40 });
    expect(names(s)).toEqual(["tea", "milk"]);
    expect(s.rows[0].pending).toEqual({ rid: "r1" });
    s = run(s, { type: "add.confirmed", rid: "r1", item: item("tea-id", "tea", 41) });
    expect(s.rows.map((r) => r.item.id)).toEqual(["tea-id", "milk"]);
    expect(s.rows[0].pending).toBeUndefined();
  });

  it("an item.added event carrying that rid does the same", () => {
    const s = run(
      initialState([milk]),
      { type: "add.pending", rid: "r1", name: "tea", at: 40 },
      { type: "event.added", item: item("tea-id", "tea", 41), rid: "r1" },
    );
    expect(s.rows.map((r) => r.item.id)).toEqual(["tea-id", "milk"]);
  });

  it("leaves one row whether the confirm or the echo comes first", () => {
    const real = item("tea-id", "tea", 41);
    const pending = { type: "add.pending", rid: "r1", name: "tea", at: 40 } as const;
    const confirm = { type: "add.confirmed", rid: "r1", item: real } as const;
    const echo = { type: "event.added", item: real, rid: "r1" } as const;
    expect(names(run(initialState([]), pending, confirm, echo))).toEqual(["tea"]);
    expect(names(run(initialState([]), pending, echo, confirm))).toEqual(["tea"]);
  });

  it("a rollback removes the pending row", () => {
    const s = run(
      initialState([milk]),
      { type: "add.pending", rid: "r1", name: "tea", at: 40 },
      { type: "add.rolledBack", rid: "r1" },
    );
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
