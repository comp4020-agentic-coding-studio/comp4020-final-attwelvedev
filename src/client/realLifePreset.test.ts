import { describe, expect, it } from "vitest";
import * as server from "../net/lobbies.ts";
import { DEFAULT_SETTINGS, presetFor } from "./realLifePreset.ts";

// This mirrors src/net/lobbies.ts's presetFor/DEFAULT_SETTINGS because the
// client bundle can't import that file (see realLifePreset.ts). This test is
// what keeps the two from drifting apart: run only in Node (unit tests, never
// bundled for the browser), so importing the server module here is safe.
describe("realLifePreset mirrors src/net/lobbies.ts", () => {
  it("DEFAULT_SETTINGS matches", () => {
    expect(DEFAULT_SETTINGS).toEqual(server.DEFAULT_SETTINGS);
  });

  it.each([
    { sameRoom: false, deafHasHeadphones: false, othersHaveHeadphones: false },
    { sameRoom: true, deafHasHeadphones: true, othersHaveHeadphones: true },
    { sameRoom: true, deafHasHeadphones: true, othersHaveHeadphones: false },
    { sameRoom: true, deafHasHeadphones: false, othersHaveHeadphones: true },
    { sameRoom: true, deafHasHeadphones: false, othersHaveHeadphones: false },
  ])("presetFor(%o) matches", (answers) => {
    expect(presetFor(answers)).toEqual(server.presetFor(answers));
  });
});
