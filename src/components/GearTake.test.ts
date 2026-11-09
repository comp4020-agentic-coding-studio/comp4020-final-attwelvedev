// @vitest-environment jsdom
import { h, render } from "preact";
import { afterEach, describe, expect, it } from "vitest";
import { viewFor } from "../game/perception.ts";
import { step } from "../game/sim/step.ts";
import { place, worldWith } from "../game/sim/testing.ts";
import { TICK_MS } from "../game/sim/world.ts";
import { ActHint } from "./ActHint.tsx";
import { GearSlot } from "./GearSlot.tsx";

// Replaces "shows what you carry, once you pick it up" in spec/layout/escape-hud.test.ts. That test walked Can't
// speak across the stations draft with held keys and polled the page for "Space Take the ..." and then the slot,
// and failed in CI on a late key-up that carried the figure past the gear (run 42579267291 and others); the walk
// was patched twice (a hold short of the gear, then taps). What it checked is two things and neither is a walk:
// the server's hint for a figure standing on gear, and what the page draws from the view's `act` and `gear`.
// Here the figure is placed on the gear and the view's own fields are drawn by the real components.
afterEach(() => {
  render(null, document.body);
  document.body.innerHTML = "";
});

const GRID = ["##########", "#1..g....#", "#2.......#", "#3.......#", "##########"];
const world = () => worldWith(GRID, { g1: { item: "uv" } });

describe("taking gear: the hint, the pickup, the slot", () => {
  it("a figure standing on gear is offered it, in words that name no colour", () => {
    const w = world();
    place(w, 2, { x: 4, y: 1 });
    expect(viewFor(w, 2, "mute", false).act).toBe("Take the UV torch");
    expect(viewFor(w, 2, "mute", false).gear).toBeNull();
  });

  it("a figure off the gear is offered nothing", () => {
    const w = world();
    place(w, 2, { x: 6, y: 3 });
    expect(viewFor(w, 2, "mute", false).act).toBeUndefined();
  });

  it("Act takes it: the view says what the figure carries and the offer goes", () => {
    const w = world();
    place(w, 2, { x: 4, y: 1 });
    step(w, { 2: { seq: 1, move: { x: 0, y: 0 }, act: true } }, TICK_MS);
    const view = viewFor(w, 2, "mute", false);
    expect(view.gear).toBe("uv");
    expect(view.act).toBeUndefined();
  });

  it("the page draws the hint as Space and the offer, and nothing when there is none", () => {
    render(h(ActHint, { act: "Take the UV torch" }), document.body);
    expect(document.querySelector(".act-hint")?.textContent).toBe("Space Take the UV torch");
    render(h(ActHint, { act: undefined }), document.body);
    expect(document.querySelector(".act-hint")).toBeNull();
  });

  it("the page's slot is Empty until the view carries gear, then names it and the G key", () => {
    render(h(GearSlot, { gear: null, touch: false }), document.body);
    expect(document.querySelector(".gear-slot")?.textContent).toContain("Empty");
    expect(document.querySelector(".gear-key")).toBeNull();
    render(h(GearSlot, { gear: "uv", touch: false }), document.body);
    expect(document.querySelector(".gear-slot")?.textContent).toContain("UV torch");
    expect(document.querySelector(".gear-slot")?.textContent).toContain(
      "G take, give, swap or drop",
    );
  });

  it("on a phone the slot is a button, off while empty", () => {
    render(h(GearSlot, { gear: null, touch: true }), document.body);
    expect((document.querySelector(".gear-btn") as HTMLButtonElement).disabled).toBe(true);
    render(h(GearSlot, { gear: "uv", touch: true }), document.body);
    expect((document.querySelector(".gear-btn") as HTMLButtonElement).disabled).toBe(false);
  });
});
