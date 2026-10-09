// Pages and the socket server run as separate module instances (CLAUDE.md "Layering"), so
// what one knows that the other needs lives on `globalThis` behind one accessor, as
// `sharedStats()` does. Here: a device asked for a page of the site. The pages that open no
// socket (About, Credits) are how the server learns someone has gone to read something else.
// `lobby` is the code in the address, for a lobby's own page
type PageView = (who: string, lobby?: string) => void;

const KEY = Symbol.for("heist.presence");
type Store = { listeners: PageView[] };

export function sharedPresence() {
  const g = globalThis as unknown as Record<symbol, Store | undefined>;
  g[KEY] ??= { listeners: [] };
  const store = g[KEY] as Store;
  return {
    // `who` is the device's hash (what the socket server calls `who`)
    pageViewed(who: string, lobby?: string): void {
      for (const listener of store.listeners) listener(who, lobby);
    },
    onPageView(listener: PageView): void {
      store.listeners.push(listener);
    },
  };
}
