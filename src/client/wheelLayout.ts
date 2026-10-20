// The comms wheel's geometry: where each slot is drawn, how big it is, and which
// slot a point is over. Pure, so the drawing and the hit-testing share one source
// and the tests can prove they agree. Distances are in px from the wheel's centre
// (y down) at full size; the component scales the whole wheel by wheelScale().

export type Page = "talk" | "faces" | "clips" | "marks";
export const PAGES_ALL: readonly Page[] = ["talk", "faces", "clips", "marks"];

// "wide": a desktop frame. "narrow": a phone frame (~350 px).
export type Mode = "wide" | "narrow";
// ring8: eight slots round a centre disc (Talk, Marks). ring12: twelve round an empty
// middle (Faces, Clips, wide). grid4: a 4x3 grid (Faces, Clips, narrow, where a ring of
// twelve 48 px targets would be wider than the phone).
export type Layout = "ring8" | "ring12" | "grid4";

export const MIN_TARGET_PX = 48;
export const SLOT_GAP = 8; // least clear space between two slot boxes

// Frames at least this wide get the rings.
export const WIDE_FRAME_PX = 560;
export const modeFor = (frameWidth: number): Mode =>
  frameWidth >= WIDE_FRAME_PX ? "wide" : "narrow";

export const layoutFor = (page: Page, mode: Mode): Layout =>
  page === "talk" || page === "marks" ? "ring8" : mode === "wide" ? "ring12" : "grid4";

// Talk and Marks are nine slots: eight round the ring and one in the middle (Stop, and a
// cross). Their slot index 4 is that middle one, as the data in wheel.ts lists them.
export const CENTRE_INDEX = 4;
export const hasCentre = (page: Page): boolean => page === "talk" || page === "marks";
export const slotCount = (page: Page): number => (hasCentre(page) ? 9 : 12);

interface Sizes {
  w: number;
  h: number;
  centre: number; // the middle disc's diameter, where there is one
}
const SIZE: Record<Mode, Record<Page, Sizes>> = {
  wide: {
    talk: { w: 84, h: 60, centre: 72 },
    marks: { w: 84, h: 60, centre: 72 },
    faces: { w: 60, h: 60, centre: 0 },
    clips: { w: 72, h: 60, centre: 0 }, // as tall as a face: a shorter box raises the 48 px floor past what fits
  },
  narrow: {
    talk: { w: 64, h: 50, centre: 56 },
    marks: { w: 64, h: 50, centre: 56 },
    faces: { w: 72, h: 60, centre: 0 },
    clips: { w: 72, h: 52, centre: 0 },
  },
};
export const slotSize = (page: Page, mode: Mode): Sizes => SIZE[mode][page];

// The radius of a ring of eight with 8 px between boxes: found by the layout tests.
const RING8_R: Record<Mode, number> = { wide: 131, narrow: 102 };
const RING12_R = 186; // twelve 60 px boxes with an 8 px gap need at least this
const GRID4 = { dx: 80, dy: 68 }; // 4 columns by 3 rows

// The radius of a ring12's outline.
export const RIM: Record<Mode, number> = { wide: 240, narrow: 240 };
const EDGE_PAD = 14; // clear space between a grid's outermost boxes and its outline
const RING_PAD = 8; // and a ring8's: a circle round the corners needs less

// A slot's position on ring8, by the order wheel.ts lists them: the nine are in reading
// order (NW N NE / W middle E / SW S SE). This maps each to its place round the ring
// (0 = top, clockwise in 45 degree steps), with -1 for the middle.
const RING8_ORDER = [7, 0, 1, 6, -1, 2, 5, 4, 3];

export function slotPos(page: Page, mode: Mode, index: number): { x: number; y: number } {
  const layout = layoutFor(page, mode);
  if (layout === "ring8") {
    const at = RING8_ORDER[index] ?? -1;
    if (at < 0) return { x: 0, y: 0 };
    const a = (at * 45 * Math.PI) / 180;
    const r = RING8_R[mode];
    return {
      x: Math.round(r * Math.sin(a) * 10) / 10,
      y: Math.round(-r * Math.cos(a) * 10) / 10,
    };
  }
  if (layout === "ring12") {
    const a = (index * 30 * Math.PI) / 180;
    return {
      x: Math.round(RING12_R * Math.sin(a) * 10) / 10,
      y: Math.round(-RING12_R * Math.cos(a) * 10) / 10,
    };
  }
  return {
    x: ((index % 4) - 1.5) * GRID4.dx,
    y: (Math.floor(index / 4) - 1) * GRID4.dy,
  };
}

export function boxOf(page: Page, mode: Mode, index: number) {
  const { x, y } = slotPos(page, mode, index);
  const s = slotSize(page, mode);
  const isCentre = hasCentre(page) && index === CENTRE_INDEX;
  const w = isCentre ? s.centre : s.w;
  const h = isCentre ? s.centre : s.h;
  return { left: x - w / 2, right: x + w / 2, top: y - h / 2, bottom: y + h / 2 };
}

