// The socket's wire format: JSON text frames `{ t: string, ... }` (binary
// frames are voice only, from phase 08). Widened by later tasks; the table of
// every message is in plans/2026-10-08-sensory-heist-00-overview.md §4.3.

export type ClientMsg = { t: "ping"; at: number };
export type ServerMsg = { t: "welcome"; who: string } | { t: "pong"; at: number };

const MAX_FRAME = 8 * 1024;

// Anything malformed, unknown or oversized is null: the caller drops it and
// keeps the socket open, so one bad frame never ends a game.
export function parseClientMsg(raw: string): ClientMsg | null {
  if (raw.length > MAX_FRAME) return null;
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const msg = body as Record<string, unknown>;
  if (msg.t === "ping" && typeof msg.at === "number" && Number.isFinite(msg.at)) {
    return { t: "ping", at: msg.at };
  }
  return null;
}
