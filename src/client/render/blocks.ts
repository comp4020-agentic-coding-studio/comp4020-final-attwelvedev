import { STAMP_LIFE_MS, type Stamp } from "../../game/channels.ts";
import type { Vec } from "../../game/types.ts";
import type { EntityView } from "../../net/protocol.ts";
import { motionT } from "../fx.ts";
import { STAMP_FACE } from "../hud.ts";
import { COLOR, MAP, WORLD } from "../tokens.ts";
import { drawTile } from "./atlas.ts";
import type { Scene } from "./index.ts";
import {
  type FloorKind,
  floorVariant,
  paintAo,
  paintCrate,
  paintCrateShadow,
  paintDoor,
  paintFloor,
  paintGlass,
  paintVent,
  paintWallFront,
  paintWallTop,
} from "./materials.ts";
import { ease, pivot, pop, puff, ripple, shake, sink, unfurl } from "./motion.ts";
import { type Camera, LIVE, toScreen, wallAt } from "./project.ts";
import { diamond, hatch } from "./shared.ts";

// An extruded box: a top face and a south-facing front, light from the north-west. x, y, w, d
// are in tiles on the floor, h is its height in tiles.
export function block(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  box: { x: number; y: number; w: number; d: number; h: number },
  top: string,
  front: string,
) {
  const s = cam.scale;
  const t = toScreen(cam, box.x, box.y, box.h);
  const f = toScreen(cam, box.x, box.y + box.d, box.h);
  ctx.fillStyle = top;
  ctx.fillRect(t.x, t.y, box.w * s + 0.5, box.d * s * LIVE.depth + 0.5);
  ctx.fillStyle = front;
  ctx.fillRect(f.x, f.y, box.w * s + 0.5, box.h * s + 0.5);
}

// Where a floor tile sits: its material, and whether a wall stands to its north or west (its shade).
export interface FloorAt {
  kind: FloorKind;
  north: boolean;
  west: boolean;
}

// A floor tile's top face in the room's material (stone flags or boards), with the soft shade at the
// foot of a wall beside it. From the tile atlas once the world has settled (render/atlas.ts).
export function floorTop(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  x: number,
  y: number,
  fill: string,
  at: FloorAt = { kind: "stone", north: false, west: false },
) {
  const p = toScreen(cam, x, y);
  const s = cam.scale;
  const d = s * LIVE.depth;
  if (fill !== WORLD.floor) {
    ctx.fillStyle = fill;
    ctx.fillRect(p.x, p.y, s + 0.5, d + 0.5);
    return;
  }
  const v = floorVariant(x, y);
  const tile = `floor:${at.kind}:${v}:${at.north ? "n" : ""}${at.west ? "w" : ""}`;
  drawTile(ctx, s, tile, p.x, p.y, s + 0.5, d + 0.5, (c, ox, oy) => {
    paintFloor(c, s, d, v, at.kind, ox, oy);
    paintAo(c, s, d, at.north, at.west, ox, oy);
  });
}

// A wall: its lit top and its graded front, with the contact shade along the foot when south-open.
export function wall(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  x: number,
  y: number,
  southOpen: boolean,
) {
  const s = cam.scale;
  const d = s * LIVE.depth;
  const h = wallAt(y) * s;
  const t = toScreen(cam, x, y, wallAt(y));
  // the top and the front are one tile: the front starts where the top ends, d below
  drawTile(
    ctx,
    s,
    southOpen ? "wall:open" : "wall",
    t.x,
    t.y,
    s + 0.5,
    d + h + 0.5,
    (c, ox, oy) => {
      paintWallTop(c, s, d, ox, oy);
      paintWallFront(c, s, h, southOpen, ox, oy + d);
    },
  );
}

// Glass: a wall you can see through. Graded translucent top and front, a sheen band and two glints,
// and the outline. A static tile, so from the atlas once the world has settled.
export function glass(ctx: CanvasRenderingContext2D, cam: Camera, x: number, y: number) {
  const s = cam.scale;
  const d = s * LIVE.depth;
  const h = wallAt(y) * s;
  const t = toScreen(cam, x, y, wallAt(y));
  drawTile(ctx, s, "glass", t.x, t.y, s + 0.5, d + h + 0.5, (c, ox, oy) =>
    paintGlass(c, s, d, h, ox, oy),
  );
}

