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
  guard: "guard footsteps",
  camera: "camera whir",
  laser: "laser hum",
  loot: "loot chime",
  checkpoint: "checkpoint chime",
  caught: "siren",
  alarm: "alarm",
  step: "your footsteps",
  bump: "you bump into something",
  plate: "plate click",
  "plate-up": "plate release",
  crate: "crate scrape",
  flag: "at the flag",
  exit: "on the exit",
  "seq-ok": "right plate",
  "seq-wrong": "wrong plate",
  "seq-open": "sequence door unlocked",
  hide: "rustle",
  cleared: "room cleared",
};

// Heard by the whole team from nowhere in particular, so no side is named.
const EVERYWHERE = new Set<SoundCue["kind"]>(["checkpoint", "caught", "alarm", "bump", "cleared"]);

// Some sounds carry a count: how many are at the flag or the exit, how many plates are done.
function word(s: SoundCue): string {
  if (s.kind === "flag" || s.kind === "exit") return `${CUE_WORD[s.kind]} ${s.n ?? 0}/3`;
  if (s.kind === "seq-ok") return `${CUE_WORD[s.kind]}: ${s.n ?? 0} done`;
  return CUE_WORD[s.kind];
}

// What the room sounds like right now, as captions: one per sound and side.
export function cueCaptions(sounds: SoundCue[]): string[] {
  const out = new Set<string>();
  for (const s of sounds) {
    if (s.kind === "step") continue; // you made it: nothing to caption
    if (s.kind === "hum") {
      out.add("[hum]");
      continue;
    }
    if (EVERYWHERE.has(s.kind)) {
      out.add(`[${word(s)}]`);
      continue;
    }
    const side = s.pan < -SIDE ? "left" : s.pan > SIDE ? "right" : "ahead";
    out.add(`[${word(s)}, ${side}]`);
  }
  return [...out];
}

export const CUE_HOLD_MS = 2000; // how long a cue caption stays after it was last heard
const MAX_CUES = 4;

// Remembers each cue caption until CUE_HOLD_MS after it last came in, newest last.
// A one-shot sound lives in a single 50 ms view, so showing only the newest view
// would almost never show it; this is what makes a camera whir readable.
export function hearCues(held: Map<string, number>, captions: string[], now: number): void {
  for (const c of captions) {
    held.delete(c); // so a repeat moves to the end
    held.set(c, now + CUE_HOLD_MS);
  }
}

// The captions still within their hold, forgetting the rest.
export function heardCues(held: Map<string, number>, now: number): string[] {
  for (const [caption, until] of held) if (until <= now) held.delete(caption);
  return [...held.keys()].slice(-MAX_CUES);
}

export function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
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

// The words for the team being sent back: what got whom, and where they restart. The same
// line is shown to everyone and spoken to Can't see, so nobody has to work it out from a
// sound, least of all in the dark where the hazards cannot be seen.
export function caughtText(
  c: { hazard: "guard" | "camera" | "laser"; seat: number; checkpoint: number },
  crew: readonly { nickname: string }[],
  mySeat: number,
): string {
  const you = c.seat === mySeat;
  const who = you ? "you" : (crew[c.seat]?.nickname ?? "someone");
  const subject = you ? "You" : who;
  const what =
    c.hazard === "laser"
      ? `${subject} walked into a laser.`
      : c.hazard === "guard"
        ? `The guard saw ${who}.`
        : `A camera saw ${who}.`;
  return `${what} Back to ${c.checkpoint > 0 ? `checkpoint ${c.checkpoint}` : "the start"}.`;
}

// The line for the host role passing to someone else (the host left, or was replaced): who it
// is now, and to the new host that it is them. Nothing when the host is the same, or not
// known yet.
export function hostChangeText(
  before: { name: string | null; you: boolean },
  after: { name: string | null; you: boolean },
): string | null {
  if (before.name === null || after.name === null) return null;
  if (before.name === after.name && before.you === after.you) return null;
  return after.you ? "You are now the host." : `${after.name} is now the host.`;
}

// The line for a seat changing hands in the crew list: a person left and a bot took the seat,
// or a person came back and took it from the bot. Null when nothing like that changed.
export function crewChangeText(
  before: readonly { seat: number; nickname: string; bot: boolean }[],
  after: readonly { seat: number; nickname: string; bot: boolean }[],
): string | null {
  for (const now of after) {
    const was = before.find((b) => b.seat === now.seat);
    if (!was) continue;
    if (now.bot && !was.bot) return `${was.nickname} left the game. A bot took their seat.`;
    if (!now.bot && was.bot) return `${now.nickname} is back.`;
  }
  return null;
}
