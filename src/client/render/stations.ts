import type { Motif } from "../../game/rooms/format.ts";
import type { StationPartKey } from "../../game/sim/stations.ts";
import type { Vec } from "../../game/types.ts";
import type { EntityView } from "../../net/protocol.ts";
import { COLOR, WORLD, type WorldTokens } from "../tokens.ts";
import { block } from "./blocks.ts";
import type { Scene } from "./index.ts";
import { type Camera, LIVE, toScreen } from "./project.ts";

// Stations (spec §4.1): gallery furniture in the 3/4 world, and the object is the readout. Nothing
// about a station shows anywhere else. Brass and steel, a plum outline on the parts you work, a
// drawn tick plate and a goal ring once solved. A code colour is never alone: every swatch is
// outlined in --w-line and carries its colour's fixed pattern.

type Station = NonNullable<EntityView["station"]>;
const CODE: (keyof WorldTokens)[] = [
  "codeRed",
  "codeBlue",
  "codeYellow",
  "codeGreen",
  "codeWhite",
  "codeBlack",
];
const WORK_PX = 2; // the outline on a part you work

const partsOf = (st: Station, key: StationPartKey): Vec[] =>
  st.parts.find((p) => p.key === key)?.at ?? [];
const centre = (t: Vec): Vec => ({ x: t.x + 0.5, y: t.y + 0.5 });
const standingOn = (scene: Scene, t: Vec) =>
  !!scene.self && Math.floor(scene.self.x) === t.x && Math.floor(scene.self.y) === t.y;

