import type { RoleView } from "../game/perception.ts";
import type { ItemId } from "../game/rooms/format.ts";
import type { Vec } from "../game/types.ts";
import type { EntityView } from "../net/protocol.ts";

// Small, calm effects for what just changed between two views: the sighted counterpart of a sound.
// Worked out on the client from consecutive views (the server sends state, not events), so there is
// nothing extra on the wire, and a reconnect simply shows none. Each event moves the thing it happened
// to (FR15): an effect names that thing by `targetId`, and its own drawer reads it (`activeFx`) and
// moves in its own painter row and light. The ring is reserved for a station solved and your landing
// (FR16). Nothing here flashes; with reduced motion each drawer draws its end state.
export const FX_MS = 600;
export const LIFT_MS = 1000; // a take: the item lifting off its plinth (reduced motion: a fade in place)
export const FX_MAX = 24; // however busy the room, never more than this at once

export type FxTone = "goal" | "danger" | "ui" | "muted";
// How long each kind of effect lives (ms): the motion plan's §4.2 table, row by row.
export const DURATION = {
  ring: FX_MS, // a station solved (big, at its anchor) and your landing (small): the only rings
  dust: FX_MS, // a cache's secret door's puff
  curtain: FX_MS, // a secret door or vault sinking: a curtain of dust
  spark: FX_MS,
  arc: FX_MS, // gear handed from `pos` to `to` (the flight is its first 250 ms)
  cloud: FX_MS, // the dye pack's paint puff
  slide: FX_MS, // a cache's secret door sinks into the floor
  lift: LIFT_MS, // the keepsake rises off its plinth: no ring, no spark
  press: 180, // a plate pressed: it sinks, with a puff each side
  release: 200, // a plate let go: it springs up, no dust
  door: 450, // the leaves part and sink, a line of dust along the seam
  crate: 250, // a 2° rock and a trail of dust where it was
  loot: 400, // the loot hops and arcs to the nearest figure, then a spark
  take: 250, // gear picked up: the figure hops
  drop: 250, // gear put down: it bounces
  pip: 220, // a figure at the flag: the pole wobbles
  unfurl: 500, // the checkpoint set: the pennant waves once
  march: 400, // the exit occupied: its hatching marches out
  hop: 600, // the room cleared: every figure hops twice
  hide: 250, // a figure squashes into a hide spot
  stamp: 200, // a sign's right plate: the sign stamps
  shake: 900, // a sign's reset: one ±4 px shake (300 ms), then steady
  ripple: 400, // a sign's sequence done: a fill spreads
  tick: FX_MS, // a station solved: its tick plate drops in
  part: 250, // a station's part changed: a short dip
  snip: 150, // a wire cut: its swatch splits and the halves lift apart, with a spark at the cut
  bell: 1200, // a bell rung: three swings, once
  read: 400, // a braille plate read: its studs lift in reading order
  jam: 440, // a station jammed: a stutter
  join: 150, // hands joined: the beads meet
  unjoin: 150, // hands let go: the beads retract
  lever: 280, // a lever thrown, then a thud
  camera: 250, // a camera wakes: a nod
  laser: 150, // a laser on: the beam draws
  dye: FX_MS, // a figure splattered: its blotches splat in, 80 ms apart
  caught: 450, // caught: a burst where they were, then they pop up at the flag
} as const satisfies Record<string, number>;
export type FxKind = keyof typeof DURATION;
export interface Fx {
  kind: FxKind;
  pos: Vec;
  tone: FxTone;
  big?: boolean;
  to?: Vec; // arc, loot, join, unjoin, caught: where it goes or the other end
  item?: EntityView["item"];
  keep?: ItemId; // lift: the keepsake that was taken
  door?: true; // door: an ordinary door opening, drawn wherever it is (ADR 0025 FR5)
  // the thing in the room the motion is about (its entity id), or "landed" for the intro's land
  targetId?: string;
}

// How long an effect lives, by its kind (DURATION).
export const fxMs = (f: Fx): number => DURATION[f.kind];

