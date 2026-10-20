import { describe, expect, it } from "vitest";
import { micAfter } from "./mic.ts";

describe("micAfter: what a V or mic-button event does to the microphone", () => {
  it("hold mode: down opens it, up closes it, repeats change nothing", () => {
    expect(micAfter("hold", false, "down")).toBe(true);
    expect(micAfter("hold", true, "up")).toBe(false);
    expect(micAfter("hold", true, "down")).toBe(true);
  });

  it("toggle mode: each press flips it and letting go does nothing", () => {
    expect(micAfter("toggle", false, "down")).toBe(true);
    expect(micAfter("toggle", true, "down")).toBe(false);
    expect(micAfter("toggle", true, "up")).toBe(true);
    expect(micAfter("toggle", false, "up")).toBe(false);
  });

  it("escape, blur and leaving the page close it in either mode", () => {
    for (const mode of ["hold", "toggle"] as const) {
      expect(micAfter(mode, true, "off")).toBe(false);
    }
  });
});
