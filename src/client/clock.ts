export interface PingSample {
  sent: number; // this page's clock when the ping left
  serverAt: number; // the server's clock when it answered
  received: number; // this page's clock when the pong arrived
}

const KEPT = 5;

// How far the server's clock is ahead of this page's, in ms: the server's time minus the middle of
// the round trip, as the median of the last five pings so one ping stuck in a queue changes nothing.
export function offsetFromPings(samples: PingSample[]): number | null {
  const offsets = samples
    .slice(-KEPT)
    .map((s) => s.serverAt - (s.sent + s.received) / 2)
    .sort((a, b) => a - b);
  if (offsets.length === 0) return null;
  const mid = Math.floor(offsets.length / 2);
  return offsets.length % 2
    ? (offsets[mid] as number)
    : ((offsets[mid - 1] as number) + (offsets[mid] as number)) / 2;
}