// The live effect on one thing in the room (its `targetId`), the newest if it has several (of one
// kind, when given): what its own drawer reads to move it (FR15). Undefined once its life is over.
export function activeFx(
  fx: readonly (Fx & { age: number })[] | undefined,
  id: string,
  kind?: FxKind,
): (Fx & { age: number }) | undefined {
  if (!fx) return undefined;
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i] as Fx & { age: number };
    if (f.targetId === id && f.age >= 0 && f.age < 1 && (!kind || f.kind === kind)) return f;
  }
  return undefined;
}

// How far through its motion of `kind` a thing is (0 to 1), or undefined when it is at rest: no live
// effect, or reduced motion, where every drawer draws its end state (NFR-a11y).
export function motionT(
  scene: { fx?: readonly (Fx & { age: number })[]; reducedMotion?: boolean },
  id: string,
  kind: FxKind,
): number | undefined {
  if (scene.reducedMotion) return undefined;
  return activeFx(scene.fx, id, kind)?.age;
}

// A cache's door opening or its keepsake taken, from the one team-wide signal the server sends for
// it (RoleView.cacheEvent). Not worked out from entities: a door or the keepsake coming into or
// leaving line of sight looks the same, and a closed secret door is no entity at all.
export function fxOfCacheEvent(event: NonNullable<RoleView["cacheEvent"]>): Fx[] {
  const { at } = event;
  if (event.result === "taken")
    return [{ kind: "lift", pos: at, tone: "goal", ...(event.item ? { keep: event.item } : {}) }];
  return [
    { kind: "slide", pos: at, tone: "ui" },
    { kind: "curtain", pos: at, tone: "muted" },
  ];
}

// A wire cut in sight this tick (RoleView.cuts): a spark at the wire. A wrong cut is redrawn away in the
// same step, so the panel has no swatch left to split and detectFx finds nothing; a right cut already
// sparks there (detectFx's solved branch), so a cut with a spark at its wire in `fresh` is skipped.
export function fxOfCuts(cuts: RoleView["cuts"], fresh: readonly Fx[]): Fx[] {
  return (cuts ?? [])
    .filter(
      (c) => !fresh.some((f) => f.kind === "spark" && f.pos.x === c.at.x && f.pos.y === c.at.y),
    )
    .map((c) => ({ kind: "spark", pos: c.at, tone: "ui" }));
}

// The room cleared: every figure in view hops twice (FR17).
export function fxOfCleared(entities: readonly EntityView[]): Fx[] {
  return entities
    .filter((e) => e.kind === "player")
    .map((e) => ({ kind: "hop" as const, pos: e.pos, tone: "goal" as const, targetId: e.id }));
}

// The team caught: each figure that jumped 2 tiles or more between two views (sent back to the flag)
// squashes into a burst where it was, then pops up where it is now (FR17).
export const CAUGHT_JUMP = 2;
export function fxOfCaught(prev: readonly EntityView[], next: readonly EntityView[]): Fx[] {
  const was = new Map(prev.filter((e) => e.kind === "player").map((e) => [e.id, e]));
  const out: Fx[] = [];
  for (const e of next) {
    const old = e.kind === "player" ? was.get(e.id) : undefined;
    if (!old) continue;
    if (Math.hypot(old.pos.x - e.pos.x, old.pos.y - e.pos.y) < CAUGHT_JUMP) continue;
    out.push({ kind: "caught", pos: old.pos, to: e.pos, tone: "danger", targetId: e.id });
  }
  return out;
}

const key = (e: EntityView): string => `${e.id}@${e.pos.x},${e.pos.y}`;

