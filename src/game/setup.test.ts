import { describe, expect, it } from "vitest";
import { DEFAULT_SETUP, sharesRoom } from "./setup.ts";

const here = { ...DEFAULT_SETUP, inRoom: true };
const away = { ...DEFAULT_SETUP, inRoom: false };

describe("sharesRoom", () => {
  it("is false when nobody, or only one person, says they are in the room", () => {
    expect(sharesRoom([])).toBe(false);
    expect(sharesRoom([away, away, away])).toBe(false);
    expect(sharesRoom([here, away, away])).toBe(false);
  });
  it("is true once two people say so", () => {
    expect(sharesRoom([here, here, away])).toBe(true);
  });
});
