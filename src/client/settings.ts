import type { Role } from "../game/types.ts";

export interface Settings {
  captions: boolean;
  sound: boolean; // game sound: footsteps, hums, clicks and soundboard clips
  speech: boolean; // Say text and callouts read aloud
  keepOpen: boolean; // leave a comms sheet open after sending
  highContrast: boolean; // high-contrast HUD and canvas palette, every role
  maskNoiseOn: boolean; // the deaf seat's own choice, when the host has turned masking noise on
  volume: number; // 0-1: the deaf seat's masking-noise volume
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

// Captions are on for every role. Can't see's whole game is sound, so a muted
// phone or a loud showcase hall would otherwise leave them with nothing.
export const defaultsFor = (_role: Role): Settings => ({
  captions: true,
  sound: true,
  speech: true,
  keepOpen: false,
  highContrast: false,
  maskNoiseOn: true,
  volume: 0.5,
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
      highContrast:
        typeof saved.highContrast === "boolean" ? saved.highContrast : base.highContrast,
      maskNoiseOn: typeof saved.maskNoiseOn === "boolean" ? saved.maskNoiseOn : base.maskNoiseOn,
      volume: typeof saved.volume === "number" ? saved.volume : base.volume,
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
