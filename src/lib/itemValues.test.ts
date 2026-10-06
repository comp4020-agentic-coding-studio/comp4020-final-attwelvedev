import { describe, expect, it } from "vitest";
import { openDb } from "./db.ts";
import { bucketFor } from "./expiry.ts";
import { createHousehold, createInviteLink, joinByLink } from "./households.ts";
import { addItem, listPantry, NotFoundError, recordOutcome, ValidationError } from "./items.ts";
import * as values from "./itemValues.ts";
import { parseExpiryChange, parseMeasure, parseValueChange } from "./itemValues.ts";

// the writers return an ItemUpdate; these tests are about the item
const setValue = (...args: Parameters<typeof values.setValue>) => values.setValue(...args).item;
const setMeasure = (...args: Parameters<typeof values.setMeasure>) =>
  values.setMeasure(...args).item;
const setExpiry = (...args: Parameters<typeof values.setExpiry>) => values.setExpiry(...args).item;

function setup() {
  const db = openDb(":memory:");
  const sam = createHousehold(db, { householdName: "Unit 4", memberName: "Sam" });
  const { token } = createInviteLink(db, sam);
  const alex = joinByLink(db, { token, memberName: "Alex" });
  const milk = addItem(db, sam, "milk", "2026-10-07"); // fill
  const eggs = addItem(db, sam, "eggs", "2026-10-07"); // count
  const odd = addItem(db, sam, "mystery thing", "2026-10-07"); // have
  return { db, sam, alex, milk, eggs, odd };
}

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe("setValue", () => {
  it("sets a fill stop, clears the exact amount, and stamps only the value group", () => {
    const { db, sam, milk } = setup();
    setValue(db, sam, milk.id, { kind: "exact", amount: 500, unit: "ml" });
    const before = Date.now();
    const item = setValue(db, sam, milk.id, { kind: "fill", stop: 2 });
    expect(item).toMatchObject({
      fillStop: 2,
      exactAmount: null,
      exactUnit: null,
      valueSetBy: sam.member.id,
      expirySetBy: null,
      expirySetAt: null,
    });
    expect(item.valueSetAt).toBeGreaterThanOrEqual(before);
    expect(item.estimatedExpiry).toBe(milk.estimatedExpiry);
  });

  it("sets and clears an exact amount with its unit together", () => {
    const { db, sam, milk } = setup();
    const set = setValue(db, sam, milk.id, { kind: "exact", amount: 1.5, unit: "L" });
    expect(set).toMatchObject({ exactAmount: 1.5, exactUnit: "L", valueSetBy: sam.member.id });
    const cleared = setValue(db, sam, milk.id, { kind: "clearExact" });
    expect(cleared).toMatchObject({ exactAmount: null, exactUnit: null });
  });

  it("sets a count", () => {
    const { db, sam, eggs } = setup();
    expect(setValue(db, sam, eggs.id, { kind: "count", count: 6 })).toMatchObject({
      count: 6,
      valueSetBy: sam.member.id,
    });
  });

  it.each([
    ["fill on a count item", "eggs", { kind: "fill", stop: 1 }],
    ["count on a fill item", "milk", { kind: "count", count: 3 }],
    ["exact on a count item", "eggs", { kind: "exact", amount: 5, unit: "count" }],
    ["fill on a have item", "odd", { kind: "fill", stop: 1 }],
    ["count on a have item", "odd", { kind: "count", count: 2 }],
    ["exact on a have item", "odd", { kind: "exact", amount: 5, unit: "g" }],
    ["clearExact on a have item", "odd", { kind: "clearExact" }],
  ] as const)("refuses %s and changes nothing", (_label, which, change) => {
    const s = setup();
    const target = s[which];
    expect(() => setValue(s.db, s.sam, target.id, change)).toThrow(ValidationError);
    expect(listPantry(s.db, s.sam.household.id).find((i) => i.id === target.id)).toEqual(target);
  });

  it("lets the latest write win, and a value write leaves the expiry stamp alone", () => {
    const { db, sam, alex, milk } = setup();
    setValue(db, sam, milk.id, { kind: "fill", stop: 2 });
    const item = setValue(db, alex, milk.id, { kind: "fill", stop: 1 });
    expect(item).toMatchObject({ fillStop: 1, valueSetBy: alex.member.id, expirySetAt: null });
  });

  it("throws NotFoundError for a removed item, another household's and an unknown id", () => {
    const { db, sam, milk } = setup();
    const other = createHousehold(db, { householdName: "Other", memberName: "Kim" });
    expect(() => setValue(db, other, milk.id, { kind: "fill", stop: 1 })).toThrow(NotFoundError);
    expect(() => setValue(db, sam, "nope", { kind: "fill", stop: 1 })).toThrow(NotFoundError);
    recordOutcome(db, sam, milk.id, "used");
    expect(() => setValue(db, sam, milk.id, { kind: "fill", stop: 1 })).toThrow(NotFoundError);
  });
});

