import { describe, expect, it } from "vitest";
import { honourLines } from "./honourLines.ts";
import { DEFAULT_SETTINGS } from "./realLifePreset.ts";

describe("honourLines", () => {
  it("is empty when the team is remote", () => {
    expect(honourLines({ ...DEFAULT_SETTINGS, inPerson: false })).toEqual([]);
  });

  it("states the mute honour line when in person", () => {
    const lines = honourLines({ ...DEFAULT_SETTINGS, inPerson: true, maskNoise: true });
    expect(lines).toContain(
      "Can't speak is on your honour: no talking, mouthing or pointing at words.",
    );
    expect(lines).toHaveLength(1);
  });

  it("adds the quiet-table line when masking noise isn't playing", () => {
    const lines = honourLines({ ...DEFAULT_SETTINGS, inPerson: true, maskNoise: false });
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/keep the table quiet/i);
  });
});
