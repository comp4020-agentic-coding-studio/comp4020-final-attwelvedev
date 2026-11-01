// A code played as chimes you can count by ear (escape-room phase 12, Task 36). Each note of a code
// (0 to 8: a keypad key, a music box bell) is a GROUP of note + 1 chimes, rising in pitch, so the
// number in a group is the note, and two different codes never sound alike. Groups are a clear gap
// apart; a note that rests (a keypad's slot, fed by a radio) is one more gap of silence; the whole
// tune repeats after a pause longer than any silence inside it. Pure: ticks in, ticks out.
// Not imported from world.ts: world.ts imports stations.ts, which imports this, so a cycle would
// leave TICK_MS undefined here whenever this file is loaded first. chimes.test.ts checks it agrees.
export const CHIME_TICK_MS = 50;

export const CHIME_TICKS = Math.round(200 / CHIME_TICK_MS); // between chimes of one group: 200 ms
export const GROUP_GAP_TICKS = Math.round(600 / CHIME_TICK_MS); // last chime of a group to the next group's first: 600 ms
export const TUNE_PAUSE_TICKS = 40; // last chime to the tune starting again (2 s): beats a rest's 2 gaps
// Four of the longest groups (9 chimes), the most a code can ask for, plus the pause:
// 4 x 8 x CHIME_TICKS, three group gaps, and TUNE_PAUSE_TICKS.
export const TUNE_MAX_TICKS = 4 * 8 * CHIME_TICKS + 3 * GROUP_GAP_TICKS + TUNE_PAUSE_TICKS;

export interface ChimeGroup {
  at: number; // tick (in the tune's own count from 0) of the group's first chime
  chimes: number; // how many: note + 1
  note: number;
}

// The groups of `code`, and the length of the whole tune in ticks, from the first chime to the
// next time it starts. `rest` is the index of a note that is not played, if one is.
export function tuneGroups(
  code: readonly number[],
  rest: number | null = null,
): { groups: ChimeGroup[]; period: number } {
  const groups: ChimeGroup[] = [];
  let at = 0; // where the next group starts
  let silence = 0; // gaps of silence owed before the next group: a rest adds one
  let end = 0; // the tick of the last chime so far
  code.forEach((note, i) => {
    if (i === rest) {
      silence += GROUP_GAP_TICKS;
      return;
    }
    if (groups.length > 0) at = end + GROUP_GAP_TICKS;
    at += silence;
    silence = 0;
    const chimes = note + 1;
    groups.push({ at, chimes, note });
    end = at + (chimes - 1) * CHIME_TICKS;
  });
  // a rest at the very end is silence too, before the pause
  return { groups, period: end + silence + TUNE_PAUSE_TICKS };
}

// The group that starts on `tick`, if one does (the sim sends one cue per group, on its first
// tick; the client plays it as `chimes` rising chimes). The tune starts again every `period`.
export function groupStartingOn(
  tick: number,
  tune: { groups: ChimeGroup[]; period: number },
): ChimeGroup | undefined {
  const t = tick % tune.period;
  return tune.groups.find((g) => g.at === t);
}

// When each chime of a group of `chimes` sounds, in seconds from the group's first, and which step
// of the rising scale it plays (0 for the first). The client plays exactly this.
export function chimeTimes(chimes: number): { at: number; step: number }[] {
  return Array.from({ length: Math.max(1, chimes) }, (_, i) => ({
    at: (i * CHIME_TICKS * CHIME_TICK_MS) / 1000,
    step: i,
  }));
}
