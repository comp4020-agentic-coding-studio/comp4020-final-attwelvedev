import type { ConnectionState } from "../client/socket.ts";

const DOT: Record<ConnectionState, string> = {
  live: "●",
  weak: "◐",
  offline: "○",
  connecting: "◌",
};

// The live light: a shape and words, never colour alone (spec §4.1). Live pulses once a second
// (the dot, in CSS); the other states hold still.
export function Connection({ state, rttMs }: { state: ConnectionState; rttMs: number | null }) {
  const text =
    state === "live"
      ? "Live"
      : state === "weak"
        ? `Weak ${rttMs ?? ""} ms`
        : state === "offline"
          ? "Offline. Retrying…"
          : "Connecting…";
  return (
    <p class={`conn conn-${state}`} role="status">
      <span class="conn-dot" aria-hidden="true">
        {DOT[state]}
      </span>{" "}
      {text}
    </p>
  );
}
