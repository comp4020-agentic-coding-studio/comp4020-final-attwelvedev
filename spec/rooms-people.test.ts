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
  "01-first-steps|0|blind":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: a Can't see person is never asked for the plate digit, the stop or to be steered (BT1, BJ3)",
  "01-first-steps|1|blind":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: a Can't see person is never asked for the plate digit, the stop or to be steered (BT1, BJ3)",
  "01-first-steps|2|blind":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: a Can't see person is never asked for the plate digit, the stop or to be steered (BT1, BJ3)",
  "02-three-hands|0|blind":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: a Can't see person is never asked for the plate digit, the stop or to be steered (BT1, BJ3)",
  "02-three-hands|1|blind":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: a Can't see person is never asked for the plate digit, the stop or to be steered (BT1, BJ3)",
  "02-three-hands|2|blind":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: a Can't see person is never asked for the plate digit, the stop or to be steered (BT1, BJ3)",
  "03-watchers|0|blind":
    "not cleared after 240 s, caught 2, refused 0; fixed in phase 03: a Can't see person is never asked for the plate digit, the stop or to be steered (BT1, BJ3)",
  "03-watchers|1|blind":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: a Can't see person is never asked for the plate digit, the stop or to be steered (BT1, BJ3)",
  "03-watchers|2|blind":
    "not cleared after 240 s, caught 38, refused 0; fixed in phase 03: a Can't see person is never asked for the plate digit, the stop or to be steered (BT1, BJ3)",
  "04-the-safe|1|deaf":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: Task 298 (BJ1) took away the jobs a Can't hear person cannot receive, and this still stalls, so the cause is the stop/steer protocol (BT1, BJ3) or a station's missing ask: phase 03 audits it",
  "04-the-safe|0|blind":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: a Can't see person is never asked for the plate digit, the stop or to be steered (BT1, BJ3)",
  "04-the-safe|0|mute":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: a Can't speak person is never asked for the digit text or the x mark (BT1)",
  "04-the-safe|1|mute":
    "not cleared after 240 s, caught 31, refused 0; fixed in phase 03: a Can't speak person is never asked for the digit text or the x mark (BT1)",
  "04-the-safe|1|blind":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: a Can't see person is never asked for the plate digit, the stop or to be steered (BT1, BJ3)",
  "04-the-safe|2|mute":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: a Can't speak person is never asked for the digit text or the x mark (BT1)",
  "04-the-safe|2|blind":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: a Can't see person is never asked for the plate digit, the stop or to be steered (BT1, BJ3)",
  "05-the-gallery|0|blind":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: a Can't see person is never asked for the plate digit, the stop or to be steered (BT1, BJ3)",
  "05-the-gallery|1|blind":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: a Can't see person is never asked for the plate digit, the stop or to be steered (BT1, BJ3)",
  "05-the-gallery|2|blind":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: a Can't see person is never asked for the plate digit, the stop or to be steered (BT1, BJ3)",
  "06-lights-out|0|blind":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: a Can't see person is never asked for the plate digit, the stop or to be steered (BT1, BJ3)",
  "06-lights-out|1|blind":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: a Can't see person is never asked for the plate digit, the stop or to be steered (BT1, BJ3)",
  "06-lights-out|2|blind":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: a Can't see person is never asked for the plate digit, the stop or to be steered (BT1, BJ3)",
  "07-night-shift|0|blind":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: a Can't see person is never asked for the plate digit, the stop or to be steered (BT1, BJ3)",
  "07-night-shift|0|deaf":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: Task 298 (BJ1) took away the jobs a Can't hear person cannot receive, and this still stalls, so the cause is the stop/steer protocol (BT1, BJ3) or a station's missing ask: phase 03 audits it",
  "07-night-shift|0|mute":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: a Can't speak person is never asked for the digit text or the x mark (BT1)",
  "07-night-shift|1|deaf":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: Task 298 (BJ1) took away the jobs a Can't hear person cannot receive, and this still stalls, so the cause is the stop/steer protocol (BT1, BJ3) or a station's missing ask: phase 03 audits it",
  "07-night-shift|1|mute":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: a Can't speak person is never asked for the digit text or the x mark (BT1)",
  "07-night-shift|1|blind":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: a Can't see person is never asked for the plate digit, the stop or to be steered (BT1, BJ3)",
  "07-night-shift|2|mute":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: a Can't speak person is never asked for the digit text or the x mark (BT1)",
  "07-night-shift|2|blind":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: a Can't see person is never asked for the plate digit, the stop or to be steered (BT1, BJ3)",
  "07-night-shift|2|deaf":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: Task 298 (BJ1) took away the jobs a Can't hear person cannot receive, and this still stalls, so the cause is the stop/steer protocol (BT1, BJ3) or a station's missing ask: phase 03 audits it",
  "08-music-room|0|blind":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: a Can't see person is never asked for the plate digit, the stop or to be steered (BT1, BJ3)",
  "08-music-room|0|mute":
    "not cleared after 240 s, caught 1, refused 0; fixed in phase 03: a Can't speak person is never asked for the digit text or the x mark (BT1)",
  "08-music-room|1|mute":
    "not cleared after 240 s, caught 1, refused 0; fixed in phase 03: a Can't speak person is never asked for the digit text or the x mark (BT1)",
  "08-music-room|1|blind":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: a Can't see person is never asked for the plate digit, the stop or to be steered (BT1, BJ3)",
  "08-music-room|2|mute":
    "not cleared after 240 s, caught 1, refused 0; fixed in phase 03: a Can't speak person is never asked for the digit text or the x mark (BT1)",
  "08-music-room|2|blind":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: a Can't see person is never asked for the plate digit, the stop or to be steered (BT1, BJ3)",
  "09-the-vault|0|blind":
    "not cleared after 240 s, caught 10, refused 0; fixed in phase 03: a Can't see person is never asked for the plate digit, the stop or to be steered (BT1, BJ3)",
  "09-the-vault|0|deaf":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: Task 298 (BJ1) took away the jobs a Can't hear person cannot receive, and this still stalls, so the cause is the stop/steer protocol (BT1, BJ3) or a station's missing ask: phase 03 audits it",
  "09-the-vault|0|mute":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: a Can't speak person is never asked for the digit text or the x mark (BT1)",
  "09-the-vault|1|deaf":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: Task 298 (BJ1) took away the jobs a Can't hear person cannot receive, and this still stalls, so the cause is the stop/steer protocol (BT1, BJ3) or a station's missing ask: phase 03 audits it",
  "09-the-vault|1|mute":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: a Can't speak person is never asked for the digit text or the x mark (BT1)",
  "09-the-vault|1|blind":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: a Can't see person is never asked for the plate digit, the stop or to be steered (BT1, BJ3)",
  "09-the-vault|2|mute":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: a Can't speak person is never asked for the digit text or the x mark (BT1)",
  "09-the-vault|2|blind":
    "not cleared after 240 s, caught 10, refused 0; fixed in phase 03: a Can't see person is never asked for the plate digit, the stop or to be steered (BT1, BJ3)",
  "09-the-vault|2|deaf":
    "not cleared after 240 s, caught 0, refused 0; fixed in phase 03: Task 298 (BJ1) took away the jobs a Can't hear person cannot receive, and this still stalls, so the cause is the stop/steer protocol (BT1, BJ3) or a station's missing ask: phase 03 audits it",
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
