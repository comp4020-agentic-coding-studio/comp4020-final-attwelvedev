import { describe, expect, it } from "vitest";
import type { RoleView } from "../../src/game/perception.ts";
import { declinedCleanly, delivered, movedToward } from "./judges.ts";

const view = (x: number, y = 1, blocked = false, moving = true): RoleView =>
  ({
    tick: 1,
    status: "playing",
    you: { seat: 0, pos: { x, y }, motion: { moving, blocked } },
    entities: [],
    sounds: [],
  }) as unknown as RoleView;

describe("movedToward", () => {
  it("is true when x falls by more than 0.1 going left", () => {
    expect(movedToward([view(5), view(4.7)], "left")).toBe(true);
  });
  it("is false when the seat stood still", () => {
    expect(movedToward([view(5), view(5.05)], "left")).toBe(false);
  });
  it("is false when it went the other way", () => {
    expect(movedToward([view(5), view(5.5)], "left")).toBe(false);
  });
  it("skips when blocked throughout", () => {
    expect(movedToward([view(5, 1, true), view(5, 1, true)], "left")).toBe("skip");
  });
  it("skips when the seat is held against a wall after a step that went nowhere", () => {
    const idle = view(1.4, 3.5, false, false);
    expect(movedToward([idle, view(1.4, 3.5, false), view(1.39, 3.5, true)], "left")).toBe("skip");
  });
  it("still fails a seat that was never blocked and never moved", () => {
    expect(movedToward([view(1.4, 3.5, false, false), view(1.4, 3.5, false, true)], "left")).toBe(
      false,
    );
  });
  it("up is y falling, down is y rising", () => {
    expect(movedToward([view(5, 3), view(5, 2.5)], "up")).toBe(true);
    expect(movedToward([view(5, 3), view(5, 3.5)], "down")).toBe(true);
  });
});

describe("delivered", () => {
  const msg = (seat: number, method = "callout") => ({
    at: 1,
    msg: { t: "msg", method, from: { seat } },
  });
  const roles: ("blind" | "deaf" | "mute")[] = ["blind", "deaf", "mute"];
  it("is ok when exactly the receivers got it (Can't hear never gets a callout)", () => {
    const wires = [[], [], [msg(0)]] as never;
    expect(delivered(wires, 0, "callout", roles)).toEqual({ ok: true });
  });
  it("names a receiver that did not get it", () => {
    const wires = [[], [], []] as never;
    expect(delivered(wires, 0, "callout", roles)).toMatchObject({
      ok: false,
      detail: expect.stringContaining("seat 2"),
    });
  });
  it("names a seat that got what its role cannot receive", () => {
    const wires = [[], [msg(0)], [msg(0)]] as never;
    expect(delivered(wires, 0, "callout", roles)).toMatchObject({
      ok: false,
      detail: expect.stringContaining("seat 1"),
    });
  });
  it("a face reaches Can't hear and Can't speak", () => {
    const wires = [[], [msg(0, "face")], [msg(0, "face")]] as never;
    expect(delivered(wires, 0, "face", roles)).toEqual({ ok: true });
  });
});

describe("declinedCleanly", () => {
  it("is ok while playing with no new reveal", () => {
    expect(declinedCleanly([view(1)], 0)).toEqual({ ok: true });
  });
  it("fails on a new reveal", () => {
    expect(declinedCleanly([view(1)], 1)).toMatchObject({ ok: false });
  });
  it("fails when the room is no longer playing", () => {
    const v = { ...view(1), status: "cleared" } as unknown as RoleView;
    expect(declinedCleanly([v], 0)).toMatchObject({ ok: false });
  });
});
