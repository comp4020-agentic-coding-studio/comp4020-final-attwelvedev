import type { Seat } from "../types.ts";
import type { World } from "./world.ts";

// What each seat did in a room, in fixed words (spec FR30). Nicknames are never put in here: a
// line names a teammate by a `{seat}` token the page fills in from the crew, so a name never
// reaches the server's log or this module. One line per seat.
export interface Credit {
  seat: Seat;
  lines: string[];
}

// [one, many] for the same job done more than once ("cracked 2 safes")
const SOLVED: Record<string, [string, (n: number) => string]> = {
  dial: ["cracked the safe", (n) => `cracked ${n} safes`],
  wires: ["cut the wires", (n) => `cut ${n} sets of wires`],
  keypad: ["punched in the code", (n) => `punched in ${n} codes`],
  radio: ["tuned the radio", (n) => `tuned ${n} radios`],
  switches: ["set the switches", (n) => `set ${n} sets of switches`],
  bells: ["rang the tune", (n) => `rang ${n} tunes`],
  vault: ["opened the vault", (n) => `opened ${n} vaults`],
  sync: ["turned the key in time", (n) => `turned ${n} keys in time`],
};

export function creditsOf(world: World): Credit[] {
  return ([0, 1, 2] as const).map((seat) => {
    const solved: Record<string, number> = {};
    for (const [id, by] of Object.entries(world.solvedBy)) {
      const type = world.stations[id]?.type;
      if (by === seat && type) solved[type] = (solved[type] ?? 0) + 1;
    }
    const lines = Object.entries(solved).map(([type, n]) => {
      const words = SOLVED[type];
      return !words ? "solved a puzzle" : n === 1 ? words[0] : words[1](n);
    });
    return { seat, lines: lines.length > 0 ? lines : ["kept the crew moving"] };
  });
}
