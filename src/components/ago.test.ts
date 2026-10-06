import { describe, expect, it } from "vitest";
import { ago } from "./ago.ts";

const NOW = 1_000_000_000_000;
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("ago", () => {
  it("says just now under a minute", () => {
    expect(ago(NOW, NOW)).toBe("just now");
    expect(ago(NOW - 59_000, NOW)).toBe("just now");
  });

  it("counts minutes up to an hour", () => {
    expect(ago(NOW - MIN, NOW)).toBe("1 min ago");
    expect(ago(NOW - 20 * MIN, NOW)).toBe("20 min ago");
    expect(ago(NOW - 59 * MIN - 59_000, NOW)).toBe("59 min ago");
  });

  it("counts hours up to a day", () => {
    expect(ago(NOW - HOUR, NOW)).toBe("1 h ago");
    expect(ago(NOW - 23 * HOUR - 59 * MIN, NOW)).toBe("23 h ago");
  });

  it("counts days", () => {
    expect(ago(NOW - DAY, NOW)).toBe("1 day ago");
    expect(ago(NOW - 3 * DAY, NOW)).toBe("3 days ago");
  });

  it("reads a time in the future as just now", () => {
    expect(ago(NOW + 5 * MIN, NOW)).toBe("just now");
  });
});
