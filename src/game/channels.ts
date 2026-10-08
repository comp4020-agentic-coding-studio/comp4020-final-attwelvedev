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
export const STAMP_LIFE_MS = 8000; // a stamp fades over this long, then is gone
export const FACE_POP_MS = 1500; // how long a face shows above its sender

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

// The bundled faces (bluemoji.io, credited in CREDITS.md). `id` is what goes on
// the wire; `file` is under public/faces/. The first six are the Show hotbar.
export const FACES = [
  { id: "f01", file: "ok-sign-blue-emoji-blue.png", label: "OK" },
  { id: "f02", file: "double-thumbs-up-emoji-blue.png", label: "Double thumbs up" },
  { id: "f03", file: "thumbs-down-blue-emoji-blue.png", label: "Thumbs down" },
  { id: "f04", file: "hold-up-blue-emoji-blue.png", label: "Hold up" },
  { id: "f05", file: "shrug-blue-emoji-blue.png", label: "Shrug" },
  { id: "f06", file: "desperate-blue-emoji-blue.png", label: "Desperate" },
  { id: "f07", file: "pointing-and-laughing-in-tears-blue-emoji-blue.png", label: "Laughing" },
  { id: "f08", file: "shy-blue-emoji-blue.png", label: "Shy" },
  { id: "f09", file: "thousand-yard-stare-blue-emoji-blue.png", label: "Thousand-yard stare" },
  { id: "f10", file: "secret-keep-quiet-hush-mewing-blue-emoji-blue.png", label: "Hush" },
  { id: "f11", file: "devious-blue-emoji-blue.png", label: "Devious" },
  { id: "f12", file: "trying-not-to-laugh-blue-emoji-blue.png", label: "Trying not to laugh" },
] as const;

// The soundboard: ids are file names under public/sounds/ (id.mp3), at most 12
// and 3 s each, credited in CREDITS.md. The first six are the hotbar.
export const CLIPS: readonly { id: string; label: string }[] = [
  { id: "airhorn", label: "Air horn" },
  { id: "ding-correct", label: "Truth" },
  { id: "buzzer-wrong", label: "Lie" },
  { id: "bruh", label: "Bruh" },
  { id: "sus", label: "Sus" },
  { id: "wilhelm-scream", label: "Scream" },
  { id: "fah", label: "Fah" },
  { id: "i-got-this", label: "I got this" },
  { id: "yeah-boy", label: "Yeah boy" },
  { id: "thud", label: "Thud" },
  { id: "goofy-car-horn", label: "Car horn" },
  { id: "crickets", label: "Crickets" },
];