// A vent: an opaque slatted wall of brushed steel. Sight stops at it, sound goes through.
export function vent(ctx: CanvasRenderingContext2D, cam: Camera, x: number, y: number) {
  const s = cam.scale;
  const d = s * LIVE.depth;
  const h = wallAt(y) * s;
  const t = toScreen(cam, x, y, wallAt(y));
  drawTile(ctx, s, "vent", t.x, t.y, s + 0.5, d + h + 0.5, (c, ox, oy) =>
    paintVent(c, s, d, h, ox, oy),
  );
}

// Flat things lying on the floor: plates, the exit, hide spots, an open door's slot, the sign.
// How far a plate has sunk (px): 3 pressed, 0 up. Pressed, it sinks in over 180 ms; let go, it springs
// back up past level and settles (200 ms), with no dust: the two differ in motion, not only colour.
const PLATE_SINK = 3;
function plateSunk(e: EntityView, scene: Scene): number {
  const press = motionT(scene, e.id, "press");
  if (press !== undefined && e.state === "pressed") return PLATE_SINK * sink(press);
  const release = motionT(scene, e.id, "release");
  if (release !== undefined && e.state !== "pressed")
    return PLATE_SINK * (1 - ease.spring(release));
  return e.state === "pressed" ? PLATE_SINK : 0;
}

