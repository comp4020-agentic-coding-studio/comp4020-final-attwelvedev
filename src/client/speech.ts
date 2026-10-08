import type { Role } from "../game/types.ts";

export const SUPERSEDE_MS = 300;

interface Synth<U> {
  speak(utterance: U): void;
  cancel(): void;
}

export interface Speech {
  say(text: string): void;
}

// Reads Say text aloud: for Can't see, who needs it, and Can't speak, who can
// read it too, while the "spoken lines" setting is on. A line that follows another within
// SUPERSEDE_MS of it starting replaces it, so a burst of callouts doesn't queue
// into a long speech about where the guard was.
export function createSpeech<U>(options: {
  synth: Synth<U> | null;
  role: Role;
  enabled: () => boolean;
  utter: (text: string) => U;
  now?: () => number;
}): Speech {
  const now = options.now ?? Date.now;
  let startedAt = Number.NEGATIVE_INFINITY;
  return {
    say(text) {
      const { synth, role } = options;
      if (!synth) return;
      if (role === "deaf" || !options.enabled()) return;
      const t = now();
      if (t - startedAt < SUPERSEDE_MS) synth.cancel();
      startedAt = t;
      synth.speak(options.utter(text));
    },
  };
}

// The browser's own synthesis, or nothing where it is missing.
export function browserSpeech(role: Role, enabled: () => boolean): Speech {
  const has =
    typeof speechSynthesis !== "undefined" && typeof SpeechSynthesisUtterance !== "undefined";
  return createSpeech({
    synth: has ? speechSynthesis : null,
    role,
    enabled,
    utter: (text) => new SpeechSynthesisUtterance(text),
  });
}
