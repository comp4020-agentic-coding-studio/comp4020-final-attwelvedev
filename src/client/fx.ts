import type { Vec } from "../game/types.ts";
import type { EntityView } from "../net/protocol.ts";

// Small, calm effects for what just changed between two views: the sighted
// counterpart of a sound. Worked out on the client from consecutive views (the
// server sends state, not events), so there is nothing extra on the wire, and a
// reconnect simply shows none. Each lasts FX_MS and is one fading shape: nothing
// here flashes, and with reduced motion it fades in place instead of growing.
export const FX_MS = 600;
export const FX_MAX = 24; // however busy the room, never more than this at once

export type FxTone = "goal" | "danger" | "ui" | "muted";
export interface Fx {
  kind: "ring" | "dust" | "spark";
  pos: Vec;
  tone: FxTone;
  big?: boolean;
}

const key = (e: EntityView): string => `${e.id}@${e.pos.x},${e.pos.y}`;

export function detectFx(prev: EntityView[], next: EntityView[]): Fx[] {
  if (prev.length === 0) return []; // the first view: everything would look new
  const out: Fx[] = [];
  const was = new Map(prev.map((e) => [key(e), e]));
  const nowById = new Map(next.map((e) => [e.id, e]));
  const wasById = new Map(prev.map((e) => [e.id, e]));

  for (const e of next) {
    // plates, doors and checkpoints keep their place: compare the same one
    const before = was.get(key(e));
    if (e.kind === "plate" && before && before.state !== e.state) {
      out.push({ kind: "ring", pos: e.pos, tone: e.state === "pressed" ? "goal" : "muted" });
    } else if (e.kind === "door" && before?.state === "closed" && e.state === "open") {
      out.push({ kind: "ring", pos: e.pos, tone: "ui" });
    } else if (e.kind === "checkpoint" && before?.state === "up" && e.state === "reached") {
      out.push({ kind: "ring", pos: e.pos, tone: "goal", big: true });
    } else if (e.kind === "sign") {
      const was = wasById.get(e.id)?.progress ?? 0;
      const now = e.progress ?? 0;
      if (now > was) out.push({ kind: "ring", pos: e.pos, tone: "goal" });
      else if (now < was) out.push({ kind: "ring", pos: e.pos, tone: "danger" });
    } else if (e.kind === "crate") {
      const old = wasById.get(e.id);
      if (old && Math.hypot(old.pos.x - e.pos.x, old.pos.y - e.pos.y) >= 0.4) {
        out.push({ kind: "dust", pos: old.pos, tone: "muted" });
      }
    }
  }
  // loot that is no longer there was picked up
  for (const e of prev) {
    if (e.kind === "loot" && !nowById.has(e.id))
      out.push({ kind: "spark", pos: e.pos, tone: "goal" });
  }
  return out.slice(0, FX_MAX);
}
