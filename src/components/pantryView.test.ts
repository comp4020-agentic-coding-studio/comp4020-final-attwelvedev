import { describe, expect, it } from "vitest";
import { testItem } from "../lib/testItem.ts";
import type { Row } from "./pantryState.ts";
import {
  attribution,
  BUCKET_LABEL,
  BUCKET_ORDER,
  dateText,
  effectiveDate,
  expiryLabel,
  glyphLevel,
  groupRows,
  localToday,
  remoteChange,
  rowLabel,
  saveFailure,
  splittableOf,
  tapeFraction,
  valueText,
  valueWriteBack,
  valueWriteLabel,
} from "./pantryView.ts";

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

describe("groupRows", () => {
  it("orders buckets past first and unknown last, and omits empty ones", () => {
    const groups = groupRows(
      [
        row("far", { estimatedExpiry: "2027-01-01" }),
        row("none"),
        row("old", { estimatedExpiry: "2026-10-01" }),
        row("soon", { estimatedExpiry: "2026-10-08" }),
      ],
      TODAY,
    );
    expect(groups.map((g) => g.bucket)).toEqual(["past", "use-soon", "long-lasting", "unknown"]);
    expect(BUCKET_ORDER).toEqual([
      "past",
      "use-soon",
      "this-week",
      "this-month",
      "long-lasting",
      "unknown",
    ]);
  });

  it("sorts inside a bucket by date, then newest first; unknown is newest first", () => {
    const groups = groupRows(
      [
        row("b", { estimatedExpiry: "2026-10-09", createdAt: 1 }),
        row("a", { estimatedExpiry: "2026-10-08", createdAt: 1 }),
        row("c", { estimatedExpiry: "2026-10-09", createdAt: 5 }),
        row("u1", { createdAt: 1 }),
        row("u2", { createdAt: 9 }),
      ],
      TODAY,
    );
    expect(ids(groups)).toEqual([
      ["use-soon", ["a", "c", "b"]],
      ["unknown", ["u2", "u1"]],
    ]);
  });

  it("puts a pending row first in its bucket", () => {
    const groups = groupRows(
      [row("old"), row("new", { createdAt: 99 }, { pending: { rid: "r" } })],
      TODAY,
    );
    expect(ids(groups)).toEqual([["unknown", ["new", "old"]]]);
  });

  it("lets an exact date win over the estimate", () => {
    const item = testItem({ estimatedExpiry: "2027-01-01", exactExpiry: "2026-10-08" });
    expect(effectiveDate(item)).toBe("2026-10-08");
    expect(groupRows([{ item }], TODAY)[0].bucket).toBe("use-soon");
  });

  it("labels every bucket", () => {
    expect(BUCKET_LABEL.past).toBe("Past estimate");
    expect(BUCKET_LABEL["use-soon"]).toBe("Use soon");
    expect(BUCKET_LABEL.unknown).toBe("Unknown");
  });
});

describe("tapeFraction", () => {
  const at = (date: string | null, exact: string | null = null) =>
    tapeFraction(testItem({ estimatedExpiry: date, exactExpiry: exact }), TODAY);
  it("is the share of 30 days left, with a floor", () => {
    expect(at("2026-10-07")).toBeCloseTo(0.08);
    expect(at("2026-10-10")).toBeCloseTo(0.1);
    expect(at("2026-10-22")).toBeCloseTo(0.5);
    expect(at("2026-11-06")).toBe(1);
    expect(at("2027-01-05")).toBe(1);
  });
  it("is a stub when past and full when unknown", () => {
    expect(at("2026-10-01")).toBeCloseTo(0.08);
    expect(at(null)).toBe(1);
  });
  it("follows the exact date over the estimate", () => {
    expect(at("2027-01-01", "2026-10-22")).toBeCloseTo(0.5);
  });
});

describe("value text and glyph", () => {
  it("names each fill stop", () => {
    const text = [4, 3, 2, 1, 0].map((fillStop) =>
      valueText(testItem({ measure: "fill", fillStop })),
    );
    expect(text).toEqual(["Full", "¾", "½", "¼", "Nearly out"]);
    expect(
      [4, 2, 0].map((fillStop) => glyphLevel(testItem({ measure: "fill", fillStop }))),
    ).toEqual([4, 2, 0]);
  });
  it("shows an exact amount in place of the stop, with no glyph", () => {
    const g = testItem({ measure: "fill", exactAmount: 400, exactUnit: "g" });
    expect(valueText(g)).toBe("~400 g");
    expect(glyphLevel(g)).toBeNull();
    expect(valueText(testItem({ measure: "fill", exactAmount: 1.5, exactUnit: "kg" }))).toBe(
      "~1.5 kg",
    );
    expect(valueText(testItem({ measure: "fill", exactAmount: 2.0, exactUnit: "L" }))).toBe("~2 L");
  });
  it("shows a count as its number and have as the word", () => {
    expect(valueText(testItem({ measure: "count", count: 6 }))).toBe("6");
    expect(valueText(testItem({ measure: "have" }))).toBe("have");
    expect(glyphLevel(testItem({ measure: "count" }))).toBeNull();
    expect(glyphLevel(testItem({ measure: "have" }))).toBeNull();
  });
});

describe("rowLabel", () => {
  it("reads name, how much is left, and the bucket", () => {
    expect(
      rowLabel(
        testItem({ name: "Spinach", measure: "fill", fillStop: 1, estimatedExpiry: "2026-10-08" }),
        TODAY,
      ),
    ).toBe("Spinach, quarter left, use soon");
    expect(
      rowLabel(
        testItem({ name: "Eggs", measure: "count", count: 6, estimatedExpiry: "2026-10-12" }),
        TODAY,
      ),
    ).toBe("Eggs, 6 left, this week");
    expect(rowLabel(testItem({ name: "Cumin", estimatedExpiry: "2026-10-01" }), TODAY)).toBe(
      "Cumin, past estimate",
    );
    expect(
      rowLabel(
        testItem({ name: "Milk", measure: "fill", fillStop: 4, estimatedExpiry: "2026-10-08" }),
        TODAY,
      ),
    ).toBe("Milk, full, use soon");
  });
});

