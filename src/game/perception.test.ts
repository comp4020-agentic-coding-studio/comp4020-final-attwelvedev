import { describe, expect, it } from "vitest";
import { viewFor } from "./perception.ts";
import { step } from "./sim/step.ts";
import { place, worldFrom } from "./sim/testing.ts";
import { TICK_MS } from "./sim/world.ts";

const GRID = [
  "##############################",
  "#1...........................#",
  "#2.....p.....................#",
  "#3...........................#",
  "##############################",
];

const world = () => worldFrom(GRID, ["p1"]);

describe("viewFor: what each role is told", () => {
  it("blind: no tiles, no entities, no own position, even on a full view", () => {
    const view = viewFor(world(), 0, "blind", true);
    expect(view.tiles).toBeUndefined();
    expect(view.entities).toEqual([]);
    expect(view.you.pos).toBeUndefined();
    expect(view.full).toBe(true);
    expect(JSON.stringify(view)).not.toContain("#");
  });

  it("deaf and mute: tiles only on a full view, and entities and own position always", () => {
    for (const role of ["deaf", "mute"] as const) {
      const full = viewFor(world(), 1, role, true);
      expect(full.tiles).toHaveLength(5);
      const quick = viewFor(world(), 1, role, false);
      expect(quick.tiles).toBeUndefined();
      expect(quick.you.pos).toEqual({ x: 1.5, y: 2.5 });
      const kinds = new Set(quick.entities.map((e) => e.kind));
      expect(kinds).toEqual(new Set(["player", "plate"]));
      expect(quick.entities.filter((e) => e.kind === "player")).toHaveLength(3);
    }
  });

  it("deaf: no sounds, even with others walking next to them", () => {
    const w = world();
    step(w, { 0: { seq: 1, move: { x: 1, y: 0 }, act: false } }, TICK_MS);
    expect(viewFor(w, 1, "deaf", false).sounds).toEqual([]);
  });

  it("mute and blind hear footsteps, panned toward the source", () => {
    const w = world();
    place(w, 0, { x: 10, y: 1 });
    place(w, 1, { x: 5, y: 1 });
    place(w, 2, { x: 20, y: 1 });
    w.players[1].moving = true;
    const left = viewFor(w, 0, "blind", false).sounds.filter((s) => s.kind === "footsteps");
    expect(left).toHaveLength(1);
    expect(left[0]?.pan).toBeLessThan(0);
    expect(left[0]?.gain).toBeGreaterThan(0);
    expect(viewFor(w, 0, "mute", false).sounds.some((s) => s.kind === "footsteps")).toBe(true);
    w.players[1].moving = false;
    w.players[2].moving = true; // 10 tiles to the right of seat 0
    const right = viewFor(w, 0, "blind", false).sounds.filter((s) => s.kind === "footsteps");
    expect(right[0]?.pan).toBeGreaterThan(0);
  });

  it("pan is (dx / 8) clamped, gain falls to 0 at 12 tiles", () => {
    const w = world();
    place(w, 0, { x: 1, y: 1 });
    place(w, 1, { x: 5, y: 1 }); // 4 tiles right
    w.players[1].moving = true;
    const near = viewFor(w, 0, "blind", false).sounds[0];
    expect(near?.pan).toBeCloseTo(0.5, 6);
    expect(near?.gain).toBeCloseTo(1 - 4 / 12, 6);
    place(w, 1, { x: 13, y: 1 }); // 12 tiles right
    expect(viewFor(w, 0, "blind", false).sounds).toEqual([]);
  });

  it("does not play a seat its own footsteps", () => {
    const w = world();
    w.players[0].moving = true;
    expect(viewFor(w, 0, "blind", false).sounds).toEqual([]);
  });

  it("hums for the blind player only while standing on a plate", () => {
    const w = world();
    expect(viewFor(w, 0, "blind", false).sounds.some((s) => s.kind === "hum")).toBe(false);
    place(w, 0, { x: 7, y: 2 });
    const hum = viewFor(w, 0, "blind", false).sounds.filter((s) => s.kind === "hum");
    expect(hum).toHaveLength(1);
    expect(hum[0]?.pan).toBe(0);
  });

  it("clicks when a door opens, panned from the door", () => {
    const w = worldFrom(
      ["##########", "#1.pD...E#", "#2..D...E#", "#3..D...E#", "##########"],
      ["p1"],
    );
    place(w, 0, { x: 3, y: 1 });
    step(w, {}, TICK_MS);
    const click = viewFor(w, 1, "blind", false).sounds.filter((s) => s.kind === "door");
    expect(click).toHaveLength(1);
    expect(click[0]?.pan).toBeGreaterThan(0);
    step(w, {}, TICK_MS); // events last one tick
    expect(viewFor(w, 1, "blind", false).sounds.some((s) => s.kind === "door")).toBe(false);
  });

  it("carries tick, ack, room, role, status and elapsed time", () => {
    const w = world();
    step(w, { 2: { seq: 9, move: { x: 0, y: 0 }, act: false } }, TICK_MS);
    const view = viewFor(w, 2, "mute", false);
    expect(view).toMatchObject({ tick: 1, ack: 9, room: "t", role: "mute", status: "playing" });
    expect(view.elapsedMs).toBe(TICK_MS);
    expect(view.you.seat).toBe(2);
  });

  it("blind gets no entities even when an object lists blind in visibleTo", () => {
    const w = world();
    w.room.objects.find((o) => o.id === "p1")?.visibleTo.push("blind");
    expect(viewFor(w, 0, "blind", false).entities).toEqual([]); // blind still sees nothing
  });
});
