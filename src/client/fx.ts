import type { RoleView } from "../game/perception.ts";
import type { ItemId } from "../game/rooms/format.ts";
import type { Vec } from "../game/types.ts";
import type { EntityView } from "../net/protocol.ts";

// Small, calm effects for what just changed between two views: the sighted
// counterpart of a sound. Worked out on the client from consecutive views (the
// server sends state, not events), so there is nothing extra on the wire, and a
// reconnect simply shows none. Each lasts FX_MS and is one fading shape: nothing
// here flashes, and with reduced motion it fades in place instead of growing.
export const FX_MS = 600;
export const LIFT_MS = 1000; // a take: the item lifting off its plinth to the owner (reduced motion: a cross-fade)
export const FX_MAX = 24; // however busy the room, never more than this at once

export type FxTone = "goal" | "danger" | "ui" | "muted";
export interface Fx {
  // swing: a bell rung; arc: gear handed from `pos` to `to`; cloud: the dye pack's paint puff;
  // slide: a cache's secret door slides into the floor; lift: the keepsake rises off its plinth
  kind: "ring" | "dust" | "spark" | "swing" | "arc" | "cloud" | "slide" | "lift";
  pos: Vec;
  tone: FxTone;
  big?: boolean;
  to?: Vec;
  item?: EntityView["item"];
  keep?: ItemId; // lift: the keepsake that was taken
}

// How long an effect lives: the lift is longer than the rest, which last FX_MS.
export const fxMs = (f: Fx): number => (f.kind === "lift" ? LIFT_MS : FX_MS);

// A cache's door opening or its keepsake taken, from the one team-wide signal the server sends for
// it (RoleView.cacheEvent). Not worked out from entities: a door or the keepsake coming into or
// leaving line of sight looks the same, and a closed secret door is no entity at all.
export function fxOfCacheEvent(event: NonNullable<RoleView["cacheEvent"]>): Fx[] {
  const { at } = event;
  if (event.result === "taken")
    return [
      { kind: "lift", pos: at, tone: "goal", ...(event.item ? { keep: event.item } : {}) },
      { kind: "spark", pos: at, tone: "goal" },
      { kind: "ring", pos: at, tone: "goal", big: true },
    ];
  return [
    { kind: "slide", pos: at, tone: "ui" },
    { kind: "dust", pos: at, tone: "muted" },
  ];
}

const key = (e: EntityView): string => `${e.id}@${e.pos.x},${e.pos.y}`;

// `seenBefore` is the tiles that were in sight in the previous view (none for a watcher). A door out of
// sight is sent closed whatever the truth, so one that is open when it comes into sight looks as if it
// just opened; it only counts as opening if its tile was in sight the view before.
export function detectFx(
  prev: EntityView[],
  next: EntityView[],
  seenBefore?: { has(x: number, y: number): boolean } | null,
): Fx[] {
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
    } else if (
      e.kind === "door" &&
      before?.state === "closed" &&
      e.state === "open" &&
      (!seenBefore || seenBefore.has(Math.floor(e.pos.x), Math.floor(e.pos.y)))
    ) {
      out.push({ kind: "ring", pos: e.pos, tone: "ui" });
    } else if (e.kind === "checkpoint" && before?.state === "up" && e.state === "reached") {
      out.push({ kind: "ring", pos: e.pos, tone: "goal", big: true });
    } else if (e.kind === "sign" && wasById.has(e.id)) {
      // (a sign that was out of sight is not newly ahead: only one seen both times can change)
      const was = wasById.get(e.id)?.progress ?? 0;
      const now = e.progress ?? 0;
      if (now > was) out.push({ kind: "ring", pos: e.pos, tone: "goal" });
      else if (now < was) out.push({ kind: "ring", pos: e.pos, tone: "danger" });
    } else if (
      e.kind === "station" &&
      e.station?.solved &&
      wasById.has(e.id) &&
      !wasById.get(e.id)?.station?.solved
    ) {
      // solved: the goal ring under it (the tick plate stays, drawn with the station). Only one seen
      // unsolved just before: a station back in line of sight was not solved just now.
      const anchor = e.station.parts.find((p) => p.key === "anchor")?.at[0];
      out.push({
        kind: "ring",
        tone: "goal",
        big: true,
        pos: anchor ? { x: anchor.x + 0.5, y: anchor.y + 0.5 } : e.pos,
      });
    } else if (
      e.kind === "bell" &&
      e.state === "on" &&
      wasById.has(e.id) &&
      wasById.get(e.id)?.state !== "on"
    ) {
      out.push({ kind: "swing", pos: e.pos, tone: "ui" });
    } else if (e.kind === "player" && e.item && wasById.has(e.id) && !wasById.get(e.id)?.item) {
      // gear in a hand that was empty: it came from whoever just let go of the same item
      const from = prev.find(
        (o) => o.kind === "player" && o.item === e.item && !nowById.get(o.id)?.item,
      );
      if (from) out.push({ kind: "arc", pos: from.pos, to: e.pos, tone: "ui", item: e.item });
    } else if (e.kind === "crate") {
      const old = wasById.get(e.id);
      if (old && Math.hypot(old.pos.x - e.pos.x, old.pos.y - e.pos.y) >= 0.4) {
        out.push({ kind: "dust", pos: old.pos, tone: "muted" });
      }
    }
  }
  // the team just splattered: the dye pack's cloud, from the station nearest the figures in view
  const dyedNow = next.some((e) => e.kind === "player" && e.dyed);
  const dyedBefore = prev.some((e) => e.kind === "player" && e.dyed);
  if (dyedNow && !dyedBefore) {
    const me = next.find((e) => e.kind === "player" && e.dyed)?.pos ?? { x: 0, y: 0 };
    const near = next
      .filter((e) => e.kind === "station")
      .sort(
        (a, b) =>
          Math.hypot(a.pos.x - me.x, a.pos.y - me.y) - Math.hypot(b.pos.x - me.x, b.pos.y - me.y),
      )[0];
    out.push({ kind: "cloud", pos: near?.pos ?? me, tone: "muted" });
  }
  // loot that is no longer there was picked up
  for (const e of prev) {
    if (e.kind === "loot" && !nowById.has(e.id))
      out.push({ kind: "spark", pos: e.pos, tone: "goal" });
  }
  return out.slice(0, FX_MAX);
}
