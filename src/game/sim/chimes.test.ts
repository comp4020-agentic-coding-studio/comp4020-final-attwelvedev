import { describe, expect, it } from "vitest";
import {
  CHIME_TICK_MS,
  CHIME_TICKS,
  chimeTimes,
  GROUP_GAP_TICKS,
  groupStartingOn,
  TUNE_MAX_TICKS,
  TUNE_PAUSE_TICKS,
  tuneGroups,
} from "./chimes.ts";
import { TICK_MS } from "./world.ts";

// Task 36: a code is played as groups of chimes you can count by ear. A note is a group of
// `note + 1` chimes, rising in pitch (the pitch is the client's); groups are a clear gap apart.
const lastChime = (g: { at: number; chimes: number }) => g.at + (g.chimes - 1) * CHIME_TICKS;

describe("tuneGroups: a code as groups of chimes", () => {
  it("makes a note a group of that many chimes, so every note has a count of its own", () => {
    const all = tuneGroups([0, 1, 2, 3, 4, 5, 6, 7, 8]).groups;
    expect(all.map((g) => g.chimes)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(all.map((g) => g.note)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("makes two different codes sound different, by group lengths and by timing", () => {
    const counts = (code: number[]) => tuneGroups(code).groups.map((g) => g.chimes);
    expect(counts([0, 1, 2])).not.toEqual(counts([2, 0, 1]));
    expect(counts([3, 3, 3])).not.toEqual(counts([4, 4, 4]));
    expect(tuneGroups([3, 3, 3]).period).not.toBe(tuneGroups([4, 4, 4]).period);
  });

  it("puts 600 ms between a group's last chime and the next group's first, 150 ms inside one", () => {
    expect(GROUP_GAP_TICKS * TICK_MS).toBe(600);
    expect(CHIME_TICKS * TICK_MS).toBe(150);
    expect(GROUP_GAP_TICKS).toBeGreaterThan(CHIME_TICKS);
    for (const code of [
      [8, 0, 4, 2],
      [0, 0, 0],
      [8, 8, 8, 8],
    ]) {
      const { groups } = tuneGroups(code);
      for (const [i, a] of groups.entries()) {
        const b = groups[i + 1];
        if (b) expect(b.at - lastChime(a), `${code} group ${i}`).toBe(GROUP_GAP_TICKS);
      }
    }
  });

  it("starts with a group and repeats after a pause longer than any silence inside the tune", () => {
    for (const code of [
      [0, 0, 0],
      [8, 0, 8],
      [3, 1, 4, 1],
    ]) {
      const { groups, period } = tuneGroups(code);
      expect(groups[0]?.at).toBe(0);
      expect(period - lastChime(groups.at(-1) as { at: number; chimes: number })).toBe(
        TUNE_PAUSE_TICKS,
      );
    }
    // the longest silence inside a tune is a rest's, two gaps: the pause between tunes beats it
    expect(TUNE_PAUSE_TICKS).toBeGreaterThan(2 * GROUP_GAP_TICKS);
  });

  it("gives a rest a gap of silence and never plays its note (a keypad's slot)", () => {
    const first = tuneGroups([5, 2, 7], 0);
    expect(first.groups.map((g) => g.note)).toEqual([2, 7]);
    expect(first.groups[0]?.at).toBe(GROUP_GAP_TICKS);
    const middle = tuneGroups([5, 2, 7], 1);
    expect(middle.groups.map((g) => g.note)).toEqual([5, 7]);
    const [a, b] = middle.groups as unknown as [{ at: number; chimes: number }, { at: number }];
    expect(b.at - lastChime(a)).toBe(2 * GROUP_GAP_TICKS);
  });

  it("is never longer than TUNE_MAX_TICKS, even four of the longest groups", () => {
    expect(tuneGroups([8, 8, 8, 8]).period).toBeLessThanOrEqual(TUNE_MAX_TICKS);
    expect(tuneGroups([8, 8, 8, 8], 3).period).toBeLessThanOrEqual(TUNE_MAX_TICKS);
  });

  it("names the group that starts on a tick, and none on any other", () => {
    const tune = tuneGroups([2, 0, 4]);
    const starts: [number, number][] = [];
    for (let t = 0; t < 2 * tune.period; t++) {
      const g = groupStartingOn(t, tune);
      if (g) starts.push([t, g.note]);
    }
    expect(starts.map(([, n]) => n)).toEqual([2, 0, 4, 2, 0, 4]);
    expect(starts[3]?.[0]).toBe(tune.period); // the tune starts again after its period
  });

  it("plays a group as its count of chimes, 150 ms apart, each a step higher", () => {
    const three = chimeTimes(3);
    expect(three.map((c) => c.step)).toEqual([0, 1, 2]);
    expect(three.map((c) => c.at)).toEqual([0, 0.15, 0.3]);
    expect(chimeTimes(9)).toHaveLength(9);
    expect(chimeTimes(0)).toHaveLength(1); // never silent
  });

  it("counts ticks the way the simulation does (chimes.ts cannot import TICK_MS: a cycle)", () => {
    expect(CHIME_TICK_MS).toBe(TICK_MS);
  });
});
