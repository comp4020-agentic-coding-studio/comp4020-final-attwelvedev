import type { Seat } from "../game/types.ts";

// Which watchers get what a set of seats received: those following one of those seats. A watcher
// following no one (the whole room, `null`, or never having chosen) gets nothing: that view has no sound.
// Pure, so the rule is tested without a socket (src/net/follow.test.ts) and both the channel messages and
// the voice frames in attach.ts use the one rule.
export function followersOf(
  watchers: readonly string[],
  following: ReadonlyMap<string, Seat | null>,
  receivers: readonly Seat[],
): string[] {
  return watchers.filter((watcher) => {
    const seat = following.get(watcher) ?? null;
    return seat !== null && receivers.includes(seat);
  });
}
