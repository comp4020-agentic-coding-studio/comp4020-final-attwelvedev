import { describe, expect, it } from "vitest";
import { refuseOnFly } from "./playtest.ts";

describe("refuseOnFly", () => {
  it("refuses only when the flag is set on a Fly machine", () => {
    expect(refuseOnFly({})).toBeNull();
    expect(refuseOnFly({ PLAYTEST_AUTOPILOT: "1" })).toBeNull();
    expect(refuseOnFly({ FLY_APP_NAME: "heist" })).toBeNull();
    expect(refuseOnFly({ PLAYTEST_AUTOPILOT: "1", FLY_APP_NAME: "heist" })).toBe(
      "PLAYTEST_AUTOPILOT is set on a Fly machine (FLY_APP_NAME). It is for local playtests only; refusing to start.",
    );
  });

  it("an empty FLY_APP_NAME is not a Fly machine", () => {
    expect(refuseOnFly({ PLAYTEST_AUTOPILOT: "1", FLY_APP_NAME: "" })).toBeNull();
  });
});