describe("setMeasure", () => {
  it("stamps the value group, changes only the measure, and switching back restores the rest", () => {
    const { db, sam, milk } = setup();
    setValue(db, sam, milk.id, { kind: "fill", stop: 2 });
    setValue(db, sam, milk.id, { kind: "exact", amount: 700, unit: "ml" });
    const asCount = setMeasure(db, sam, milk.id, "count");
    expect(asCount).toMatchObject({ measure: "count", fillStop: 2, exactAmount: 700 });
    expect(asCount.valueSetBy).toBe(sam.member.id);
    expect(asCount.expirySetAt).toBeNull();
    const back = setMeasure(db, sam, milk.id, "fill");
    expect(back).toMatchObject({ measure: "fill", fillStop: 2, exactAmount: 700, exactUnit: "ml" });
  });

  it("throws NotFoundError for another household's item", () => {
    const { db, milk } = setup();
    const other = createHousehold(db, { householdName: "Other", memberName: "Kim" });
    expect(() => setMeasure(db, other, milk.id, "have")).toThrow(NotFoundError);
  });
});

describe("setExpiry", () => {
  it("a bucket stores that bucket's estimate and clears the exact date", () => {
    const { db, sam, milk } = setup();
    setExpiry(db, sam, milk.id, { kind: "date", date: "2026-12-25" }, "2026-10-07");
    const item = setExpiry(db, sam, milk.id, { kind: "bucket", bucket: "this-week" }, "2026-10-07");
    expect(item).toMatchObject({
      estimatedExpiry: "2026-10-12",
      exactExpiry: null,
      expirySetBy: sam.member.id,
      valueSetAt: null,
    });
  });

  it("unknown stores no estimate", () => {
    const { db, sam, milk } = setup();
    expect(
      setExpiry(db, sam, milk.id, { kind: "bucket", bucket: "unknown" }, "2026-10-07"),
    ).toMatchObject({ estimatedExpiry: null, exactExpiry: null });
  });

  it("an exact date leaves the estimate alone; clearing it leaves the estimate in force", () => {
    const { db, sam, milk } = setup();
    const dated = setExpiry(db, sam, milk.id, { kind: "date", date: "2026-12-25" }, "2026-10-07");
    expect(dated).toMatchObject({
      exactExpiry: "2026-12-25",
      estimatedExpiry: milk.estimatedExpiry,
    });
    const cleared = setExpiry(db, sam, milk.id, { kind: "clearDate" }, "2026-10-07");
    expect(cleared).toMatchObject({ exactExpiry: null, estimatedExpiry: milk.estimatedExpiry });
    expect(cleared.expirySetBy).toBe(sam.member.id);
  });

  it("moves to a nearer bucket on its own as the days pass", () => {
    const { db, sam, milk } = setup();
    const item = setExpiry(db, sam, milk.id, { kind: "bucket", bucket: "this-week" }, "2026-10-07");
    expect(bucketFor(item.estimatedExpiry, item.exactExpiry, "2026-10-07")).toBe("this-week");
    expect(bucketFor(item.estimatedExpiry, item.exactExpiry, "2026-10-10")).toBe("use-soon");
  });

  it("throws NotFoundError for a removed item", () => {
    const { db, sam, milk } = setup();
    recordOutcome(db, sam, milk.id, "binned");
    expect(() => setExpiry(db, sam, milk.id, { kind: "clearDate" }, "2026-10-07")).toThrow(
      NotFoundError,
    );
  });
});

