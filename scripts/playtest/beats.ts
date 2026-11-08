// When `pnpm playtest` shoots a seat mid-room: the first poll that finds it in a beat it has not
// been shot at yet. A seat starts at 0 (in no beat yet), so beat 1 is shot like every other;
// `beatOf` gives 0 outside every beat, which never shoots.
export const freshBeats = (seats: number): number[] => Array.from({ length: seats }, () => 0);

export const nextShot = (prev: number, b: number): boolean => b > prev;
