import { describe, expect, it } from "vitest";
import { parseArgs, rotatedWidths } from "./args.ts";

const ROOMS = ["01-first-steps", "02-three-hands", "03-watchers"];

describe("parseArgs", () => {
  it("defaults to every room, the mixed table and one rotation", () => {
    expect(parseArgs([], ROOMS)).toEqual({ rooms: "all", widths: [1280, 375, 1280], rotations: 1 });
  });
  it("--room 03 resolves the room from the directory listing", () => {
    expect(parseArgs(["--room", "03"], ROOMS).rooms).toEqual(["03-watchers"]);
  });
  it("an unknown room is an error naming the valid ones", () => {
    expect(() => parseArgs(["--room", "42"], ROOMS)).toThrow(/01-first-steps.*03-watchers/);
  });
  it("--width 375 puts all three tabs at that width", () => {
    expect(parseArgs(["--width", "375"], ROOMS).widths).toEqual([375, 375, 375]);
    expect(() => parseArgs(["--width", "500"], ROOMS)).toThrow(/1280|375/);
  });
  it("--rotations all is 3", () => {
    expect(parseArgs(["--rotations", "all"], ROOMS).rotations).toBe(3);
  });
});

describe("rotatedWidths", () => {
  it("puts the 375 tab at seat r", () => {
    const mixed: [1280 | 375, 1280 | 375, 1280 | 375] = [1280, 375, 1280];
    expect(rotatedWidths(mixed, 0)).toEqual([375, 1280, 1280]);
    expect(rotatedWidths(mixed, 1)).toEqual([1280, 375, 1280]);
    expect(rotatedWidths(mixed, 2)).toEqual([1280, 1280, 375]);
  });
  it("leaves an all-one-width table alone", () => {
    expect(rotatedWidths([375, 375, 375], 2)).toEqual([375, 375, 375]);
  });
});
