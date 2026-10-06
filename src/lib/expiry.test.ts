import { describe, expect, it } from "vitest";
import {
  addDays,
  type Bucket,
  bucketFor,
  cleanToday,
  daysUntil,
  estimateFor,
  isCalendarDate,
  type SettableBucket,
  utcToday,
} from "./expiry.ts";

const today = "2026-10-07";

describe("bucketFor", () => {
  it("puts a past date in past", () => {
    expect(bucketFor(null, addDays(today, -1), today)).toBe("past");
  });

  it.each([
    [0, "use-soon"],
    [1, "use-soon"],
    [2, "use-soon"],
    [3, "this-week"],
    [7, "this-week"],
    [8, "this-month"],
    [31, "this-month"],
    [32, "long-lasting"],
    [400, "long-lasting"],
  ] as [number, Bucket][])("%i days out is %s", (days, bucket) => {
    expect(bucketFor(addDays(today, days), null, today)).toBe(bucket);
  });

  it("is unknown with neither date", () => {
    expect(bucketFor(null, null, today)).toBe("unknown");
  });

  it("lets an exact date win over the estimate", () => {
    expect(bucketFor(addDays(today, 90), addDays(today, -1), today)).toBe("past");
  });

  it("uses the estimate alone when there is no exact date", () => {
    expect(bucketFor(addDays(today, 5), null, today)).toBe("this-week");
  });
});

describe("addDays and daysUntil", () => {
  it("crosses a month end, a year end and a leap day", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
  });

  it("accepts negative days", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("counts whole days, negative once past", () => {
    expect(daysUntil("2026-10-10", today)).toBe(3);
    expect(daysUntil(today, today)).toBe(0);
    expect(daysUntil("2026-10-06", today)).toBe(-1);
  });
});

describe("isCalendarDate", () => {
  it("rejects what is not a real date", () => {
    for (const bad of ["2026-02-30", "2026-13-01", "26-1-1", "", 20261007, null, undefined]) {
      expect(isCalendarDate(bad)).toBe(false);
    }
  });

  it("accepts a real date, including a leap day", () => {
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(isCalendarDate("2026-10-07")).toBe(true);
  });
});

describe("estimateFor", () => {
  it.each([
    ["use-soon", 2],
    ["this-week", 5],
    ["this-month", 20],
    ["long-lasting", 90],
  ] as [SettableBucket, number][])(
    "%s is today plus %i days and reads back as itself",
    (bucket, days) => {
      expect(estimateFor(bucket, today)).toBe(addDays(today, days));
      expect(bucketFor(estimateFor(bucket, today), null, today)).toBe(bucket);
    },
  );

  it("stores nothing for unknown", () => {
    expect(estimateFor("unknown", today)).toBeNull();
  });
});

describe("utcToday and cleanToday", () => {
  const now = Date.UTC(2026, 9, 7, 23, 30); // 2026-10-07 23:30 UTC

  it("utcToday is the UTC calendar date", () => {
    expect(utcToday(now)).toBe("2026-10-07");
  });

  it("keeps a real date within one day of the server's UTC date", () => {
    expect(cleanToday("2026-10-07", now)).toBe("2026-10-07");
    expect(cleanToday("2026-10-08", now)).toBe("2026-10-08");
    expect(cleanToday("2026-10-06", now)).toBe("2026-10-06");
  });

  it("falls back to the UTC date for anything else", () => {
    for (const bad of ["2026-10-09", "2026-10-05", "2026-02-30", "nope", undefined, 5, null]) {
      expect(cleanToday(bad, now)).toBe("2026-10-07");
    }
  });
});
