// What a person has said about how they are playing in real life. It never gates anything: it
// only decides what the reveal tells them (ADR 0013). Pure, so the browser can save and load it.
export interface Setup {
  headphones: boolean;
  inRoom: boolean; // in the same room as the others
  captions: boolean; // always show captions
  earplugs: boolean;
  mask: boolean; // sleep mask or blindfold
  done: boolean; // answered at least once ("Set up" in the lobby)
}

export const DEFAULT_SETUP: Setup = {
  headphones: true,
  inRoom: false,
  captions: false,
  earplugs: false,
  mask: false,
  done: false,
};

export const SETUP_KEYS = Object.keys(DEFAULT_SETUP) as (keyof Setup)[];

// A setup from untrusted data: every field must be a boolean, or the whole thing is refused.
export function parseSetup(raw: unknown): Setup | null {
  if (typeof raw !== "object" || raw === null) return null;
  const m = raw as Record<string, unknown>;
  if (!SETUP_KEYS.every((k) => typeof m[k] === "boolean")) return null;
  return Object.fromEntries(SETUP_KEYS.map((k) => [k, m[k]])) as unknown as Setup;
}

// "In the room" only means something with company: one person saying so, with everyone else
// remote, is playing alone. The reveal's real-life lines and the lobby's chips both ask this.
export const sharesRoom = (setups: readonly Setup[]): boolean =>
  setups.filter((s) => s.inRoom).length >= 2;
