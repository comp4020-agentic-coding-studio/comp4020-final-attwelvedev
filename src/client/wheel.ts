import { CALLOUTS, CLIPS, FACES, type Stamp } from "../game/channels.ts";
import { canReceive, canSend, type Method, type Role, type Seat } from "../game/types.ts";
import type { CrewMember, SendRequest } from "../net/protocol.ts";
import { CALLOUT_FACE, CALLOUT_WORD, STAMP_FACE, STAMP_NAME } from "./hud.ts";
import {
  insideOutline,
  type Mode,
  PAGES_ALL,
  type Page,
  slotIndexAt,
  slotPos,
  tallestHalf,
} from "./wheelLayout.ts";

export type { Mode, Page } from "./wheelLayout.ts";

// The comms wheel's decisions, kept free of the DOM so they can be tested:
// what each slot is, whether a release sends, and who hears what. Where slots
// are drawn and which one a point is over is in wheelLayout.ts; the component
// (CommsWheel.tsx) only draws and listens.

export const PAGES: readonly Page[] = PAGES_ALL;
export const PAGE_LABEL: Record<Page, string> = {
  talk: "Talk",
  faces: "Faces",
  clips: "Clips",
  marks: "Marks",
};
export const PAGE_METHOD: Record<Page, Method> = {
  talk: "callout",
  faces: "face",
  clips: "clip",
  marks: "mark",
};

export const DRAW_MS = 200; // a still hold this long draws the wheel
export const FLICK_PX = 24; // moving this far before then and releasing sends undrawn
const CENTRE_PX = 28; // a flick that moved less than this points at the middle slot, if there is one
export const TAB_W = 100; // px between page labels on a wide frame
export const TAB_W_NARROW = 82; // and on a narrow one, so four labels fit a phone
export const TAB_DWELL_MS = 300; // dwelling on a page label this long switches page

export interface Slot {
  id: string; // `${method}:${what}`, also what Settings.quick stores
  method: Method;
  label: string; // what the slot shows
  name: string; // what it is called aloud
  face?: string; // a face's id, for its picture
}

const calloutSlot = (c: (typeof CALLOUTS)[number]): Slot => ({
  id: `callout:${c}`,
  method: "callout",
  label: CALLOUT_FACE[c],
  name: CALLOUT_WORD[c],
});
const markSlot = (s: Stamp): Slot => ({
  id: `mark:${s}`,
  method: "mark",
  label: STAMP_FACE[s],
  name: STAMP_NAME[s],
});

// Compass layout, reading order: NW N NE / W centre E / SW S SE.
const MARK_GRID: Stamp[] = ["question", "up", "bang", "left", "x", "right", "door", "down", "key"];

const SLOTS: Record<Page, Slot[]> = {
  talk: CALLOUTS.map(calloutSlot),
  faces: FACES.map((f) => ({
    id: `face:${f.id}`,
    method: "face",
    label: f.label,
    name: f.label,
    face: f.id,
  })),
  clips: CLIPS.map((c) => ({
    id: `clip:${c.id}`,
    method: "clip",
    label: c.label,
    name: c.label,
  })),
  marks: MARK_GRID.map(markSlot),
};

export const pageSlots = (page: Page): readonly Slot[] => SLOTS[page];

// The slot the cursor is over, for a point (dx, dy) from the wheel's centre.
export const slotAt = slotIndexAt;

export const shouldDraw = (heldMs: number): boolean => heldMs >= DRAW_MS;

// Which slot the real cursor is over, for a wheel drawn at `centre`: the cursor's
// own position, not how far it has moved. Null outside the outline.
export function aimFrom(
  page: Page,
  mode: Mode,
  cursor: { x: number; y: number },
  centre: { x: number; y: number },
): number | null {
  return slotIndexAt(page, mode, cursor.x - centre.x, cursor.y - centre.y);
}

const tabPitch = (mode: Mode): number => (mode === "narrow" ? TAB_W_NARROW : TAB_W);

// The page labels' row: one height for every page (so they stay put when the page
// changes), just above the tallest outline in this mode.
const LABEL_HALF_H = 17;
const LABEL_GAP = 8;
export function tabXY(page: Page, mode: Mode): { x: number; y: number } {
  return {
    x: (PAGES.indexOf(page) - 1.5) * tabPitch(mode),
    y: -(tallestHalf(mode) + LABEL_GAP + LABEL_HALF_H),
  };
}