// How far from the middle the nearest ring slot's box comes, in px of radius: the clear
// space left for seeing the map through the middle of a ring8 (the disc sits in it).
export function clearRadius(page: Page, mode: Mode): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (let i = 0; i < slotCount(page); i++) {
    if (hasCentre(page) && i === CENTRE_INDEX) continue;
    const b = boxOf(page, mode, i);
    const cx = Math.max(b.left, Math.min(0, b.right)); // the closest point of the box
    const cy = Math.max(b.top, Math.min(0, b.bottom));
    nearest = Math.min(nearest, Math.hypot(cx, cy));
  }
  return nearest;
}

// The outline drawn around a page: a circle for a ring, a rounded rectangle that hugs
// the boxes for a grid (a circle round a 4x3 grid would be wider than a phone).
export function outlineOf(
  page: Page,
  mode: Mode,
): { kind: "circle"; r: number } | { kind: "rect"; halfW: number; halfH: number } {
  const layout = layoutFor(page, mode);
  if (layout === "ring12") return { kind: "circle", r: RIM[mode] };
  if (layout === "grid4") {
    let halfW = 0;
    let halfH = 0;
    for (let i = 0; i < slotCount(page); i++) {
      const b = boxOf(page, mode, i);
      halfW = Math.max(halfW, Math.abs(b.left), Math.abs(b.right));
      halfH = Math.max(halfH, Math.abs(b.top), Math.abs(b.bottom));
    }
    return { kind: "rect", halfW: halfW + EDGE_PAD, halfH: halfH + EDGE_PAD };
  }
  // ring8: a circle just round the outermost corners
  let far = 0;
  for (let i = 0; i < slotCount(page); i++) {
    const b = boxOf(page, mode, i);
    for (const [x, y] of [
      [b.left, b.top],
      [b.right, b.top],
      [b.left, b.bottom],
      [b.right, b.bottom],
    ] as const) {
      far = Math.max(far, Math.hypot(x, y));
    }
  }
  return { kind: "circle", r: Math.ceil(far) + RING_PAD };
}

export function insideOutline(page: Page, mode: Mode, dx: number, dy: number): boolean {
  const o = outlineOf(page, mode);
  return o.kind === "circle"
    ? Math.hypot(dx, dy) <= o.r
    : Math.abs(dx) <= o.halfW && Math.abs(dy) <= o.halfH;
}

// The slot a point is over: the one whose drawn box contains it, so what is drawn is
// what is selected. Between boxes, the nearest slot within the outline: a cursor in a
// gap still aims somewhere sensible. A ring12's empty middle selects nothing.
export function slotIndexAt(page: Page, mode: Mode, dx: number, dy: number): number | null {
  const n = slotCount(page);
  for (let i = 0; i < n; i++) {
    const b = boxOf(page, mode, i);
    if (dx >= b.left && dx <= b.right && dy >= b.top && dy <= b.bottom) return i;
  }
  if (!insideOutline(page, mode, dx, dy)) return null;
  if (layoutFor(page, mode) === "ring12" && Math.hypot(dx, dy) < clearRadius(page, mode) / 2) {
    return null;
  }
  let best = 0;
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = 0; i < n; i++) {
    const p = slotPos(page, mode, i);
    const d = Math.hypot(dx - p.x, dy - p.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

const LABELS_PX = 62; // the page labels above the wheel
// The plate below it: an 8 px gap, the CSS max-height (80, border-box so it includes its
// 2 px border), and a 6 px margin so a plate at full height never touches the frame edge.
const PLATE_PX = 8 + 80 + 6;

// The tallest outline (half height) over all pages in a mode: the labels sit above it and
// the plate below it, the same for every page, so neither jumps when the page changes.
export function tallestHalf(mode: Mode): number {
  let tallest = 0;
  for (const p of PAGES_ALL) {
    const o = outlineOf(p, mode);
    tallest = Math.max(tallest, o.kind === "circle" ? o.r : o.halfH);
  }
  return tallest;
}

// The full drawn extent of a page: its outline, plus the labels above and the plate
// below, which sit outside the tallest outline of any page.
export function wheelExtent(page: Page, mode: Mode): { width: number; height: number } {
  const o = outlineOf(page, mode);
  const halfW = o.kind === "circle" ? o.r : o.halfW;
  return { width: 2 * halfW, height: 2 * tallestHalf(mode) + LABELS_PX + PLATE_PX };
}

// How much of full size to draw at, so the wheel and its labels fit the frame, but never
// so small that a slot drops under 48 px (then it is the frame that gives, not the target).
// One scale for every page (the biggest page sets it), so the wheel never grows or shrinks
// as the page changes and the labels and plate stay where they are.
export function wheelScale(_page: Page, mode: Mode, frameW: number, frameH: number): number {
  let fit = 1;
  let floor = 0;
  for (const page of PAGES_ALL) {
    const e = wheelExtent(page, mode);
    // the outline already carries its own padding, so the frame needs only a hair of margin
    fit = Math.min(fit, (frameW - 2) / e.width, (frameH - 2) / e.height);
    const s = slotSize(page, mode);
    const smallest = Math.min(s.w, s.h, s.centre > 0 ? s.centre : Number.POSITIVE_INFINITY);
    floor = Math.max(floor, MIN_TARGET_PX / smallest);
  }
  return Math.max(floor, Math.min(1, fit));
}
