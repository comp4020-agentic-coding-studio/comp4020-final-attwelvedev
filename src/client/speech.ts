import type { Role } from "../game/types.ts";

export const SUPERSEDE_MS = 300;

interface Synth<U> {
  speak(utterance: U): void;
  cancel(): void;
}

export interface Speech {
  say(text: string): void;
  stop(): void; // empties the queue: nothing already said is spoken after this
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
    stop() {
      options.synth?.cancel();
    },
  };
}

// Speaks what `listen` hands it until the returned cleanup runs, which also empties the queue.
// The browser's queue is global and outlives the game that filled it: a game ends (unmounts) when
// the next room's reveal opens, and a line queued in the room just cleared must not be spoken over
// it (playtest 3, B2).
export function speakWhile(
  speech: Speech,
  listen: (say: (text: string) => void) => () => void,
): () => void {
  const off = listen((text) => speech.say(text));
  return () => {
    off();
    speech.stop();
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