// The slot a flick points at. A flick is a direction, not a position, so it picks
// the slot whose centre lies closest to the line along it (the middle one if the
// flick barely moved), whatever the wheel's outline.
export function flickSlot(page: Page, mode: Mode, dx: number, dy: number): number | null {
  const r = Math.hypot(dx, dy);
  const n = pageSlots(page).length;
  const ux = r < CENTRE_PX ? 0 : dx / r;
  const uy = r < CENTRE_PX ? 0 : dy / r;
  let best: number | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < n; i++) {
    const p = slotPos(page, mode, i);
    const d = Math.hypot(p.x, p.y);
    if (r < CENTRE_PX) {
      // barely moved: whatever is at the middle (a ring has none)
      if (d < CENTRE_PX && best === null) best = i;
      continue;
    }
    if (d < CENTRE_PX) continue; // the middle slot is for a flick that stays put
    // how well this slot lies along the flick: its cosine with the direction, tie-broken
    // by being nearer the centre, so a diagonal picks the corner, not the farther edge
    const cos = (p.x * ux + p.y * uy) / d;
    const score = cos - d * 0.0005;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

export type Release = { kind: "send"; index: number } | { kind: "cancel" };

// What letting go does. `drawn`: the wheel had appeared by then. Drawn, (dx, dy)
// is where the cursor is from the wheel's centre; undrawn, it is how far the
// press has moved: a flick, which is a direction.
export function releaseAction(
  page: Page,
  mode: Mode,
  { drawn, dx, dy }: { drawn: boolean; dx: number; dy: number },
): Release {
  if (!drawn && Math.hypot(dx, dy) < FLICK_PX) return { kind: "cancel" }; // a tap that went nowhere
  if (drawn && !insideOutline(page, mode, dx, dy)) return { kind: "cancel" };
  const index = drawn ? slotIndexAt(page, mode, dx, dy) : flickSlot(page, mode, dx, dy);
  return index === null ? { kind: "cancel" } : { kind: "send", index };
}

// Which page label a point is over, if any.
export function tabAt(page: Page, mode: Mode, dx: number, dy: number): Page | null {
  const { y } = tabXY(page, mode);
  if (Math.abs(dy - y) > 20) return null;
  const pitch = tabPitch(mode);
  const i = Math.floor((dx + pitch * 2) / pitch);
  return PAGES[i] ?? null;
}

// The crew other than `me`, split by whether their role receives `method`.
export function receiversOf(
  method: Method,
  crew: CrewMember[],
  me: Seat,
): { hear: CrewMember[]; cant: CrewMember[] } {
  const others = crew.filter((c) => c.seat !== me);
  return {
    hear: others.filter((c) => canReceive(c.role, method)),
    cant: others.filter((c) => !canReceive(c.role, method)),
  };
}

// The crew other than `me` whose role may send `method`.
export const sendersOf = (method: Method, crew: CrewMember[], me: Seat): CrewMember[] =>
  crew.filter((c) => c.seat !== me && canSend(c.role, method));

export const defaultPage = (role: Role): Page => (canSend(role, "callout") ? "talk" : "faces");

const DEFAULT_QUICK: Record<Role, string> = {
  blind: "callout:here",
  deaf: "callout:go",
  mute: "face:f01",
};

export const findSlot = (id: string): Slot | undefined =>
  PAGES.flatMap((p) => SLOTS[p]).find((s) => s.id === id);

// The phone's quick slot: the pinned one if it is a real slot this role may
// send, else the role's default.
export function quickSlot(role: Role, pinned: string | null): Slot {
  const pin = pinned ? findSlot(pinned) : undefined;
  const slot = pin && canSend(role, pin.method) ? pin : findSlot(DEFAULT_QUICK[role]);
  return slot as Slot;
}

// The socket request for a slot. A mark also needs the tile it goes on.
export function requestFor(slot: Slot): Exclude<SendRequest, { method: "mark" | "text" }> | null {
  const what = slot.id.slice(slot.id.indexOf(":") + 1);
  switch (slot.method) {
    case "callout":
      return { method: "callout", callout: what as (typeof CALLOUTS)[number] };
    case "face":
      return { method: "face", id: what };
    case "clip":
      return { method: "clip", clip: what };
    default:
      return null;
  }
}

// What a receiver does with a method: Can't speak and Can't see read or hear,
// Can't hear sees. Faces and marks are pictures; callouts and text are words.
export const VERB: Record<Method, string> = {
  callout: "hears this",
  text: "reads this",
  voice: "hears this",
  clip: "hears this",
  face: "sees this",
  mark: "sees this",
};

// The verb for one receiver. Only text is read; callouts, clips and voice are
// heard (by Can't speak too: they can't talk, but they can hear); faces and marks
// are seen.
export const verbFor = (method: Method): string =>
  method === "text" ? "reads this" : VERB[method];

// Where a slot is drawn, in px from the wheel's centre.
export const slotXY = slotPos;