// A code colour's swatch: the fill, its pattern in the line colour, and its outline. One colour =
// one name = one pattern, everywhere (wires, bells, lamps, plaque swatches).
export function codeSwatch(
  ctx: CanvasRenderingContext2D,
  code: number,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const k = CODE[((code % 6) + 6) % 6] as keyof WorldTokens;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.fillStyle = WORLD[k];
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = WORLD.line;
  ctx.fillStyle = WORLD.line;
  ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.12);
  const n = code % 6;
  if (n === 1) {
    // blue: one stripe down the middle
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w / 2, y + h);
    ctx.stroke();
  } else if (n === 2) {
    // yellow: bands across
    ctx.beginPath();
    for (let by = y + h / 4; by < y + h; by += h / 4) {
      ctx.moveTo(x, by);
      ctx.lineTo(x + w, by);
    }
    ctx.stroke();
  } else if (n === 3) {
    // green: dots
    const r = Math.max(1, Math.min(w, h) * 0.12);
    for (let dy = h / 6; dy < h; dy += h / 3) {
      ctx.beginPath();
      ctx.arc(x + w / 2, y + dy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (n === 4) {
    // white: hatch
    ctx.beginPath();
    for (let d = -h; d < w; d += Math.max(3, w / 2)) {
      ctx.moveTo(x + d, y + h);
      ctx.lineTo(x + d + h, y);
    }
    ctx.stroke();
  } else if (n === 5) {
    // black: chevrons, pale so they read on black
    ctx.strokeStyle = WORLD.codeWhite;
    ctx.beginPath();
    for (let cy = y + h / 4; cy < y + h; cy += h / 3) {
      ctx.moveTo(x + w * 0.15, cy);
      ctx.lineTo(x + w / 2, cy + h * 0.12);
      ctx.lineTo(x + w * 0.85, cy);
    }
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = WORLD.line;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}

// A floor pad you stand on to turn something: a steel disc with an arrow, sunk 3 px under you.
export function turnPad(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  t: Vec,
  way: -1 | 1,
  here: boolean,
) {
  const s = cam.scale;
  const c = toScreen(cam, t.x + 0.5, t.y + 0.5);
  const sunk = here ? 3 : 0;
  ctx.fillStyle = WORLD.steel;
  ctx.strokeStyle = here ? COLOR.ui : WORLD.line;
  ctx.lineWidth = here ? WORK_PX + 1 : WORK_PX;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y + sunk, s * 0.36, s * 0.36 * LIVE.depth, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // the arrow: which way this pad turns
  ctx.fillStyle = WORLD.line;
  ctx.beginPath();
  ctx.moveTo(c.x + way * s * 0.2, c.y + sunk);
  ctx.lineTo(c.x - way * s * 0.1, c.y + sunk - s * 0.14);
  ctx.lineTo(c.x - way * s * 0.1, c.y + sunk + s * 0.14);
  ctx.closePath();
  ctx.fill();
}

// A vault symbol: six drawn glyphs (circle, square, triangle, cross, star, crescent), never letters.
export function symbolGlyph(
  ctx: CanvasRenderingContext2D,
  n: number,
  cx: number,
  cy: number,
  r: number,
) {
  ctx.beginPath();
  const k = ((n % 6) + 6) % 6;
  if (k === 0) ctx.arc(cx, cy, r, 0, Math.PI * 2);
  else if (k === 1) ctx.rect(cx - r, cy - r, r * 2, r * 2);
  else if (k === 2) {
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy + r * 0.8);
    ctx.lineTo(cx - r, cy + r * 0.8);
    ctx.closePath();
  } else if (k === 3) {
    ctx.moveTo(cx - r, cy - r);
    ctx.lineTo(cx + r, cy + r);
    ctx.moveTo(cx + r, cy - r);
    ctx.lineTo(cx - r, cy + r);
  } else if (k === 4) {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 === 0 ? r : r * 0.45;
      if (i === 0) ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      else ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
  } else {
    ctx.arc(cx, cy, r, Math.PI * 0.3, Math.PI * 1.7);
    ctx.arc(cx + r * 0.45, cy, r * 0.75, Math.PI * 1.6, Math.PI * 0.4, true);
    ctx.closePath();
  }
}

// A link's motif (clues FR3): six drawn shapes, a family apart from the vault's symbols, drawn the
// same at both ends of a link. The path only: the caller fills and strokes it.
export function motifGlyph(
  ctx: CanvasRenderingContext2D,
  motif: Motif,
  cx: number,
  cy: number,
  r: number,
) {
  ctx.beginPath();
  if (motif === "moon") {
    ctx.arc(cx, cy, r, Math.PI * 0.25, Math.PI * 1.75);
    ctx.arc(cx + r * 0.5, cy, r * 0.7, Math.PI * 1.6, Math.PI * 0.4, true);
    ctx.closePath();
  } else if (motif === "star") {
    for (let i = 0; i < 12; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 6;
      const rr = i % 2 === 0 ? r : r * 0.55;
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
  } else if (motif === "wave") {
    ctx.moveTo(cx - r, cy + r * 0.6);
    ctx.bezierCurveTo(cx - r * 0.5, cy - r, cx, cy + r, cx + r * 0.2, cy - r * 0.2);
    ctx.bezierCurveTo(cx + r * 0.5, cy - r, cx + r, cy, cx + r, cy + r * 0.6);
    ctx.closePath();
  } else if (motif === "key") {
    ctx.arc(cx - r * 0.45, cy, r * 0.5, 0, Math.PI * 2);
    ctx.rect(cx - r * 0.05, cy - r * 0.15, r * 1.05, r * 0.3);
    ctx.rect(cx + r * 0.6, cy + r * 0.1, r * 0.25, r * 0.4);
  } else if (motif === "eye") {
    ctx.moveTo(cx - r, cy);
    ctx.quadraticCurveTo(cx, cy - r * 1.2, cx + r, cy);
    ctx.quadraticCurveTo(cx, cy + r * 1.2, cx - r, cy);
    ctx.closePath();
    ctx.moveTo(cx + r * 0.3, cy);
    ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
  } else {
    ctx.moveTo(cx, cy - r);
    ctx.quadraticCurveTo(cx + r, cy - r * 0.2, cx, cy + r);
    ctx.quadraticCurveTo(cx - r, cy - r * 0.2, cx, cy - r);
    ctx.closePath();
  }
}

// A motif on a small card disc at (cx, cy): cream, outlined, the shape in the line colour.
export function motifBadge(
  ctx: CanvasRenderingContext2D,
  motif: Motif,
  cx: number,
  cy: number,
  s: number,
) {
  const r = Math.max(9, s * 0.2);
  ctx.fillStyle = WORLD.card;
  ctx.strokeStyle = WORLD.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = WORLD.line;
  motifGlyph(ctx, motif, cx, cy, r * 0.6);
  ctx.fill();
}

// Words broken into lines no wider than `max` px, at the context's current font.
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > max) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// Where a plaque's plate sits on the canvas, and its wrapped lines: the one place both the drawing
// and the label chips (which keep off it) read the box from.
export function plaqueBox(ctx: CanvasRenderingContext2D, e: EntityView, cam: Camera) {
  if (!e.text) return null;
  const s = cam.scale;
  const px = Math.max(PLATE_MIN_PX, Math.round(s * 0.22));
  ctx.save();
  ctx.font = `700 ${px}px Archivo, system-ui, sans-serif`;
  const lines = wrap(ctx, e.text, Math.max(s * 4, px * 10));
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + px * 1.2;
  const h = lines.length * px * 1.3 + px * 0.8;
  ctx.restore();
  const c = toScreen(cam, e.pos.x, e.pos.y - 0.2, LIVE.block * 1.2);
  return { x: c.x - w / 2, y: c.y - h, w, h, px, lines, cx: c.x, cy: c.y };
}

// A plaque's text (clues FR2): a brass plate on the wall over its tile, the words wrapped to at
// most four tiles wide and never below PLATE_MIN_PX, outlined so it reads on any floor.
export function drawPlaque(ctx: CanvasRenderingContext2D, e: EntityView, cam: Camera) {
  const b = plaqueBox(ctx, e, cam);
  if (!b) return;
  const { px, lines, w, h, cx, cy } = b;
  ctx.save();
  ctx.font = `700 ${px}px Archivo, system-ui, sans-serif`;
  ctx.fillStyle = WORLD.brass;
  ctx.strokeStyle = WORLD.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h, w, h, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = WORLD.line;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((l, i) => {
    ctx.fillText(l, cx, cy - h + px * 0.4 + px * 1.3 * (i + 0.5));
  });
  ctx.restore();
}

// A lamp on a card or a lamp board: lit, filled with eight rays; hollow, an outline alone.
function lampAt(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, lit: boolean) {
  ctx.strokeStyle = WORLD.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  if (lit) {
    ctx.fillStyle = WORLD.lamp;
    ctx.fill();
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      ctx.moveTo(cx + Math.cos(a) * r * 1.33, cy + Math.sin(a) * r * 1.33);
      ctx.lineTo(cx + Math.cos(a) * r * 1.9, cy + Math.sin(a) * r * 1.9);
    }
  }
  ctx.stroke();
}

// The switches' target card (clues FR2): a card on a stand, its lamps in the station's grid, lit
// with rays or hollow, so the pattern is never told by colour alone.
export function drawTargetCard(ctx: CanvasRenderingContext2D, e: EntityView, cam: Camera) {
  const lamps = e.card ?? [];
  if (lamps.length === 0) return;
  const s = cam.scale;
  const cols = lamps.length % 3 === 0 ? 3 : lamps.length % 2 === 0 ? 2 : lamps.length;
  const rows = Math.ceil(lamps.length / cols);
  const cell = Math.max(14, s * 0.26);
  const w = cols * cell + cell * 0.5;
  const h = rows * cell + cell * 0.5;
  const c = toScreen(cam, e.pos.x, e.pos.y, LIVE.block);
  ctx.fillStyle = WORLD.card;
  ctx.strokeStyle = WORLD.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(c.x - w / 2, c.y - h, w, h, 3);
  ctx.fill();
  ctx.stroke();
  lamps.forEach((v, i) => {
    const x = c.x - w / 2 + cell * 0.25 + (i % cols) * cell + cell / 2;
    const y = c.y - h + cell * 0.25 + Math.floor(i / cols) * cell + cell / 2;
    lampAt(ctx, x, y, cell * 0.22, v === 1);
  });
}

// The vault's order clue (clues FR2): its wings' motifs in socket order, on a card plate.
export function drawOrder(ctx: CanvasRenderingContext2D, e: EntityView, cam: Camera) {
  const motifs = e.motifs ?? [];
  if (motifs.length === 0) return;
  const s = cam.scale;
  const step = Math.max(22, s * 0.46);
  const c = toScreen(cam, e.pos.x, e.pos.y, LIVE.block);
  const w = motifs.length * step + step * 0.3;
  ctx.fillStyle = WORLD.brass;
  ctx.strokeStyle = WORLD.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(c.x - w / 2, c.y - step, w, step, 3);
  ctx.fill();
  ctx.stroke();
  for (const [i, m] of motifs.entries())
    motifBadge(ctx, m, c.x - w / 2 + step * 0.15 + step * (i + 0.5), c.y - step / 2, s * 0.9);
}

// Each station says what it is, in words, on a brass plate on the object: the drawing alone did
// not (first review, 2026-10-28). The switches' lamps stand in another room, so they name themselves.
const NAME: Record<Station["type"], string> = {
  dial: "Safe",
  radio: "Radio",
  wires: "Wires",
  keypad: "Keypad",
  switches: "Switches",
  bells: "Music box",
  vault: "Vault",
  sync: "Keys",
};
const PLATE_MIN_PX = 11; // the plate's text never drops below this, however small the tiles

// A name plate centred at (cx, cy): brass, outlined, the name in the HUD's condensed weight.
export function namePlate(
  ctx: CanvasRenderingContext2D,
  name: string,
  cx: number,
  cy: number,
  s: number,
) {
  const px = Math.max(PLATE_MIN_PX, Math.round(s * 0.26));
  ctx.font = `700 ${px}px Archivo, system-ui, sans-serif`;
  const w = ctx.measureText(name).width + px * 0.9;
  const h = px * 1.45;
  ctx.fillStyle = WORLD.brass;
  ctx.strokeStyle = WORLD.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = WORLD.line;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name, cx, cy + 1);
}

