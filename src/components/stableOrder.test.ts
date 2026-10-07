import { describe, expect, it } from "vitest";
import { testItem } from "../lib/testItem.ts";
import type { Row } from "./pantryState.ts";
import { groupRows } from "./pantryView.ts";
import { stableGroups } from "./stableOrder.ts";

const TODAY = "2026-10-07";
const row = (
  id: string,
  over: Parameters<typeof testItem>[0] = {},
  extra: Partial<Row> = {},
): Row => ({
  item: testItem({ id, name: id, ...over }),
  ...extra,
});
const ids = (groups: ReturnType<typeof groupRows>) =>
  groups.map((g) => [g.bucket, g.rows.map((r) => r.item.id)]);
const none = new Set<string>();

describe("stableGroups", () => {
  const a = row("a", { estimatedExpiry: "2026-10-08", createdAt: 3 });
  const b = row("b", { estimatedExpiry: "2026-10-09", createdAt: 2 });
  const before = groupRows([a, b], TODAY);

  it("regroups fully when not busy", () => {
    const c = row("c", { estimatedExpiry: "2026-10-07", createdAt: 5 });
    const { groups, held } = stableGroups(before, [a, b, c], TODAY, false, none);
    expect(ids(groups)).toEqual([["use-soon", ["c", "a", "b"]]]);
    expect(held.count).toBe(0);
  });

  it("holds a row it has not seen while busy, and counts it", () => {
    const c = row("c", { estimatedExpiry: "2026-10-07", createdAt: 5 });
    const { groups, held } = stableGroups(before, [a, b, c], TODAY, true, none);
    expect(ids(groups)).toEqual([["use-soon", ["a", "b"]]]);
    expect(held.count).toBe(1);
  });

  it("keeps a row in its old group and place with its new contents when its bucket moved", () => {
    const moved = row("a", {
      estimatedExpiry: "2027-06-01",
      createdAt: 3,
      name: "renamed",
    } as never);
    const { groups, held } = stableGroups(before, [moved, b], TODAY, true, none);
    expect(ids(groups)).toEqual([["use-soon", ["a", "b"]]]);
    expect(groups[0].rows[0].item.estimatedExpiry).toBe("2027-06-01");
    expect(held.count).toBe(0);
  });

  it("never holds my own add, pending or confirmed", () => {
    const pending = row("pending:r1", { createdAt: 9 }, { pending: { rid: "r1" } });
    const own = row("real", { createdAt: 9 });
    const first = stableGroups(before, [a, b, pending], TODAY, true, new Set(["r1"]));
    expect(first.held.count).toBe(0);
    expect(first.groups.flatMap((g) => g.rows).map((r) => r.item.id)).toContain("pending:r1");
    const second = stableGroups(before, [a, b, own], TODAY, true, new Set(["real"]));
    expect(second.held.count).toBe(0);
    expect(second.groups.flatMap((g) => g.rows).map((r) => r.item.id)).toContain("real");
  });

  it("drops a removed row at once", () => {
    const { groups } = stableGroups(before, [b], TODAY, true, none);
    expect(ids(groups)).toEqual([["use-soon", ["b"]]]);
  });
});
