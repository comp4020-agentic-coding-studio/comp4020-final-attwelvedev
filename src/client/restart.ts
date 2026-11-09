// What the game page remembers of a finished room, and what a passed restart leaves of it. The page
// shows the heist-complete screen in place of the room whenever it holds a heist result, so a restart
// that left it behind would cover the restarted room with the old result for good.
export interface Remembered {
  summary: unknown;
  heist: unknown;
}

export function afterRestart(
  _before: Remembered,
  _kind?: "room" | "heist",
): { summary: null; heist: null } {
  return { summary: null, heist: null };
}