// Where a station's plate stands: over its main piece, at head height so a figure does not hide it.
export function plateAt(st: Station, anchor: Vec): { at: Vec; name: string }[] {
  const mid = (ts: Vec[]): Vec => ({
    x: ts.reduce((a, t) => a + t.x, 0) / ts.length + 0.5,
    y: Math.min(...ts.map((t) => t.y)) + 0.5,
  });
  const pick = (key: StationPartKey) => partsOf(st, key);
  if (st.type === "wires" && pick("wires").length > 0)
    return [{ at: mid(pick("wires")), name: NAME.wires }];
  if (st.type === "keypad" && pick("keys").length > 0)
    return [{ at: mid(pick("keys")), name: NAME.keypad }];
  if (st.type === "sync" && pick("keys").length > 0)
    return pick("keys").map((t) => ({ at: mid([t]), name: NAME.sync }));
  if (st.type === "bells" && pick("bells").length > 0)
    return [{ at: mid(pick("bells")), name: NAME.bells }];
  if (st.type === "switches") {
    const out: { at: Vec; name: string }[] = [];
    if (pick("buttons").length > 0) out.push({ at: mid(pick("buttons")), name: NAME.switches });
    if (pick("lamps").length > 0) out.push({ at: mid(pick("lamps")), name: "Lamps" });
    return out;
  }
  if (st.type === "vault" && pick("sockets").length > 0)
    return [{ at: mid([anchor, ...pick("sockets")]), name: NAME.vault }];
  return [{ at: { x: anchor.x + 0.5, y: anchor.y + 0.5 }, name: NAME[st.type] }];
}

