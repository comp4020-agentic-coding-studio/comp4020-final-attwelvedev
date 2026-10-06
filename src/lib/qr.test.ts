import { describe, expect, it } from "vitest";
import { qrSvg } from "./qr.ts";

describe("qrSvg", () => {
  it("returns an svg string", () => {
    expect(qrSvg("https://example.test/device/abc")).toMatch(/^<svg/);
  });

  it("is deterministic and depends on its input", () => {
    expect(qrSvg("one")).toBe(qrSvg("one"));
    expect(qrSvg("one")).not.toBe(qrSvg("two"));
  });
});
