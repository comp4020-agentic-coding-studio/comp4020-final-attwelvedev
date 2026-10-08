import { CHANNEL_RULES, type Family, type Role } from "../game/types.ts";
import type { EntityView } from "../net/protocol.ts";

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