// The plates, drawn over the standing parts (after the rows) so nothing covers a name.
export function drawStationPlates(
  ctx: CanvasRenderingContext2D,
  e: EntityView,
  cam: Camera,
  chipped: ReadonlySet<string> = new Set(), // names a label chip already says, here and now
) {
  const st = e.station;
  if (!st) return;
  const anchor = partsOf(st, "anchor")[0] ?? { x: Math.floor(e.pos.x), y: Math.floor(e.pos.y) };
  // on the wall over a wall piece (wires, vault); low over its own tile for a floor piece (keys,
  // buttons), so it never climbs into the row behind; just over a standing piece's top otherwise
  const FLOOR = new Set(["Keypad", "Switches", "Keys"]);
  for (const { at, name } of plateAt(st, anchor)) {
    if (chipped.has(name)) continue; // the chip over it says the name already
    const wall = st.type === "wires" || st.type === "vault";
    const lift = wall ? LIVE.wall * 1.05 : FLOOR.has(name) ? LIVE.block * 0.35 : LIVE.block * 1.15;
    const c = toScreen(cam, at.x, at.y - (FLOOR.has(name) ? 0.15 : 0.3), lift);
    namePlate(ctx, name, c.x, c.y, cam.scale);
  }
}

// A small plinth: brass top, steel front, outlined.
function plinth(ctx: CanvasRenderingContext2D, cam: Camera, t: Vec, h = 0.45, inset = 0.12) {
  block(
    ctx,
    cam,
    {
      x: t.x + inset,
      y: t.y + inset,
      w: 1 - inset * 2,
      d: 1 - inset * 2,
      h: h * (LIVE.block / 0.7),
    },
    WORLD.steel,
    WORLD.steelFront,
  );
  const top = toScreen(cam, t.x + inset, t.y + inset, h * (LIVE.block / 0.7));
  ctx.strokeStyle = WORLD.line;
  ctx.lineWidth = 2;
  ctx.strokeRect(
    top.x,
    top.y,
    cam.scale * (1 - inset * 2),
    cam.scale * ((1 - inset * 2) * LIVE.depth + h * (LIVE.block / 0.7)),
  );
}

