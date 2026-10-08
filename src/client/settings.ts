import type { Role } from "../game/types.ts";

export interface Settings {
  captions: boolean;
  sound: boolean; // game sound: footsteps, hums, clicks and soundboard clips
  speech: boolean; // Say text and callouts read aloud
  keepOpen: boolean; // leave a comms sheet open after sending
}

// What is stored: `captions: null` means "whatever this role defaults to".
export interface Stored extends Omit<Settings, "captions"> {
  captions: boolean | null;
}

interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = "heist.settings";

// Captions are off by default for Can't see, whose game is listening, and on
// for everyone else.
export const defaultsFor = (role: Role): Settings => ({
  captions: role !== "blind",
  sound: true,
  speech: true,
  keepOpen: false,
});

const browserStore = (): Store | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};

// Never throws: storage can be missing, blocked or full, and the game must
// still play with defaults.
export function loadSettings(role: Role, store: Store | null = browserStore()): Settings {
  const base = defaultsFor(role);
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<Stored>;
    return {
      captions: typeof saved.captions === "boolean" ? saved.captions : base.captions,
      sound: typeof saved.sound === "boolean" ? saved.sound : base.sound,
      speech: typeof saved.speech === "boolean" ? saved.speech : base.speech,
      keepOpen: typeof saved.keepOpen === "boolean" ? saved.keepOpen : base.keepOpen,
    };
  } catch {
    return base;
  }
}

export function saveSettings(settings: Stored, store: Store | null = browserStore()): void {
  try {
    store?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // a setting that doesn't stick is not worth interrupting a game for
  }
}
