import { describe, expect, it } from "vitest";
import { CUE_HOLD_MS } from "../../src/client/hud.ts";
import type { PlaytestFrame, PlaytestSample } from "../../src/client/playtest.ts";
import type { RoleView } from "../../src/game/perception.ts";
import { captionsShown, doorChips, soundsPlayed, unseenFloor, unsentDrawn } from "./invariants.ts";

const view = (over: Partial<RoleView> = {}): RoleView =>
  ({ tick: 7, entities: [], sounds: [], you: { seat: 0 }, ...over }) as unknown as RoleView;
const sample = (drawn: number[], bare: number[], at = { x: 3, y: 1 }) =>
  ({ at, drawn, bare }) as unknown as PlaytestSample;

describe("unsentDrawn", () => {
  it("flags a sample that drew something the bare scene did not", () => {
    const found = unsentDrawn([sample([200, 10, 10, 255], [20, 20, 20, 255])]);
    expect(found).toHaveLength(1);
    expect(found[0]?.invariant).toBe("frame:unsent-drawn");
  });
  it("passes an equal sample, and one within 2 per channel", () => {
    expect(unsentDrawn([sample([20, 20, 20, 255], [20, 20, 20, 255])])).toEqual([]);
    expect(unsentDrawn([sample([21, 22, 19, 255], [20, 20, 20, 255])])).toEqual([]);
  });
});

describe("soundsPlayed", () => {
  const door = view({ sounds: [{ kind: "door" }] as never });
  it("flags a door cue missing from what played", () => {
    expect(soundsPlayed(["plate"], [door])).toHaveLength(1);
  });
  it("passes when every kind in the views played at least once", () => {
    expect(soundsPlayed(["door", "door"], [door])).toEqual([]);
  });
});

describe("captionsShown", () => {
  const now = 100_000;
  const heard = (ageMs: number) => ({
    at: now - ageMs,
    view: view({ sounds: [{ kind: "door" }] as never }),
  });
  it("flags a caption that is missing from a view within the hold", () => {
    expect(captionsShown([], [heard(1000)], now)).toHaveLength(1);
  });
  it("passes one older than the hold, and one that is shown", () => {
    expect(captionsShown([], [heard(CUE_HOLD_MS + 500)], now)).toEqual([]);
    expect(captionsShown(["door unlocked"], [heard(1000)], now)).toEqual([]);
  });
  it("does not judge when the cue list is full: the page keeps the newest few", () => {
    expect(captionsShown([], [heard(1000)], now, undefined, true)).toEqual([]);
  });
  it("does not judge a view the page cannot have drawn yet, or one whose hold is ending", () => {
    expect(captionsShown([], [heard(100)], now)).toEqual([]);
    expect(captionsShown([], [heard(CUE_HOLD_MS - 100)], now)).toEqual([]);
  });
});

describe("doorChips", () => {
  const frame = (text: string, kind: string): PlaytestFrame =>
    ({ labels: [{ kind, text, at: { x: 5.5, y: 2.5 } }] }) as unknown as PlaytestFrame;
  const door = (opens?: "stations" | "sequence") =>
    view({
      entities: [{ id: "D1", kind: "door", pos: { x: 5.5, y: 2.5 }, opens }] as never,
    });
  it("flags a plates chip on a door that opens by stations", () => {
    const found = doorChips(
      frame("Door: opens while its plates are held", "door"),
      door("stations"),
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.invariant).toBe("frame:door-chip");
  });
  it("passes each kind on the door that matches it", () => {
    expect(doorChips(frame("x", "door"), door())).toEqual([]);
    expect(doorChips(frame("x", "stationdoor"), door("stations"))).toEqual([]);
    expect(doorChips(frame("x", "sequencedoor"), door("sequence"))).toEqual([]);
  });
  it("flags a door chip with no door at its tile", () => {
    expect(doorChips(frame("x", "door"), view())).toHaveLength(1);
  });
});

describe("unseenFloor", () => {
  const tiles = ["###########", "#.........#", "#.........#", "###########"];
  it("picks floor outside the line of sight that holds no entity, from the room's own tiles", () => {
    const v = view({
      seen: ["1:1-1", "2:1-1"] as never,
      entities: [{ id: "K", kind: "crate", pos: { x: 3.5, y: 1.5 } }] as never,
    });
    const found = unseenFloor(v, tiles);
    expect(found).toContainEqual({ x: 8, y: 1 });
    expect(found).not.toContainEqual({ x: 1, y: 1 }); // seen
    expect(found).not.toContainEqual({ x: 3, y: 1 }); // a crate stands there
    expect(found).not.toContainEqual({ x: 0, y: 0 }); // wall
  });
  it("skips floor within two tiles of a sent entity: an exit's glow is not an unsent thing", () => {
    const wide = ["#########", "#.......#", "#.......#", "#########"];
    const v = view({
      seen: ["1:1-1"] as never,
      entities: [{ id: "E", kind: "exit", pos: { x: 3.5, y: 1.5 } }] as never,
    });
    const found = unseenFloor(v, wide);
    expect(found).not.toContainEqual({ x: 5, y: 1 });
    expect(found).toContainEqual({ x: 6, y: 1 });
  });
  it("picks nothing without the room's tiles", () => {
    expect(unseenFloor(view({ seen: [] as never }), null)).toEqual([]);
  });
});