// A floor key or button: a square steel tile, numbered, sunk 3 px under you.
function floorKey(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  t: Vec,
  label: string,
  here: boolean,
  lit: boolean,
  bars?: number,
) {
  const s = cam.scale;
  const p = toScreen(cam, t.x + 0.12, t.y + 0.12);
  const sunk = here ? 3 : 0;
  const w = s * 0.76;
  const d = s * 0.76 * LIVE.depth;
  ctx.fillStyle = lit ? WORLD.lamp : WORLD.steel;
  ctx.fillRect(p.x, p.y + sunk, w, d);
  ctx.strokeStyle = here ? COLOR.ui : WORLD.line;
  ctx.lineWidth = here ? WORK_PX + 1 : WORK_PX;
  ctx.strokeRect(p.x, p.y + sunk, w, d);
  ctx.fillStyle = WORLD.line;
  ctx.font = `700 ${Math.max(PLATE_MIN_PX, Math.round(s * 0.36))}px Archivo, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, p.x + w * (bars ? 0.38 : 0.5), p.y + sunk + d / 2);
  if (bars) {
    // pitch bars: a key's note drawn as 1 to 3 rising bars, so the pitch is not told by colour
    for (let i = 0; i < bars; i++) {
      const bh = d * (0.18 + i * 0.12);
      ctx.fillRect(
        p.x + w * (0.68 + i * 0.09),
        p.y + sunk + d * 0.8 - bh,
        Math.max(1.5, w * 0.06),
        bh,
      );
    }
  }
}

// The solved plate: a drawn tick on brass, raised over the station, and a goal ring on the floor.
function solvedPlate(ctx: CanvasRenderingContext2D, cam: Camera, at: Vec) {
  const s = cam.scale;
  const c = toScreen(cam, at.x, at.y, 0.9);
  ctx.fillStyle = WORLD.brass;
  ctx.strokeStyle = WORLD.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(c.x - s * 0.22, c.y - s * 0.16, s * 0.44, s * 0.32, s * 0.06);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = Math.max(2, s * 0.06);
  ctx.beginPath();
  ctx.moveTo(c.x - s * 0.1, c.y);
  ctx.lineTo(c.x - s * 0.02, c.y + s * 0.08);
  ctx.lineTo(c.x + s * 0.12, c.y - s * 0.08);
  ctx.stroke();
  const f = toScreen(cam, at.x, at.y);
  ctx.strokeStyle = COLOR.goal;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(f.x, f.y, s * 0.55, s * 0.55 * LIVE.depth, 0, 0, Math.PI * 2);
  ctx.stroke();
}

// The flat parts of a station: pads, floor keys and buttons. Drawn with the floor, under what stands.
export function drawStationFloor(
  ctx: CanvasRenderingContext2D,
  e: EntityView,
  cam: Camera,
  scene: Scene,
) {
  const st = e.station;
  if (!st) return;
  for (const [i, t] of partsOf(st, "pads").entries())
    turnPad(ctx, cam, t, i === 0 ? -1 : 1, standingOn(scene, t));
  if (st.type === "keypad") {
    const pressed = new Set(st.shows);
    for (const [i, t] of partsOf(st, "keys").entries())
      floorKey(ctx, cam, t, String(i + 1), standingOn(scene, t), pressed.has(i), (i % 3) + 1);
  } else if (st.type === "switches") {
    for (const [i, t] of partsOf(st, "buttons").entries())
      floorKey(ctx, cam, t, String(i + 1), standingOn(scene, t), false);
  } else if (st.type === "sync") {
    for (const [i, t] of partsOf(st, "keys").entries())
      floorKey(ctx, cam, t, String(i + 1), standingOn(scene, t), st.shows[i] === 1);
  } else if (st.type === "vault") {
    // one socket per wing: a steel ring with its current symbol, in reach
    partsOf(st, "sockets").forEach((t, i) => {
      const c = toScreen(cam, t.x + 0.5, t.y + 0.5);
      const s = cam.scale;
      ctx.fillStyle = WORLD.steel;
      ctx.strokeStyle = standingOn(scene, t) ? COLOR.ui : WORLD.line;
      ctx.lineWidth = WORK_PX;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, s * 0.34, s * 0.34 * LIVE.depth, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (st.shows[i] !== undefined) {
        ctx.fillStyle = WORLD.brass;
        ctx.strokeStyle = WORLD.line;
        symbolGlyph(ctx, st.shows[i] as number, c.x, c.y, s * 0.14);
        ctx.fill();
        ctx.stroke();
      }
    });
  }
}

// What stands: the safe, the wire panel, the radio, the bells, the lamps, the vault door. Drawn in
// the row of the part, so figures stand in front of and behind it correctly.
export function drawStationStanding(
  ctx: CanvasRenderingContext2D,
  e: EntityView,
  cam: Camera,
  scene: Scene,
  row: number,
) {
  const st = e.station;
  if (!st) return;
  const s = cam.scale;
  const anchor = partsOf(st, "anchor")[0] ?? { x: Math.floor(e.pos.x), y: Math.floor(e.pos.y) };
  const inRow = (t: Vec) => t.y === row;
  if (st.type === "dial" && inRow(anchor)) {
    // the safe: a squat steel box, its dial face on the front with the number at the top
    block(
      ctx,
      cam,
      { x: anchor.x + 0.1, y: anchor.y + 0.15, w: 0.8, d: 0.7, h: LIVE.block },
      WORLD.steel,
      WORLD.steelFront,
    );
    const face = toScreen(cam, anchor.x + 0.5, anchor.y + 0.85, LIVE.block / 2);
    ctx.fillStyle = WORLD.card;
    ctx.strokeStyle = WORLD.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(face.x, face.y, s * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (!st.furniture) {
      ctx.fillStyle = WORLD.line;
      ctx.font = `700 ${Math.max(PLATE_MIN_PX, Math.round(s * 0.32))}px Archivo, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(st.shows[st.teach ? 0 : st.shows.length - 1] ?? 0), face.x, face.y);
      if (st.teach) {
        // the teaching safe's lamp (clues FR7): lit with rays on the right number, else hollow
        lampAt(ctx, face.x + s * 0.4, face.y - s * 0.3, s * 0.08, st.shows[1] === 1);
      } else {
        // the digits already entered, as pips above the face
        st.shows.slice(0, -1).forEach((_, i) => {
          ctx.beginPath();
          ctx.arc(face.x - s * 0.15 + i * s * 0.15, face.y - s * 0.34, s * 0.05, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }
    for (const b of partsOf(st, "back")) if (inRow(b)) plinth(ctx, cam, b, 0.25, 0.3);
  }
  if (st.type === "wires") {
    // the panel on the wall: one patterned swatch per wire, a brass rail across the top
    partsOf(st, "wires").forEach((t, i) => {
      if (!inRow(t)) return;
      const top = toScreen(cam, t.x + 0.2, t.y + 0.1, LIVE.wall * 0.85);
      const h = LIVE.wall * 0.6 * s;
      ctx.fillStyle = WORLD.brass;
      ctx.fillRect(top.x - s * 0.2, top.y - 3, s, 3);
      if (st.furniture || st.shows[i] === undefined) {
        ctx.fillStyle = WORLD.steel;
        ctx.fillRect(top.x, top.y, s * 0.6, h);
        ctx.strokeStyle = WORLD.line;
        ctx.lineWidth = 2;
        ctx.strokeRect(top.x, top.y, s * 0.6, h);
      } else codeSwatch(ctx, st.shows[i] as number, top.x + s * 0.15, top.y, s * 0.3, h);
      if (standingOn(scene, t)) {
        ctx.strokeStyle = COLOR.ui;
        ctx.lineWidth = WORK_PX + 1;
        ctx.strokeRect(top.x - 2, top.y - 2, s * 0.6 + 4, h + 4);
      }
    });
  }
  if (st.type === "radio" && inRow(anchor)) {
    plinth(ctx, cam, anchor);
    const face = toScreen(cam, anchor.x + 0.5, anchor.y + 0.85, LIVE.block * 0.35);
    ctx.fillStyle = WORLD.card;
    ctx.strokeStyle = WORLD.line;
    ctx.lineWidth = 2;
    ctx.fillRect(face.x - s * 0.36, face.y - s * 0.13, s * 0.72, s * 0.26);
    ctx.strokeRect(face.x - s * 0.36, face.y - s * 0.13, s * 0.72, s * 0.26);
    if (!st.furniture) {
      // the needle on its band, and a pip when the digit plays
      const range = 10;
      const nx = face.x - s * 0.26 + ((st.shows[0] ?? 0) / (range - 1)) * s * 0.52;
      ctx.beginPath();
      ctx.moveTo(nx, face.y - s * 0.1);
      ctx.lineTo(nx, face.y + s * 0.1);
      ctx.stroke();
      if (st.shows.length > 1) {
        ctx.fillStyle = WORLD.lamp;
        ctx.beginPath();
        ctx.arc(face.x + s * 0.38, face.y - s * 0.2, s * 0.07, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }
  if (st.type === "bells") {
    const [playing, ...struck] = st.shows;
    const last = struck.at(-1);
    partsOf(st, "bells").forEach((t, i) => {
      if (!inRow(t)) return;
      const c = toScreen(cam, t.x + 0.5, t.y + 0.5, LIVE.block * 0.8);
      const tilt = !st.furniture && last === i && !scene.reducedMotion ? 0.2 : 0;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(tilt);
      // a bell in its code colour, with a pattern band, and its number under it
      ctx.beginPath();
      ctx.moveTo(-s * 0.22, s * 0.18);
      ctx.quadraticCurveTo(-s * 0.2, -s * 0.25, 0, -s * 0.25);
      ctx.quadraticCurveTo(s * 0.2, -s * 0.25, s * 0.22, s * 0.18);
      ctx.closePath();
      ctx.fillStyle = WORLD.brass;
      ctx.fill();
      ctx.strokeStyle = WORLD.line;
      ctx.lineWidth = 2;
      ctx.stroke();
      codeSwatch(ctx, i, -s * 0.18, -s * 0.02, s * 0.36, s * 0.1);
      ctx.restore();
      const f = toScreen(cam, t.x + 0.5, t.y + 0.9);
      ctx.fillStyle = WORLD.line;
      ctx.font = `700 ${Math.max(PLATE_MIN_PX, Math.round(s * 0.3))}px Archivo, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), f.x, f.y);
    });
    for (const t of partsOf(st, "tune")) {
      if (!inRow(t)) continue;
      // the music box that plays the tune: a small card box, its lid up while it plays
      plinth(ctx, cam, t, 0.35, 0.18);
      if (!st.furniture && playing === 1) {
        const lid = toScreen(cam, t.x + 0.5, t.y + 0.2, LIVE.block * 0.9);
        ctx.fillStyle = WORLD.card;
        ctx.strokeStyle = WORLD.line;
        ctx.lineWidth = 2;
        ctx.fillRect(lid.x - s * 0.3, lid.y - s * 0.25, s * 0.6, s * 0.25);
        ctx.strokeRect(lid.x - s * 0.3, lid.y - s * 0.25, s * 0.6, s * 0.25);
      }
    }
  }
  if (st.type === "switches") {
    // the lamps behind glass: lit with rays, or hollow; numbered, never colour alone
    partsOf(st, "lamps").forEach((t, i) => {
      if (!inRow(t)) return;
      const c = toScreen(cam, t.x + 0.5, t.y + 0.5, LIVE.block * 0.6);
      lampAt(ctx, c.x, c.y, s * 0.18, !st.furniture && st.shows[i] === 1);
      ctx.fillStyle = WORLD.line;
      ctx.font = `700 ${Math.max(PLATE_MIN_PX, Math.round(s * 0.26))}px Archivo, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), c.x, c.y + s * 0.42);
    });
  }
  if (st.type === "vault" && inRow(anchor)) {
    // the round vault door on the wall, a brass wheel on it
    const c = toScreen(cam, anchor.x + 0.5, anchor.y + 0.9, LIVE.wall * 0.5);
    ctx.fillStyle = WORLD.steel;
    ctx.strokeStyle = WORLD.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c.x, c.y, s * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = WORLD.brass;
    ctx.lineWidth = Math.max(2, s * 0.06);
    ctx.beginPath();
    ctx.arc(c.x, c.y, s * 0.2, 0, Math.PI * 2);
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI) / 3;
      ctx.moveTo(c.x + Math.cos(a) * s * 0.3, c.y + Math.sin(a) * s * 0.3);
      ctx.lineTo(c.x - Math.cos(a) * s * 0.3, c.y - Math.sin(a) * s * 0.3);
    }
    ctx.stroke();
  }
  if (st.type === "keypad" && inRow(anchor)) {
    // the keypad's lit panel: which keys have been pressed, as lights over a small brass frame
    plinth(ctx, cam, anchor, 0.2, 0.3);
  }
  if (st.solved && inRow(anchor)) solvedPlate(ctx, cam, centre(anchor));
  if (inRow(anchor) && st.motif) {
    // the link's motif, on a disc at the anchor's front corner (the other end carries the same)
    const m = toScreen(cam, anchor.x + 0.85, anchor.y + 0.9, LIVE.block * 0.5);
    motifBadge(ctx, st.motif, m.x, m.y, s);
  }
  if (inRow(anchor) && st.reveal !== undefined) {
    // a solved wing's symbol plate (clues FR2): the symbol the vault wants from this wing
    const r = toScreen(cam, anchor.x + 0.5, anchor.y + 0.5, LIVE.block * 1.6);
    ctx.fillStyle = WORLD.card;
    ctx.strokeStyle = WORLD.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(r.x - s * 0.25, r.y - s * 0.25, s * 0.5, s * 0.5, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = WORLD.brass;
    symbolGlyph(ctx, st.reveal, r.x, r.y, s * 0.16);
    ctx.fill();
    ctx.stroke();
  }
}

// The rows a station has something standing in: its anchor, and each standing part.
export function stationRows(e: EntityView): number[] {
  const st = e.station;
  if (!st) return [];
  const keys: StationPartKey[] = ["anchor", "back", "wires", "bells", "tune", "lamps"];
  return [...new Set(keys.flatMap((k) => partsOf(st, k).map((t) => t.y)))];
}