describe("dates", () => {
  it("writes a date the way a person reads it, in any time zone", () => {
    expect(dateText("2026-10-09")).toBe("by Fri 9 Oct");
    expect(dateText("2027-01-01")).toBe("by Fri 1 Jan");
  });
  it("takes today from the local parts of the clock", () => {
    expect(localToday(new Date(2026, 9, 7, 23, 59))).toBe("2026-10-07");
    expect(localToday(new Date(2026, 0, 2, 0, 1))).toBe("2026-01-02");
  });
});

describe("attribution", () => {
  const members = [{ id: "m1", name: "Sam" }];
  const NOW = 10 * 3_600_000;
  it("says Guessed until someone sets it", () => {
    expect(attribution("value", testItem(), members, NOW)).toBe("Guessed");
    expect(attribution("expiry", testItem(), members, NOW)).toBe("Guessed");
  });
  it("names who set it and when", () => {
    const item = testItem({ valueSetBy: "m1", valueSetAt: NOW - 2 * 3_600_000 });
    expect(attribution("value", item, members, NOW)).toBe("Sam's estimate, 2 h ago");
    const dated = testItem({ expirySetBy: "m1", expirySetAt: NOW });
    expect(attribution("expiry", dated, members, NOW)).toBe("Sam's estimate, just now");
  });
  it("calls a member who has gone a former member", () => {
    const item = testItem({ valueSetBy: null, valueSetAt: NOW - 2 * 3_600_000 });
    expect(attribution("value", item, members, NOW)).toBe("A former member's estimate, 2 h ago");
    const unknown = testItem({ valueSetBy: "gone", valueSetAt: NOW - 3_600_000 });
    expect(attribution("value", unknown, members, NOW)).toBe("A former member's estimate, 1 h ago");
  });
});

describe("save failures", () => {
  it("says what was lost and what it went back to", () => {
    expect(saveFailure("¼", "½")).toBe("Couldn't save ¼. Back to ½.");
  });
  it("labels a write by the value it made", () => {
    const fill = testItem({ measure: "fill", fillStop: 1 });
    expect(valueWriteLabel({ kind: "fill", stop: 1 }, fill)).toBe("¼");
    expect(valueWriteLabel({ kind: "measure", measure: "count" }, fill)).toBe("Count");
    expect(
      valueWriteLabel(
        { kind: "exact", amount: 400, unit: "g" },
        testItem({ measure: "fill", exactAmount: 400, exactUnit: "g" }),
      ),
    ).toBe("~400 g");
  });
});

describe("remoteChange", () => {
  const before = testItem({ measure: "fill", fillStop: 2, estimatedExpiry: "2026-10-08" });
  it("says what a housemate changed the amount to", () => {
    expect(remoteChange(before, { ...before, fillStop: 1 }, TODAY)).toBe("¼");
    expect(remoteChange(before, { ...before, measure: "count", count: 6 }, TODAY)).toBe("Count");
  });
  it("says what the use-by changed to", () => {
    expect(remoteChange(before, { ...before, estimatedExpiry: "2026-10-12" }, TODAY)).toBe(
      "This week",
    );
    expect(remoteChange(before, { ...before, exactExpiry: "2026-10-09" }, TODAY)).toBe(
      "by Fri 9 Oct",
    );
  });
  it("is null when nothing the row shows changed", () => {
    expect(remoteChange(before, { ...before, valueSetAt: 5, name: "milk" }, TODAY)).toBeNull();
  });
});

describe("labels for a failed write", () => {
  it("names what an expiry reads as", () => {
    expect(expiryLabel(testItem({ estimatedExpiry: "2026-10-12" }), TODAY)).toBe("This week");
    expect(expiryLabel(testItem({ exactExpiry: "2026-10-09" }), TODAY)).toBe("by Fri 9 Oct");
    expect(
      saveFailure("This week", expiryLabel(testItem({ estimatedExpiry: "2026-10-08" }), TODAY)),
    ).toBe("Couldn't save This week. Back to Use soon.");
  });
  it("names what a value went back to", () => {
    expect(
      valueWriteBack({ kind: "fill", stop: 1 }, testItem({ measure: "fill", fillStop: 2 })),
    ).toBe("½");
    expect(
      valueWriteBack({ kind: "measure", measure: "count" }, testItem({ measure: "fill" })),
    ).toBe("Fill");
  });
});

describe("splittableOf", () => {
  it("lets a count of 2 or more be split, up to one fewer than the whole", () => {
    expect(splittableOf(testItem({ measure: "count", count: 6 }))).toEqual({
      max: 5,
      whole: "6",
      unit: "items",
    });
    expect(splittableOf(testItem({ measure: "count", count: 1 }))).toBeUndefined();
  });
  it("lets a fill of two quarters or more be split in quarters, unless it has an exact amount", () => {
    expect(splittableOf(testItem({ measure: "fill", fillStop: 4 }))).toEqual({
      max: 3,
      whole: "Full",
      unit: "quarters",
    });
    expect(splittableOf(testItem({ measure: "fill", fillStop: 1 }))).toBeUndefined();
    expect(
      splittableOf(testItem({ measure: "fill", fillStop: 4, exactAmount: 400, exactUnit: "g" })),
    ).toBeUndefined();
  });
  it("offers nothing for have", () => {
    expect(splittableOf(testItem({ measure: "have" }))).toBeUndefined();
  });
});