// Every ordinary door's true state is sent to every sighted seat (ADR 0025), so a door that goes from
// closed to open between two views has just opened, wherever it is. One per door.
// A door of several tiles is one entity per tile with one id: it counts once.
export function openedDoors(prev: EntityView[], next: EntityView[]): EntityView[] {
  if (prev.length === 0) return []; // the first view: everything would look new
  const was = new Map(prev.map((e) => [key(e), e]));
  const seen = new Set<string>();
  return next.filter((e) => {
    if (e.kind !== "door" || was.get(key(e))?.state !== "closed" || e.state !== "open")
      return false;
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}

// The wires cut between two views of a panel whose face was in sight both times: a furniture-only
// view carries no `cut`, so a cut seen for the first time on walking up is not one just made.
type StationView = NonNullable<EntityView["station"]>;
function snipped(old: StationView, now: StationView): number[] {
  if (now.type !== "wires" || old.furniture || now.furniture) return [];
  const was = new Set(old.cut ?? []);
  return (now.cut ?? []).filter((i) => !was.has(i));
}

// Flashing is at most 3 a second (DESIGN.md §5): of the fresh effects, a spark is dropped when 3
// have started in the last second. `gate` holds the start times of recent sparks, kept by the caller.
export const SPARKS_PER_SECOND = 3;
export function capSparks(gate: number[], fresh: Fx[], now: number): Fx[] {
  const recent = gate.filter((t) => now - t < 1000);
  gate.splice(0, gate.length, ...recent);
  return fresh.filter((f) => {
    if (f.kind !== "spark") return true;
    if (gate.length >= SPARKS_PER_SECOND) return false;
    gate.push(now);
    return true;
  });
}

export function detectFx(prev: EntityView[], next: EntityView[]): Fx[] {
  if (prev.length === 0) return []; // the first view: everything would look new
  const out: Fx[] = [];
  const was = new Map(prev.map((e) => [key(e), e]));
  const nowById = new Map(next.map((e) => [e.id, e]));
  const wasById = new Map(prev.map((e) => [e.id, e]));
  const on = (e: EntityView, kind: FxKind, tone: FxTone = "ui", extra: Partial<Fx> = {}) =>
    out.push({ kind, pos: e.pos, tone, targetId: e.id, ...extra });

  for (const e of next) {
    // plates, doors and checkpoints keep their place: compare the same one
    const before = was.get(key(e));
    const old = wasById.get(e.id); // seen both times: only that can have just changed
    if (e.kind === "plate" && before && before.state !== e.state) {
      // pressed sinks with a puff each side; let go springs up with none: told apart by motion
      on(e, e.state === "pressed" ? "press" : "release", e.state === "pressed" ? "goal" : "muted");
    } else if (e.kind === "door" && before?.state === "closed" && e.state === "open") {
      // the door's own motion, never a ring (R1). A secret door never gets here as one: it is no
      // entity until it opens, and its slide is a cacheEvent. One per tile: a door of several tiles
      // is one entity per tile, and each tile's leaves part and sink (its off-screen pill is still
      // one per door: openedDoors)
      on(e, "door", "ui", e.secret ? {} : { door: true });
    } else if (e.kind === "braille" && e.flash === "ok") {
      // Can't see read the plate: its studs lift where it lies, the picture of its tap (parity `tap`)
      on(e, "read");
    } else if (e.kind === "checkpoint" && before) {
      if (before.state === "up" && e.state === "reached") on(e, "unfurl", "goal");
      else if ((e.present ?? 0) > (before.present ?? 0)) on(e, "pip");
    } else if (e.kind === "sign" && old) {
      const then = old.progress ?? 0;
      const now = e.progress ?? 0;
      const all = e.shows?.length ?? Number.POSITIVE_INFINITY;
      if (now > then) on(e, now >= all ? "ripple" : "stamp", "goal");
      else if (now < then) on(e, "shake", "danger");
    } else if (e.kind === "station" && e.station && old?.station) {
      const st = e.station;
      // a right cut solves the panel in the same act, so the snip is found before the chain (wire F2)
      const cuts = snipped(old.station, st);
      const snip = () => {
        // a wire cut while the panel's face was in sight: the snip, and one spark at each cut wire
        on(e, "snip");
        const at = st.parts.find((p) => p.key === "wires")?.at ?? [];
        for (const i of cuts) {
          const t = at[i];
          if (t) out.push({ kind: "spark", pos: { x: t.x + 0.5, y: t.y + 0.5 }, tone: "ui" });
        }
      };
      if (st.solved && !old.station.solved) {
        // solved: the big ring at the anchor, and its tick plate drops in. Only one seen unsolved just
        // before: a station back in line of sight was not solved just now.
        const anchor = st.parts.find((p) => p.key === "anchor")?.at[0];
        const at = anchor ? { x: anchor.x + 0.5, y: anchor.y + 0.5 } : e.pos;
        // ring: reserved (FR16)
        out.push({ kind: "ring", tone: "goal", big: true, pos: at });
        on(e, "tick", "goal");
        if (cuts.length > 0) snip();
      } else if (st.jammed && !old.station.jammed) on(e, "jam", "muted");
      else if (cuts.length > 0) snip();
      else if (
        // a station coming into or leaving line of sight is not a part set: a furniture-only view's
        // `shows` is empty, so it would always look changed (G3: the radio dipped on coming back)
        !old.station.furniture &&
        !st.furniture &&
        st.shows.join() !== old.station.shows.join()
      )
        on(e, "part");
    } else if (e.kind === "bell" && old && e.state === "on" && old.state !== "on") {
      on(e, "bell");
    } else if (e.kind === "lever" && old && e.state !== old.state) {
      on(e, "lever");
    } else if (e.kind === "camera" && old?.state === "idle" && e.state === "watching") {
      on(e, "camera", "danger");
    } else if (e.kind === "laser" && old && old.state !== "on" && e.state === "on") {
      on(e, "laser", "danger");
    } else if (
      e.kind === "exit" &&
      before &&
      before.state !== "occupied" &&
      e.state === "occupied"
    ) {
      on(e, "march");
    } else if (e.kind === "crate") {
      if (old && Math.hypot(old.pos.x - e.pos.x, old.pos.y - e.pos.y) >= 0.4)
        out.push({ kind: "crate", pos: old.pos, to: e.pos, tone: "muted", targetId: e.id });
    } else if (e.kind === "gear" && !old && e.item) {
      // gear put down: it was in a hand that is now empty
      const from = prev.find(
        (o) => o.kind === "player" && o.item === e.item && !nowById.get(o.id)?.item,
      );
      if (from) on(e, "drop");
    } else if (e.kind === "player" && old) {
      if (e.state === "hidden" && old.state !== "hidden") on(e, "hide");
      if (e.heldBy !== undefined && old.heldBy === undefined) {
        const leader = next.find((o) => o.kind === "player" && o.seat === e.heldBy);
        on(e, "join", "ui", leader ? { to: leader.pos } : {});
      } else if (e.heldBy === undefined && old.heldBy !== undefined) {
        const leader = next.find((o) => o.kind === "player" && o.seat === old.heldBy);
        on(e, "unjoin", "ui", leader ? { to: leader.pos } : {});
      }
      if (e.item && !old.item) {
        // gear in a hand that was empty: from whoever just let go of the same item, or picked up
        const from = prev.find(
          (o) => o.kind === "player" && o.item === e.item && !nowById.get(o.id)?.item,
        );
        if (from) out.push({ kind: "arc", pos: from.pos, to: e.pos, tone: "ui", item: e.item });
        else on(e, "take");
      }
      if (e.dyed && !old.dyed) on(e, "dye", "muted");
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
  // loot that is no longer there was picked up: it hops and arcs to the nearest figure
  for (const e of prev) {
    if (e.kind !== "loot" || nowById.has(e.id)) continue;
    const taker = next
      .filter((o) => o.kind === "player")
      .sort(
        (a, b) =>
          Math.hypot(a.pos.x - e.pos.x, a.pos.y - e.pos.y) -
          Math.hypot(b.pos.x - e.pos.x, b.pos.y - e.pos.y),
      )[0];
    out.push({ kind: "loot", pos: e.pos, tone: "goal", ...(taker ? { to: taker.pos } : {}) });
  }
  return out.slice(0, FX_MAX);
}
