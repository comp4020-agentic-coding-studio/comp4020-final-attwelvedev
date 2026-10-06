export interface FailureThrottle {
  blocked(key: string, now?: number): boolean; // true once `limit` failures fall inside the window
  fail(key: string, now?: number): void;
}

// Counts only failures, so honest traffic is never slowed. State is in
// memory: a restart forgets it, which costs a guesser nothing they didn't
// already have to wait for.
export function failureThrottle(opts: { limit: number; windowMs: number }): FailureThrottle {
  const failures = new Map<string, number[]>();

  const recent = (key: string, now: number): number[] => {
    const kept = (failures.get(key) ?? []).filter((at) => now - at < opts.windowMs);
    if (kept.length) failures.set(key, kept);
    else failures.delete(key);
    return kept;
  };

  return {
    blocked: (key, now = Date.now()) => recent(key, now).length >= opts.limit,
    fail: (key, now = Date.now()) => {
      failures.set(key, [...recent(key, now), now]);
    },
  };
}

// About 6,400 invite codes exist, so guessing them is the threat.
export const joinThrottle = failureThrottle({ limit: 10, windowMs: 60_000 });

// Fly's proxy sets Fly-Client-IP (and overwrites a client-supplied one);
// anywhere else it is spoofable, which is accepted because only Fly exposes
// this app. Locally every client shares the socket address.
export function throttleKey(headers: Headers, clientAddress: string): string {
  return headers.get("fly-client-ip") ?? clientAddress;
}
