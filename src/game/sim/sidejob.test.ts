import { describe, expect, it } from "vitest";
import { sideJobFor, viewFor } from "../perception.ts";
import { RoomFormatError } from "../rooms/format.ts";
import { step } from "./step.ts";
import { place, worldWith } from "./testing.ts";
import { TICK_MS } from "./world.ts";

const GRID = [
  "##############",
  "#1.....j....$#",
  "#2.....j.....#",
  "#3...........#",
  "##############",
];
const JOBS = {
  j1: { owner: 2, text: "the music box", value: 1 },
  j2: { owner: 3, text: "the old key" },
};
const world = () => worldWith(GRID, JOBS);

describe("side jobs", () => {
  it("count toward the room's loot total", () => {
    expect(world().lootTotal).toBe(3); // $1 + j1 + j2
  });

  it("only the owner's view carries the job, with its text", () => {
    const w = world();
    expect(viewFor(w, 1, "deaf", false).sideJob).toEqual({
      id: "j1",
      text: "the music box",
      done: false,
    });
    expect(viewFor(w, 2, "mute", false).sideJob?.id).toBe("j2");
    expect(viewFor(w, 0, "blind", false).sideJob).toBeUndefined();
    expect(JSON.stringify(viewFor(w, 0, "blind", false))).not.toContain("music box");
    expect(JSON.stringify(viewFor(w, 2, "mute", false))).not.toContain("music box");
  });

  it("sideJobFor gives a seat its own job and nobody else's, for the reveal too", () => {
    const w = world();
    expect(sideJobFor(w, 1)).toEqual({ id: "j1", text: "the music box", done: false });
    expect(sideJobFor(w, 0)).toBeUndefined();
  });

  it("the item is an ordinary visible object to everyone who sees", () => {
    const e = viewFor(world(), 2, "mute", false).entities.find((x) => x.id === "j1");
    expect(e?.kind).toBe("loot");
  });

  it("is picked up by anyone, adds its value, and credits owner and picker", () => {
    const w = world();
    place(w, 0, { x: 7, y: 1 });
    step(w, {}, TICK_MS);
    expect(w.loot).toBe(1);
    expect(w.sideJobsDone).toEqual(["j1"]);
    expect(w.sideJobBy.j1).toBe(0);
    expect(w.events).toContainEqual({ kind: "sidejob", id: "j1", seat: 0 });
    expect(viewFor(w, 1, "deaf", false).sideJob?.done).toBe(true);
  });

  it("is undone by a send-back to a checkpoint taken before it", () => {
    const w = worldWith(
      ["##############", "#1.....j.....#", "#2...........#", "#3.....L.....#", "##############"],
      {
        j1: { owner: 2, text: "the music box" },
        L1: { dir: "right", onS: 2, offS: 2, offsetS: 0 },
      },
    );
    place(w, 0, { x: 7, y: 1 });
    step(w, {}, TICK_MS);
    expect(w.loot).toBe(1);
    expect(w.sideJobsDone).toEqual(["j1"]);
    place(w, 1, { x: 10, y: 3 }); // into the laser's beam: the team goes back to the start
    step(w, {}, TICK_MS);
    expect(w.events.some((e) => e.kind === "caught")).toBe(true);
    expect(w.loot).toBe(0);
    expect(w.sideJobsDone).toEqual([]);
    expect(w.sideJobBy).toEqual({});
    expect(viewFor(w, 1, "deaf", false).sideJob?.done).toBe(false);
  });

  it("a job needs an owner of 1 to 3 and text", () => {
    expect(() => worldWith(GRID, { j1: { owner: 4, text: "x" } })).toThrow(RoomFormatError);
    expect(() => worldWith(GRID, { j1: { owner: 1 } })).toThrow(RoomFormatError);
  });
});