// A plate pressed: a puff of dust out of each side as it goes down.
function platePuffs(ctx: CanvasRenderingContext2D, e: EntityView, cam: Camera, scene: Scene) {
  const t = motionT(scene, e.id, "press");
  if (t === undefined || e.state !== "pressed") return;
  const c = toScreen(cam, e.pos.x, e.pos.y);
  ctx.save();
  ctx.fillStyle = COLOR.uiMuted;
  for (const p of puff(t, "side")) {
    ctx.globalAlpha = p.a;
    ctx.beginPath();
    ctx.arc(
      c.x + p.dx * cam.scale * 0.6,
      c.y + p.dy * cam.scale * LIVE.depth,
      p.r * cam.scale,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}

export function drawFlat(ctx: CanvasRenderingContext2D, e: EntityView, cam: Camera, scene: Scene) {
  const s = cam.scale;
  const p = toScreen(cam, e.pos.x - 0.5, e.pos.y - 0.5);
  const d = s * LIVE.depth;
  if (e.kind === "plate" && e.crateOnly) {
    // a crate's seat: a near full-tile square in a crate-brown frame with a crate's X brace, so it
    // never reads as the person's plate. It sinks when a crate holds it. No number: no sign names it.
    const x = p.x + s * 0.06;
    const sunk = plateSunk(e, scene);
    const y = p.y + d * 0.06 + sunk;
    const w = s * 0.88;
    const h = d * 0.88 - sunk * 0.5;
    ctx.fillStyle = e.state === "pressed" ? WORLD.platePressed : WORLD.plate;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = WORLD.crateBrace;
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, w, h);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.2, y + h * 0.2);
    ctx.lineTo(x + w * 0.8, y + h * 0.8);
    ctx.moveTo(x + w * 0.8, y + h * 0.2);
    ctx.lineTo(x + w * 0.2, y + h * 0.8);
    ctx.stroke();
    platePuffs(ctx, e, cam, scene);
  } else if (e.kind === "plate") {
    const inset = MAP.plateInset;
    const sunk = plateSunk(e, scene);
    ctx.fillStyle = e.state === "pressed" ? WORLD.platePressed : WORLD.plate;
    ctx.fillRect(
      p.x + s * inset,
      p.y + d * inset + sunk,
      s * (1 - inset * 2),
      d * (1 - inset * 2) - sunk * 0.5,
    );
    ctx.strokeStyle = WORLD.line;
    ctx.lineWidth = 2;
    ctx.strokeRect(
      p.x + s * inset,
      p.y + d * inset + sunk,
      s * (1 - inset * 2),
      d * (1 - inset * 2) - sunk * 0.5,
    );
    // the plate's number, so a sign that says "7 1 4" can be matched to the floor
    ctx.fillStyle = WORLD.line;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.round(s * 0.42)}px system-ui, sans-serif`;
    ctx.fillText(e.id.replace(/^p/, ""), p.x + s / 2, p.y + d / 2 + sunk * 0.5 + 1);
    platePuffs(ctx, e, cam, scene);
  } else if (e.kind === "door" && e.state === "open") {
    // the door has slid into the floor: only its slot is left
    ctx.lineWidth = 2;
    ctx.strokeStyle = WORLD.doorSeam;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(p.x + 1, p.y + 1, s - 2, d - 2);
    ctx.setLineDash([]);
  } else if (e.kind === "exit") {
    ctx.globalAlpha = e.state === "occupied" ? 0.9 : 0.7; // someone is standing on it
    ctx.fillStyle = WORLD.exit;
    ctx.fillRect(p.x, p.y, s + 0.5, d + 0.5);
    ctx.globalAlpha = 1;
    hatch(ctx, p.x, p.y, s, d, WORLD.exitFlag);
    // someone just stepped on: an outline marches out of the hatch and is gone (400 ms)
    const t = motionT(scene, e.id, "march");
    if (t !== undefined) {
      const grow = ease.out(t) * s * 0.18;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = WORLD.exitFlag;
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x - grow, p.y - grow * LIVE.depth, s + grow * 2, d + grow * 2 * LIVE.depth);
      ctx.restore();
    }
  } else if (e.kind === "hide") {
    ctx.lineWidth = 2;
    ctx.strokeStyle = WORLD.line;
    ctx.globalAlpha = 0.7;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(p.x + s * 0.1, p.y + d * 0.1, s * 0.8, d * 0.8);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  } else if (e.kind === "sign" && (e.shows?.length || !e.text)) {
    // a plaque (text, no plates) is drawn on the wall over its tile instead (stations.ts: drawPlaque)
    drawSign(ctx, e, toScreen(cam, e.pos.x, e.pos.y), s, scene);
  }
}

// The code on the floor: "7 > 1 > 4". Plates already pressed in order turn green,
// and a thin line under the sign drains over the 5 s you have to press the next
// one. Quiet on purpose: you only need it once you are partway through.
// A right plate stamps the sign (it pops 15% and back, 200 ms); a reset shakes it once ±4 px over
// 300 ms and holds a steady danger outline for 600 ms more; the whole sequence done spreads a fill
// across it (400 ms). Told apart by motion, not by colour (Can't hear). Reduced motion: none.
function drawSign(
  ctx: CanvasRenderingContext2D,
  e: EntityView,
  where: { x: number; y: number },
  s: number,
  scene: Scene,
) {
  const stamp = motionT(scene, e.id, "stamp");
  const wrong = motionT(scene, e.id, "shake");
  const fill = motionT(scene, e.id, "ripple");
  const jolt = wrong === undefined ? 0 : shake(Math.min(1, wrong * 3), 4); // its first 300 of 900 ms
  const at = { x: where.x + jolt, y: where.y };
  const ids = (e.shows ?? []).map((id) => id.replace(/^p/, ""));
  const done = e.progress ?? 0;
  const sep = " > ";
  ctx.save();
  ctx.font = `700 ${Math.round(s * 0.4)}px system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const widths = ids.map((id) => ctx.measureText(id).width);
  const sepW = ctx.measureText(sep).width;
  const textW = widths.reduce((sum, w) => sum + w, 0) + sepW * Math.max(0, ids.length - 1);
  const w = Math.max(s, textW + s * 0.4);
  const top = at.y - s * 0.35;
  ctx.fillStyle = COLOR.panel;
  ctx.strokeStyle =
    e.flash === "wrong"
      ? COLOR.danger
      : e.flash === "ok" || done >= ids.length
        ? COLOR.goal
        : COLOR.ui;
  ctx.lineWidth = 2;
  if (stamp !== undefined) {
    // the stamp: scaled about the sign's middle, popping past full size and settling
    const k = 1 + 0.15 * Math.sin(stamp * Math.PI) * pop(stamp);
    ctx.translate(at.x, at.y);
    ctx.scale(k, k);
    ctx.translate(-at.x, -at.y);
  }
  ctx.beginPath();
  ctx.roundRect(at.x - w / 2, top, w, s * 0.7, 3);
  ctx.fill();
  ctx.stroke();
  if (wrong !== undefined) {
    ctx.save();
    ctx.strokeStyle = COLOR.danger;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }
  if (fill !== undefined) {
    const r = ripple(fill);
    ctx.save();
    ctx.globalAlpha = 0.35 * (1 - fill);
    ctx.fillStyle = COLOR.goal;
    ctx.fillRect(at.x - (w / 2) * r, top, w * r, s * 0.7);
    ctx.restore();
  }
  let x = at.x - textW / 2;
  ids.forEach((id, i) => {
    ctx.fillStyle = i < done ? COLOR.goal : COLOR.ui;
    ctx.fillText(id, x, at.y + 1);
    x += widths[i] ?? 0;
    if (i < ids.length - 1) {
      ctx.fillStyle = COLOR.uiMuted;
      ctx.fillText(sep, x, at.y + 1);
      x += sepW;
    }
  });
  if (e.window !== undefined) {
    ctx.fillStyle = e.window < 0.3 ? COLOR.danger : COLOR.uiMuted;
    ctx.fillRect(at.x - w / 2, top + s * 0.7 + 3, w * e.window, 3);
  }
  ctx.restore();
}

