import { describe, expect, it } from "vitest";
import { loadRooms } from "../rooms/load.ts";
import { TICK_MS } from "../sim/world.ts";
import { createAttract, HUMAN, SAY_DELAY_MS } from "./attract.ts";

const room = loadRooms()[0];
if (!room) throw new Error("no rooms");

describe("the home page's attract run", () => {
  it("clears room 1 and only tells each seat what its role may perceive", () => {
    const run = createAttract(room, ["blind", "deaf", "mute"]);
    let tick = run.next();
    // the map goes to the sighted on the first tick, never to Can't see
    expect(tick.views[0].tiles).toBeUndefined();
    expect(tick.views[1].tiles).toBeDefined();
    let messages = 0;
    for (let i = 0; i < 1200 && !tick.cleared; i++) {
      tick = run.next();
      messages += tick.heard.length;
      // Can't hear is sent no sounds at all
      expect(tick.views[1].sounds).toEqual([]);
      for (const h of tick.heard) expect(h.receivers).not.toContain(1);
    }
    expect(tick.cleared).toBe(true);
    expect(messages).toBeGreaterThan(0);
  });

  // The page plays a new seed each loop, so a seed that strands the team would
  // freeze the hero. Slowing the bots is what can strand them: a seat that pauses
  // between tile centres is lost to the guide steering it.
  it("clears room 1 in under 30 s with every seed the page will reach", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const run = createAttract(room, ["blind", "deaf", "mute"], seed);
      let tick = run.next();
      while (!tick.cleared && run.world.tick < (30 * 1000) / TICK_MS) tick = run.next();
      expect(tick.cleared, `seed ${seed}`).toBe(true);
    }
  });

  it("plays Can't see slowest, and shows each callout a moment after it was meant", () => {
    expect(HUMAN.blind.pace).toBeLessThan(HUMAN.deaf.pace);
    expect(HUMAN.blind.pace).toBeLessThan(HUMAN.mute.pace);
    // the pace is felt: room 1 waits on Can't see, so a faster one clears it sooner
    const clearS = () => {
      const run = createAttract(room, ["blind", "deaf", "mute"], 1);
      while (!run.next().cleared);
      return run.world.tick * TICK_MS;
    };
    const slow = clearS();
    const pace = HUMAN.blind.pace;
    HUMAN.blind.pace = 1;
    const fast = clearS();
    HUMAN.blind.pace = pace;
    expect(fast).toBeLessThan(slow);

    const run = createAttract(room, ["blind", "deaf", "mute"], 1);
    let lag = Infinity;
    let tick = run.next();
    while (!tick.cleared) {
      const at = run.world.tick * TICK_MS;
      tick = run.next();
      for (const h of tick.heard) lag = Math.min(lag, at - h.message.sentAt);
    }
    expect(lag).toBeGreaterThanOrEqual(SAY_DELAY_MS[0] - TICK_MS);
  });
});
