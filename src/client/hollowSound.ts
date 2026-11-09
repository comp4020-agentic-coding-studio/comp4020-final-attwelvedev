// What the hollow step sounds like (escape-room phase 14, Task 66): a step on a cache dial's
// inspection plate, metal over a hollow. A short low sine that drops, with a thin ring above it that
// outlasts it, so it is unlike a tick (a 2200 Hz square blip), a tumbler (two triangle clicks) or a
// footstep (filtered noise, which is why this is the one step made of pitched tones). Kept as a pure
// plan so a test can tell it from the other cues without an audio context.
export interface PlannedTone {
  type: "sine" | "triangle" | "square";
  from: number; // Hz at the start
  to: number; // Hz at the end
  secs: number;
  level: number;
  at: number; // seconds from the cue
}

export function hollowPlan(): PlannedTone[] {
  return [
    { type: "sine", from: 210, to: 105, secs: 0.16, level: 0.55, at: 0 },
    { type: "sine", from: 1180, to: 1160, secs: 0.34, level: 0.14, at: 0.01 },
  ];
}

// The tumbler: a pin dropping in a safe, heard through a stethoscope. Two falling triangle thuds
// with a long, thin ring above them, a third of a second in all, so it carries over the dial's own
// short tick (a 2200 Hz square blip) that it lands beside, and is lower and rounder than it. Kept a
// pure plan so a test can pin its length and tell it from the other cues.
export function tumblerPlan(): PlannedTone[] {
  return [
    { type: "triangle", from: 440, to: 250, secs: 0.12, level: 0.7, at: 0 },
    { type: "triangle", from: 380, to: 210, secs: 0.12, level: 0.55, at: 0.09 },
    { type: "sine", from: 1320, to: 1280, secs: 0.3, level: 0.16, at: 0.02 },
  ];
}
