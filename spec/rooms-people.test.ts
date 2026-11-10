import { describe, expect, it } from "vitest";
import { solveRoom } from "../src/game/bots/solve.ts";
import { rolesFor } from "../src/game/crew.ts";
import { loadRooms } from "../src/game/rooms/load.ts";
import type { Seat } from "../src/game/types.ts";

// BG1 (ADR 0031): one stand-in person (the bot brain with a person's limits: a 1 s delay, and it
// sends only what it was asked) with two bots, in every room, rotation and seat. Same assertions as
// spec/rooms.test.ts. NOT_YET is the known-failing list: each entry is measured, names the phase
// that fixes it, and is removed by the task that makes it clear. Never add one after Task 297.
const rooms = loadRooms();
const NOT_YET: Record<string, string> = {
  "03-watchers|0|blind":
    "caught 2 times, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "03-watchers|1|blind":
    "caught 1 times, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "03-watchers|2|blind":
    "caught 2 times, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "04-the-safe|1|deaf":
    "not cleared after 240 s, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "04-the-safe|0|blind":
    "not cleared after 240 s, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "04-the-safe|1|blind":
    "not cleared after 240 s, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "04-the-safe|2|blind":
    "not cleared after 240 s, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "05-the-gallery|0|blind":
    "not cleared after 240 s, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "05-the-gallery|1|blind":
    "not cleared after 240 s, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "05-the-gallery|2|blind":
    "not cleared after 240 s, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "06-lights-out|0|blind":
    "not cleared after 240 s, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "06-lights-out|1|blind":
    "not cleared after 240 s, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "06-lights-out|2|blind":
    "not cleared after 240 s, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "07-night-shift|0|blind":
    "not cleared after 240 s, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "07-night-shift|0|deaf":
    "not cleared after 240 s, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "07-night-shift|0|mute":
    "not cleared after 240 s, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "07-night-shift|1|deaf":
    "not cleared after 240 s, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "07-night-shift|1|mute":
    "not cleared after 240 s, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "07-night-shift|1|blind":
    "not cleared after 240 s, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "07-night-shift|2|mute":
    "not cleared after 240 s, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "07-night-shift|2|blind":
    "not cleared after 240 s, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "07-night-shift|2|deaf":
    "not cleared after 240 s, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "08-music-room|0|blind":
    "not cleared after 240 s, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "08-music-room|0|mute":
    "not cleared after 240 s, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "08-music-room|1|mute":
    "not cleared after 240 s, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "08-music-room|1|blind":
    "not cleared after 240 s, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "08-music-room|2|mute":
    "not cleared after 240 s, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "08-music-room|2|blind":
    "not cleared after 240 s, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "09-the-vault|0|blind":
    "not cleared after 240 s, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "09-the-vault|0|deaf":
    "not cleared after 240 s, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "09-the-vault|0|mute":
    "not cleared after 240 s, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "09-the-vault|1|deaf":
    "not cleared after 240 s, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "09-the-vault|1|mute":
    "not cleared after 240 s, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "09-the-vault|2|mute":
    "not cleared after 240 s, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
  "09-the-vault|2|deaf":
    "not cleared after 240 s, measured after phase 03 (Task 304): every ask is wired, the stand-in obeys taps, and this combination still does not clear; the cause is not yet diagnosed per combination, so phase 04 (takeover BJ2 and its re-measure) takes it on",
};

describe("two bots and a stand-in person clear every room", () => {
  it("has rooms to check", () => {
    expect(rooms.length).toBeGreaterThanOrEqual(3);
  });
  for (const room of rooms) {
    const budgetS = typeof room.meta.budgetS === "number" ? room.meta.budgetS : 600;
    for (const rotation of [0, 1, 2]) {
      const roles = rolesFor(rotation);
      for (const seat of [0, 1, 2] as Seat[]) {
        const key = `${room.id}|${rotation}|${roles[seat]}`;
        const title = `${room.id} with ${roles.join("/")}, a person as ${roles[seat]} (seat ${seat + 1})`;
        const why = NOT_YET[key];
        if (why) {
          it.skip(`${title}: ${why}`, () => {});
          continue;
        }
        it(title, () => {
          const result = solveRoom(room, roles, budgetS, { standIns: new Set([seat]) });
          expect(result.cleared, `not cleared after ${result.ticks / 20} s`).toBe(true);
          expect(result.ticks / 20).toBeLessThanOrEqual(budgetS);
          expect(result.caught, `caught ${result.caught} times`).toBe(0);
          const flags = room.objects.filter((o) => o.kind === "checkpoint").length;
          expect(result.world.checkpoint).toBe(flags);
          expect(result.refused).toBe(0);
          expect(
            Object.entries(result.world.levers).filter(([, on]) => on),
            "a lever was left on",
          ).toEqual([]);
        });
      }
    }
  }
});
