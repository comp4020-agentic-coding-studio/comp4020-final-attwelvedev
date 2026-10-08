import { describe, expect, it } from "vitest";
import { expiryRequest, valueRequest } from "./itemWrites.ts";

describe("valueRequest", () => {
  it("posts each kind of write to the endpoint that takes it", () => {
    expect(valueRequest("i1", { kind: "fill", stop: 3 })).toEqual([
      "/items/i1/value",
      { fillStop: "3" },
    ]);
    expect(valueRequest("i1", { kind: "count", count: 4 })).toEqual([
      "/items/i1/value",
      { count: "4" },
    ]);
    expect(valueRequest("i1", { kind: "exact", amount: 400, unit: "g" })).toEqual([
      "/items/i1/value",
      { exactAmount: "400", exactUnit: "g" },
    ]);
    expect(valueRequest("i1", { kind: "clearExact" })).toEqual([
      "/items/i1/value",
      { exactAmount: "" },
    ]);
    expect(valueRequest("i1", { kind: "measure", measure: "count" })).toEqual([
      "/items/i1/measure",
      { measure: "count" },
    ]);
  });
});

describe("expiryRequest", () => {
  it("sends the viewer's today with a bucket, and just the date or the clear otherwise", () => {
    expect(
      expiryRequest("i1", { kind: "bucket", bucket: "this-week", today: "2026-10-07" }),
    ).toEqual(["/items/i1/expiry", { bucket: "this-week", today: "2026-10-07" }]);
    expect(expiryRequest("i1", { kind: "date", date: "2026-10-20" })).toEqual([
      "/items/i1/expiry",
      { date: "2026-10-20" },
    ]);
    expect(expiryRequest("i1", { kind: "clearDate" })).toEqual([
      "/items/i1/expiry",
      { clearDate: "1" },
    ]);
  });
});