// A door opening (450 ms, ADR 0025: drawn wherever it is): its two leaves part from the seam and sink
// into the floor, with a 1 px thud as they land and a line of dust along the seam. The open door's
// slot is the floor layer's. Called from the door fx, so a door out of sight moves too.
export function drawDoorOpening(ctx: CanvasRenderingContext2D, cam: Camera, at: Vec, t: number) {
  const s = cam.scale;
  const full = LIVE.block * (LIVE.rowRise && LIVE.wall > 0 ? wallAt(at.y - 0.5) / LIVE.wall : 1);
  const down = sink(t);
  const h = full * (1 - down);
  const gap = (s / 2) * ease.out(t) * 0.6; // how far each leaf has slid from the seam
  const thud = t > 0.85 ? 1 : 0;
  const top = toScreen(cam, at.x - 0.5, at.y - 0.5, h);
  const d = s * LIVE.depth;
  if (h > 0.001) {
    for (const side of [0, 1] as const) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(top.x + side * (s / 2), top.y - s, s / 2, d + h * s + s + 2);
      ctx.clip();
      ctx.translate((side === 0 ? -gap : gap) * 0.5, thud);
      paintDoor(ctx, s, d, h * s, top.x, top.y);
      ctx.restore();
    }
  }
  const seam = toScreen(cam, at.x, at.y + 0.5);
  ctx.save();
  ctx.fillStyle = COLOR.uiMuted;
  for (const p of puff(t, "line")) {
    ctx.globalAlpha = p.a;
    ctx.beginPath();
    ctx.arc(seam.x + p.dx * s, seam.y + p.dy * s, p.r * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Things that stand up out of the floor, drawn in painter's order with the figures.
export function drawStanding(
  ctx: CanvasRenderingContext2D,
  e: EntityView,
  cam: Camera,
  scene: Scene,
) {
  const s = cam.scale;
  if (e.kind === "door") {
    // a closed door grows with its row's walls as the board tips
    const h = LIVE.block * (LIVE.rowRise && LIVE.wall > 0 ? wallAt(e.pos.y - 0.5) / LIVE.wall : 1);
    const box = { x: e.pos.x - 0.5, y: e.pos.y - 0.5, w: 1, d: 1, h };
    const t = toScreen(cam, box.x, box.y, box.h);
    paintDoor(ctx, s, s * LIVE.depth, h * s, t.x, t.y);
  } else if (e.kind === "crate") {
    const inset = 0.08;
    const box = {
      x: e.pos.x - 0.5 + inset,
      y: e.pos.y - 0.5 + inset,
      w: 1 - inset * 2,
      d: 1 - inset * 2,
      h: LIVE.block,
    };
    // its shadow on the floor under it, before the body
    const foot = toScreen(cam, box.x + box.w / 2, box.y + box.d / 2);
    paintCrateShadow(ctx, foot.x, foot.y, (box.w * s) / 2, (box.d * s * LIVE.depth) / 2, s);
    const t = toScreen(cam, box.x, box.y, box.h);
    // just pushed: it rocks 2° about its leading foot and settles (250 ms)
    const rock = motionT(scene, e.id, "crate");
    if (rock !== undefined) {
      ctx.save();
      ctx.translate(foot.x, foot.y);
      ctx.rotate((pivot(rock, 2) * Math.PI) / 180);
      ctx.translate(-foot.x, -foot.y);
    }
    paintCrate(ctx, box.w * s, box.d * s * LIVE.depth, LIVE.block * s, t.x, t.y);
    if (rock !== undefined) ctx.restore();
  } else if (e.kind === "loot") {
    const bob =
      scene.reducedMotion || scene.nowMs === undefined ? 0 : Math.sin(scene.nowMs / 300) * 0.06;
    const at = toScreen(cam, e.pos.x, e.pos.y, 0.5 + bob);
    diamond(ctx, at.x, at.y, s * 0.3);
    ctx.fillStyle = COLOR.goal;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = WORLD.line;
    ctx.stroke();
  } else if (e.kind === "checkpoint") {
    const foot = toScreen(cam, e.pos.x - 0.2, e.pos.y);
    const topY = foot.y - s * 0.9;
    // a figure arrived: the pole wobbles (220 ms); the flag set: the pennant unrolls and waves once
    const pip = motionT(scene, e.id, "pip");
    const set = motionT(scene, e.id, "unfurl");
    const lean = pip === undefined ? 0 : pivot(pip, 4) * Math.sin(pip * Math.PI * 2);
    const out = set === undefined ? 1 : unfurl(set);
    const wave = set === undefined ? 0 : Math.sin(set * Math.PI * 2) * (1 - set) * s * 0.08;
    ctx.save();
    ctx.translate(foot.x, foot.y);
    ctx.rotate((lean * Math.PI) / 180);
    ctx.translate(-foot.x, -foot.y);
    ctx.lineWidth = 2;
    ctx.strokeStyle = WORLD.line;
    ctx.beginPath();
    ctx.moveTo(foot.x, foot.y);
    ctx.lineTo(foot.x, topY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(foot.x, topY);
    ctx.lineTo(foot.x + s * 0.5 * out, topY + s * 0.17 + wave);
    ctx.lineTo(foot.x, topY + s * 0.35);
    ctx.closePath();
    ctx.fillStyle = e.state === "reached" ? COLOR.goal : COLOR.ui;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (e.state !== "reached") {
      // three pips: one filled for each player at the flag; all three sets it
      for (let i = 0; i < 3; i++) {
        // the newest filled pip pops in
        const fresh = pip !== undefined && i === (e.present ?? 0) - 1 ? pop(pip) : 1;
        ctx.beginPath();
        ctx.arc(foot.x + s * (i * 0.2 - 0.1), foot.y + s * 0.14, s * 0.06 * fresh, 0, Math.PI * 2);
        if (i < (e.present ?? 0)) {
          ctx.fillStyle = WORLD.line;
          ctx.fill();
        } else {
          ctx.lineWidth = 1;
          ctx.strokeStyle = WORLD.line;
          ctx.stroke();
        }
      }
    }
  } else if (e.kind === "stamp" && e.state) {
    drawStamp(ctx, e.state as Stamp, toScreen(cam, e.pos.x, e.pos.y), s, e.age ?? 0, scene);
  }
}

// A mark is an upright signpost on its tile, fading over its life but never quite gone until
// the server drops it. `faint` marks (in tiles you can't see) are drawn by sight.ts's caller.
function drawStamp(
  ctx: CanvasRenderingContext2D,
  id: Stamp,
  foot: { x: number; y: number },
  s: number,
  ageMs: number,
  scene: Scene,
) {
  void scene;
  const word = id === "door" || id === "key";
  ctx.save();
  ctx.globalAlpha *= Math.max(0.25, 1 - ageMs / STAMP_LIFE_MS); // on top of any fade the caller set
  const w = s * (word ? 1.3 : 0.8);
  const h = s * 0.7;
  const top = foot.y - s * 0.55 - h;
  ctx.strokeStyle = WORLD.line;
  ctx.lineWidth = 3;
  ctx.beginPath(); // the post
  ctx.moveTo(foot.x, foot.y);
  ctx.lineTo(foot.x, top + h);
  ctx.stroke();
  ctx.fillStyle = COLOR.ui;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(foot.x - w / 2, top, w, h, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = WORLD.line;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(s * (word ? 0.4 : 0.65))}px system-ui, sans-serif`;
  ctx.fillText(STAMP_FACE[id], foot.x, top + h / 2 + 1);
  ctx.restore();
}
