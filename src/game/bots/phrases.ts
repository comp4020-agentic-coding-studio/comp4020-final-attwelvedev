// What a guiding bot says besides the callouts, in a few words per situation.
// It is flavour: the bot never relies on it being heard or understood.
export type Situation = "start" | "moving" | "waiting" | "arrived" | "cleared";

export const PHRASES: Record<Situation, readonly string[]> = {
  start: [
    "Okay, I've got you. Listen for my calls.",
    "Stay with me. I'll steer.",
    "Ready when you are. Follow my voice.",
    "I can see the room. You just listen.",
    "Nice and easy. One call at a time.",
    "Don't worry, I've got eyes on everything.",
  ],
  moving: [
    "Keep going, you're doing great.",
    "Nice and steady.",
    "Still clear ahead.",
    "Right on track.",
    "Good pace. Don't stop yet.",
    "You're moving well.",
    "Straight on for a bit.",
  ],
  waiting: [
    "Hold on, something's watching.",
    "Wait for it. Not yet.",
    "Patience. Danger up ahead.",
    "Stay put, I'll tell you when.",
    "Almost clear. Just a moment.",
    "Hold still. I'm timing it.",
  ],
  arrived: [
    "That's the spot. Hold it there.",
    "Perfect. Stay on it.",
    "You're on it. Don't move.",
    "Right there. Nicely done.",
    "Good, that's your plate. Hold.",
    "Spot on. Keep it pressed.",
  ],
  cleared: [
    "We did it! Room cleared.",
    "That's the room. Great work, team.",
    "Clean run. Onward.",
    "All clear. Take a breath.",
    "Smooth. Let's keep that going.",
    "Done and dusted.",
  ],
};

// A phrase for `situation` that is not in `used`, picked by `seed` so a
// caller with a counter gets variety and a test gets the same answer twice.
// When every phrase has been used the situation's list starts over.
export function pickPhrase(situation: Situation, used: Set<string>, seed: number): string {
  const list = PHRASES[situation];
  let fresh = list.filter((p) => !used.has(p));
  if (fresh.length === 0) {
    for (const p of list) used.delete(p);
    fresh = [...list];
  }
  const phrase = fresh[Math.abs(seed) % fresh.length] as string;
  used.add(phrase);
  return phrase;
}
