import { type Callout, CLIPS, type Stamp } from "../game/channels.ts";
import { CHANNEL_RULES, type Family, type Role } from "../game/types.ts";
import type { ChannelMessage, EntityView, SoundCue } from "../net/protocol.ts";

export const ROLE_GLYPH: Record<Role, string> = { blind: "●", deaf: "■", mute: "▲" };

// What a callout says in words (captions, speech), and what the grid shows.
export const CALLOUT_WORD: Record<Callout, string> = {
  push: "Push",
  up: "Up",
  here: "Here",
  left: "Left",
  stop: "Stop",
  right: "Right",
  wait: "Wait",
  down: "Down",
  go: "Go",
};
export const CALLOUT_FACE: Record<Callout, string> = {
  ...CALLOUT_WORD,
  up: "↑",
  left: "←",
  right: "→",
  down: "↓",
};

// How a stamp looks on the map and in its grid, and what it is called aloud.
export const STAMP_FACE: Record<Stamp, string> = {
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
  x: "✕",
  question: "?",
  bang: "!",
  door: "Door",
  key: "Key",
};
export const STAMP_NAME: Record<Stamp, string> = {
  up: "Arrow up",
  down: "Arrow down",
  left: "Arrow left",
  right: "Arrow right",
  x: "Cross",
  question: "Question mark",
  bang: "Exclamation mark",
  door: "Door",
  key: "Key",
};

// A channel message as a caption: who said it (their role's shape and their
// name), then what. Sounds are in square brackets, as captions write them.
export interface Caption {
  role: Role;
  name: string;
  text: string;
}

// Null when the message is already a picture (faces and stamps).
export function captionFor(m: ChannelMessage): Caption | null {
  const who = { role: m.from.role, name: m.from.nickname };
  if (m.family === "say") {
    return { ...who, text: m.kind === "callout" ? CALLOUT_WORD[m.callout] : m.text };
  }
  if (m.family === "sound") {
    return { ...who, text: `[${CLIPS.find((c) => c.id === m.clip)?.label ?? m.clip}]` };
  }
  return null;
}

const SIDE = 0.2;
const CUE_WORD: Record<SoundCue["kind"], string> = {
  footsteps: "footsteps",
  hum: "hum",
  door: "door click",
};

// What the room sounds like right now, as captions: one per sound and side.
export function cueCaptions(sounds: SoundCue[]): string[] {
  const out = new Set<string>();
  for (const s of sounds) {
    if (s.kind === "hum") {
      out.add("[hum]");
      continue;
    }
    const side = s.pan < -SIDE ? "left" : s.pan > SIDE ? "right" : "ahead";
    out.add(`[${CUE_WORD[s.kind]}, ${side}]`);
  }
  return [...out];
}

export function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// "01-loading-dock" -> "Loading dock"
export function roomTitle(id: string): string {
  const words = id.replace(/^\d+-/, "").replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface TrayTile {
  family: Family;
  label: string;
  canSend: boolean;
  receivers: Role[]; // who it goes to, in role order
  youReceive: boolean;
}

const FAMILIES: [Family, string][] = [
  ["say", "Say"],
  ["sound", "Sound"],
  ["show", "Show"],
];

// A family a role can't send on stays in the tray (shown as "Can't send"), never hidden.
export function trayFor(role: Role): TrayTile[] {
  return FAMILIES.map(([family, label]) => {
    const rule = CHANNEL_RULES[family];
    return {
      family,
      label,
      canSend: rule.send.includes(role),
      receivers: [...rule.receive],
      youReceive: rule.receive.includes(role),
    };
  });
}

const JUMP_TILES = 3; // further than this in one view is a push or a reconnect, not a walk

// Blends positions between two views so others glide at 60 fps between 20 Hz
// updates. Anything new or far away snaps to the new position.
export function lerpEntities(prev: EntityView[], next: EntityView[], t: number): EntityView[] {
  const k = Math.max(0, Math.min(1, t));
  const old = new Map<string, EntityView>();
  for (const e of prev) old.set(`${e.kind}:${e.id}`, e);
  return next.map((e) => {
    const was = old.get(`${e.kind}:${e.id}`);
    if (!was || e.kind !== "player") return e;
    if (Math.hypot(e.pos.x - was.pos.x, e.pos.y - was.pos.y) > JUMP_TILES) return e;
    return {
      ...e,
      pos: { x: was.pos.x + (e.pos.x - was.pos.x) * k, y: was.pos.y + (e.pos.y - was.pos.y) * k },
    };
  });
}
