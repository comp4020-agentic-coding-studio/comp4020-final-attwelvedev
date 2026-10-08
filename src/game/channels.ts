import { CHANNEL_RULES, type Family, type Role, type Seat, type Vec } from "./types.ts";

// The 3×3 callout grid, in reading order.
export const CALLOUTS = [
  "push",
  "up",
  "here",
  "left",
  "stop",
  "right",
  "wait",
  "down",
  "go",
] as const;
export type Callout = (typeof CALLOUTS)[number];
export const STAMPS = [
  "up",
  "down",
  "left",
  "right",
  "x",
  "question",
  "bang",
  "door",
  "key",
] as const;
export type Stamp = (typeof STAMPS)[number];

export const COOLDOWN_MS: Record<Family, number> = { say: 0, sound: 3000, show: 1500 };
export const STAMP_COOLDOWN_MS = 1000;
export const MAX_TEXT = 120;

export type Outgoing =
  | { family: "say"; kind: "callout"; callout: Callout }
  | { family: "say"; kind: "text"; text: string }
  | { family: "sound"; clip: string }
  | { family: "show"; kind: "face"; id: string }
  | { family: "show"; kind: "stamp"; id: Stamp; at: Vec };

export type ChannelMessage = Outgoing & {
  from: { seat: Seat; role: Role; nickname: string };
  sentAt: number;
};

export interface CooldownState {
  until: Record<string, number>; // key `${seat}:${family}` or `${seat}:stamp`
}

export type RouteResult =
  | { ok: true; receivers: Seat[]; cooldownKey: string | null; until: number }
  | { ok: false; code: "cant-send" | "cooldown"; until?: number };

// The one place that decides who may send what, to whom, and how often. The
// caller records `until` under `cooldownKey` on success.
export function route(
  roles: [Role, Role, Role],
  from: Seat,
  msg: Outgoing,
  cd: CooldownState,
  now: number,
): RouteResult {
  const rule = CHANNEL_RULES[msg.family];
  if (!rule.send.includes(roles[from])) return { ok: false, code: "cant-send" };

  const stamp = msg.family === "show" && msg.kind === "stamp";
  const ms = stamp ? STAMP_COOLDOWN_MS : COOLDOWN_MS[msg.family];
  const cooldownKey = ms > 0 ? `${from}:${stamp ? "stamp" : msg.family}` : null;
  const busy = cooldownKey ? (cd.until[cooldownKey] ?? 0) : 0;
  if (busy > now) return { ok: false, code: "cooldown", until: busy };

  const receivers = ([0, 1, 2] as const).filter((seat) => rule.receive.includes(roles[seat]));
  return { ok: true, receivers, cooldownKey, until: now + ms };
}

// Free text as it is shown and spoken: no control characters, trimmed, at most
// MAX_TEXT characters. Null when nothing is left to say.
export function cleanText(raw: string): string | null {
  const text = raw
    .replace(/\p{Cc}/gu, "")
    .trim()
    .slice(0, MAX_TEXT)
    .trim();
  return text === "" ? null : text;
}
