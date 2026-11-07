// Whether the reveal's "Who perceives what" is open: folded the first time, then as the person last left
// it. Its own key, not a field of `heist.settings`: Game.tsx holds the Settings it loaded at mount and
// writes them back whole on any in-game change, which would undo a toggle made after mount.

interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = "heist.reveal";

const browserStore = (): Store | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};

// Never throws: missing, unreadable or blocked storage reads as folded.
export function loadRevealOpen(store: Store | null = browserStore()): boolean {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw) as { open?: unknown } | null;
    return saved?.open === true;
  } catch {
    return false;
  }
}

export function saveRevealOpen(open: boolean, store: Store | null = browserStore()): void {
  try {
    store?.setItem(KEY, JSON.stringify({ open }));
  } catch {
    // a fold that isn't remembered is not worth interrupting a game for
  }
}
