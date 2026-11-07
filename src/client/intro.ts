import { INTRO, INTRO_TOTAL } from "../game/intro.ts";

export { INTRO, INTRO_TOTAL };

// One frame of the start of a room (FR14): the flat plan held, the board tipping into 2.5D, the
// camera flying from the whole room to you, and you landing. Each part runs 0 to 1 in its own slot.
export interface IntroFrame {
  rise: number; // 0 during the hold, 0 → 1 over the tilt (ease in-out), 1 after
  swoop: number; // 0 until the tilt ends, then 0 → 1 over the swoop (ease in-out), 1 after
  land: number; // 0 until the swoop ends, then 0 → 1 over the land
  done: boolean;
}

// Reduced motion: no tilt or swoop frames. The hold, then the cover cross-fades over this long.
export const REDUCED_FADE = 300;

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const inOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

// Where the sequence is `elapsedMs` after `intro` arrived. `ms` is how long the server holds (the
// timeline is scaled to it), so `INTRO_MS=0` is done at once.
export function introAt(elapsedMs: number, reduced: boolean, ms: number = INTRO_TOTAL): IntroFrame {
  if (!(ms > 0)) return { rise: 1, swoop: 1, land: 1, done: true };
  const t = (elapsedMs * INTRO_TOTAL) / ms; // on the 2400 ms timeline
  if (reduced) {
    const land = clamp01((t - INTRO.hold) / REDUCED_FADE);
    return { rise: 1, swoop: 1, land, done: land >= 1 };
  }
  const tiltAt = INTRO.hold;
  const swoopAt = tiltAt + INTRO.tilt;
  const landAt = swoopAt + INTRO.swoop;
  const land = clamp01((t - landAt) / INTRO.land);
  return {
    rise: inOut(clamp01((t - tiltAt) / INTRO.tilt)),
    swoop: inOut(clamp01((t - swoopAt) / INTRO.swoop)),
    land,
    done: t >= INTRO_TOTAL,
  };
}