describe("parsing", () => {
  it.each(["5", "-1", "1.5", "x", ""])("refuses fillStop %j", (v) => {
    expect(() => parseValueChange(form({ fillStop: v }))).toThrow(ValidationError);
  });
  it.each(["0", "4"])("accepts fillStop %s", (v) => {
    expect(parseValueChange(form({ fillStop: v }))).toEqual({ kind: "fill", stop: Number(v) });
  });

  it.each(["0", "1000", "2.5", "x"])("refuses count %j", (v) => {
    expect(() => parseValueChange(form({ count: v }))).toThrow(ValidationError);
  });
  it.each(["1", "999"])("accepts count %s", (v) => {
    expect(parseValueChange(form({ count: v }))).toEqual({ kind: "count", count: Number(v) });
  });

  it.each(["0", "-3", "NaN", "1e9", "abc"])("refuses exactAmount %j", (v) => {
    expect(() => parseValueChange(form({ exactAmount: v, exactUnit: "g" }))).toThrow(
      ValidationError,
    );
  });
  it("refuses a bad or missing exactUnit", () => {
    expect(() => parseValueChange(form({ exactAmount: "5", exactUnit: "oz" }))).toThrow(
      ValidationError,
    );
    expect(() => parseValueChange(form({ exactAmount: "5" }))).toThrow(ValidationError);
  });
  it("reads an exact amount and an empty one as clearExact", () => {
    expect(parseValueChange(form({ exactAmount: "250", exactUnit: "g" }))).toEqual({
      kind: "exact",
      amount: 250,
      unit: "g",
    });
    expect(parseValueChange(form({ exactAmount: "" }))).toEqual({ kind: "clearExact" });
  });

  it("refuses two groups at once, and none", () => {
    expect(() => parseValueChange(form({ fillStop: "1", count: "2" }))).toThrow(ValidationError);
    expect(() => parseValueChange(form({}))).toThrow(ValidationError);
  });

  it.each(["past", "soon", "", "unknown "])("refuses bucket %j", (v) => {
    expect(() => parseExpiryChange(form({ bucket: v }))).toThrow(ValidationError);
  });
  it("accepts every settable bucket", () => {
    for (const bucket of ["use-soon", "this-week", "this-month", "long-lasting", "unknown"]) {
      expect(parseExpiryChange(form({ bucket }))).toEqual({ kind: "bucket", bucket });
    }
  });
  it.each(["2026-02-30", "1999-12-31", "2101-01-01", "tomorrow"])("refuses date %j", (v) => {
    expect(() => parseExpiryChange(form({ date: v }))).toThrow(ValidationError);
  });
  it("accepts a date and clearDate, and refuses both together", () => {
    expect(parseExpiryChange(form({ date: "2026-12-25" }))).toEqual({
      kind: "date",
      date: "2026-12-25",
    });
    expect(parseExpiryChange(form({ clearDate: "1" }))).toEqual({ kind: "clearDate" });
    expect(() => parseExpiryChange(form({ date: "2026-12-25", clearDate: "1" }))).toThrow(
      ValidationError,
    );
    expect(() => parseExpiryChange(form({}))).toThrow(ValidationError);
  });

  it("parseMeasure accepts only fill, count and have", () => {
    for (const m of ["fill", "count", "have"]) expect(parseMeasure(form({ measure: m }))).toBe(m);
    expect(() => parseMeasure(form({ measure: "weigh" }))).toThrow(ValidationError);
    expect(() => parseMeasure(form({}))).toThrow(ValidationError);
  });
});
