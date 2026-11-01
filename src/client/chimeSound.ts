// What a chime cue sounds like (escape-room phase 12, Task 36). A keypad key, a music-box bell and
// the earpiece's note and a vent each play as a GROUP of chimes: note + 1 of them, one more step up the scale
// each, so the number in the group is the note and can be counted by ear. The simulation sends one
// cue a group, on its first chime (src/game/sim/chimes.ts); this is the group, as a list of notes.
//
// The client may not import the simulation, so the spacing repeats chimes.ts's CHIME_TICKS;
// chimeSound.test.ts holds the two to the same answer.
import type { SoundCue } from "../net/protocol.ts";

export const CHIME_GAP_S = 0.2;
const MAX_CHIMES = 9;

// C major pentatonic over two octaves (nine notes, none sour): the scale a group climbs.
export const PENTATONIC = [262, 294, 330, 392, 440, 523, 587, 659, 784];

export type ChimeKind = "key" | "bellnote" | "earpiece" | "clue";
export interface PlannedChime {
  at: number; // seconds from the cue
  hz: number;
  voice: "triangle" | "bell" | "sine"; // key: soft triangle; bellnote: a struck bell; earpiece, clue: a plain sine
  secs: number; // how long it rings
  level: number;
}

// Each kind keeps its own voice and register, so a key, a bell and the earpiece are not confused:
// a bell sounds an octave up, the earpiece is centred, a key is the softest.
const VOICE: Record<
  ChimeKind,
  { voice: PlannedChime["voice"]; octave: number; secs: number; level: number }
> = {
  key: { voice: "triangle", octave: 1, secs: 0.16, level: 0.3 },
  bellnote: { voice: "bell", octave: 2, secs: 0.45, level: 0.28 },
  earpiece: { voice: "sine", octave: 1, secs: 0.2, level: 0.3 },
  // a vent: a soft high sine, long enough to ring but never struck like a bell or plucked like a key
  clue: { voice: "sine", octave: 2, secs: 0.3, level: 0.2 },
};

export function chimePlan(kind: ChimeKind, n: number | undefined): PlannedChime[] {
  const note = Number.isFinite(n) ? (n as number) : 0;
  const chimes = Math.max(1, Math.min(MAX_CHIMES, Math.round(note) + 1));
  const v = VOICE[kind];
  return Array.from({ length: chimes }, (_, i) => ({
    at: i * CHIME_GAP_S,
    hz: (PENTATONIC[i] as number) * v.octave,
    voice: v.voice,
    secs: v.secs,
    // a little quieter as the group climbs, so nine in a row stay countable and never shrill
    level: v.level * (1 - i * 0.04),
  }));
}

export const isChimeCue = (s: SoundCue): s is SoundCue & { kind: ChimeKind } =>
  s.kind === "key" || s.kind === "bellnote" || s.kind === "earpiece" || s.kind === "clue";
