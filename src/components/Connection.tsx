import type { ConnectionState } from "../client/socket.ts";

// The connection pill: a shape and words, never colour alone (spec §4.1).
export function Connection({ state, rttMs }: { state: ConnectionState; rttMs: number | null }) {
  const text =
    state === "live"
      ? "● Live"
      : state === "weak"
        ? `◐ Weak ${rttMs ?? ""} ms`
        : state === "offline"
          ? "○ Offline. Retrying…"
          : "◌ Connecting…";
  return (
    <p class={`conn conn-${state}`} role="status">
      {text}
    </p>
  );
}
