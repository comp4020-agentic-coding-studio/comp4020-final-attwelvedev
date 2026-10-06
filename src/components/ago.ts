const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// "just now", "20 min ago", "2 h ago", "3 days ago". A time in the future (a
// slow clock) reads as just now.
export function ago(then: number, now: number): string {
  const elapsed = now - then;
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} h ago`;
  const days = Math.floor(elapsed / DAY);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}
