import { DEFAULT_SETUP, SETUP_KEYS, type Setup } from "../game/setup.ts";

// A person's real-life setup is remembered in this browser only and sent when they join a lobby;
// the server keeps it for the lobby's life (ADRs 0008, 0013). Storage can be blocked, so every
// access is guarded, like the nickname's.
const KEY = "heist.setup";

interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const browserStore = (): Store | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};

// Missing, corrupt or half-wrong data gives the defaults for what is wrong and keeps what is right.
export function loadSetup(store: Store | null = browserStore()): Setup {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETUP };
    const saved: unknown = JSON.parse(raw);
    if (typeof saved !== "object" || saved === null) return { ...DEFAULT_SETUP };
    const out: Setup = { ...DEFAULT_SETUP };
    for (const key of SETUP_KEYS) {
      const value = (saved as Record<string, unknown>)[key];
      if (typeof value === "boolean") out[key] = value;
    }
    return out;
  } catch {
    return { ...DEFAULT_SETUP };
  }
}

export function saveSetup(setup: Setup, store: Store | null = browserStore()): void {
  try {
    store?.setItem(KEY, JSON.stringify(setup));
  } catch {
    // a blocked store just means asking again next time
  }
}
