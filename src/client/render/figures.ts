import type { Vec } from "../../game/types.ts";
import type { EntityView } from "../../net/protocol.ts";
import { motionT } from "../fx.ts";
import { COLOR, MAP, ROLE_COLOR, ROLE_SHAPE, WORLD } from "../tokens.ts";
import { drawBlotches } from "./dye.ts";
import { drawCarried } from "./gear.ts";
import type { Motion, Scene } from "./index.ts";
import { paintFigureBody, paintFigureShadow, paintHatSheen } from "./materials.ts";
import { hop as hopOf, pop, squash } from "./motion.ts";
import { type Camera, LIVE, toScreen } from "./project.ts";
import { floorRing, shapePath } from "./shared.ts";

const BODY_H = 0.95; // tiles, foot to crown of the pill
const BODY_W = 0.62;
const LAND_HOP = 0.25; // your own figure's hop as you land at the start of a room, in tiles
const HOP_HZ = 2.5; // a hop is sin(t * 2π * 2.5) * 2 px
const HOP_PX = 2;
const DUST_MS = 250; // a puff every quarter second
const SQUASH = 0.9; // blocked: 10 % shorter along the facing
const LEAN_DEG = 8; // pushing a crate
const PUSH_REACH = 1.3; // tiles: a crate this far ahead, in line, is the one being pushed
const PHONE_TILE_PX = 60; // under this a tile is phone-sized (7 across): carried gear gets a badge

// What a figure is doing. Facing alone survives reduced motion; the rest needs a clock too, so a
// paused frame (the home feeds pass none) is byte-stable.
interface Pose {
  facing: Vec;
  moving: boolean;
  blocked: boolean;
  pushing: boolean;
}

const animated = (scene: Scene): scene is Scene & { nowMs: number } =>
  scene.nowMs !== undefined && !scene.reducedMotion;

// The pill body, as a path at `foot` (the figure's floor point on screen).
function pill(ctx: CanvasRenderingContext2D, foot: Vec, s: number) {
  const w = s * BODY_W;
  ctx.beginPath();
  ctx.roundRect(foot.x - w / 2, foot.y - s * BODY_H, w, s * BODY_H, w / 2);
}

// A role's hat is its shape, sitting on the crown: dome, box or cone.
function hat(
  ctx: CanvasRenderingContext2D,
  foot: Vec,
  s: number,
  shape: "circle" | "square" | "triangle",
) {
  const r = s * 0.2;
  shapePath(ctx, shape, foot.x, foot.y - s * BODY_H - r * 0.6, r);
}

// A crate in line ahead of a figure that is blocked: it is pushing, not just against a wall.
function pushesCrate(scene: Scene, at: Vec, facing: Vec): boolean {
  return scene.entities.some((e) => {
    if (e.kind !== "crate") return false;
    const dx = e.pos.x - at.x;
    const dy = e.pos.y - at.y;
    const ahead = dx * facing.x + dy * facing.y;
    const aside = Math.abs(dx * facing.y - dy * facing.x);
    return ahead > 0.3 && ahead < PUSH_REACH && aside < 0.6;
  });
}

// The figure itself, foot to hat, with its pose applied: a hop lifts it, a block squashes it toward
// the way it faces, a push leans it into the crate.
function figure(
  ctx: CanvasRenderingContext2D,
  foot: Vec,
  s: number,
  scene: Scene,
  who: { role: "blind" | "deaf" | "mute"; isSelf: boolean; bot: boolean },
  pose: Pose,
  outlineOnly = false,
  extra: {
    item?: EntityView["item"];
    dyed?: boolean;
    seat?: number;
    look?: Vec;
    id?: string; // the entity, for its own motion (FR15)
  } = {},
) {
  const color = ROLE_COLOR[who.role];
  const id = extra.id;
  const fxOf = (kind: Parameters<typeof motionT>[2]) =>
    id === undefined ? undefined : motionT(scene, id, kind);
  // the room cleared: every figure hops twice in 600 ms (FR17); gear picked up: one small hop
  const cleared = fxOf("hop");
  const took = fxOf("take");
  const cheer =
    (cleared === undefined ? 0 : hopOf((cleared * 2) % 1, 0.3) * s) +
    (took === undefined ? 0 : hopOf(took, 0.15) * s);
  // caught: squashed flat in a burst where they were (the fx's first 200 ms), then they pop up here
  const caught = fxOf("caught");
  const popped = caught === undefined ? 1 : Math.max(0, (caught * 450 - 200) / 250);
  const scaleUp = caught === undefined ? 1 : popped <= 0 ? 0 : pop(popped);
  const moving = animated(scene) && !scene.cleared && pose.moving;
  const lift = moving
    ? Math.abs(Math.sin((scene.nowMs / 1000) * Math.PI * 2 * HOP_HZ)) * HOP_PX
    : 0;
  // landing at the start of a room: your own figure hops once (an arc up and back down)
  const landing = who.isSelf && scene.landing !== undefined && !scene.reducedMotion;
  const hop = landing
    ? Math.sin(Math.max(0, Math.min(1, scene.landing ?? 1)) * Math.PI) * LAND_HOP * s
    : 0;
  const at = { x: foot.x, y: foot.y - lift - hop - cheer };
  const horizontal = Math.abs(pose.facing.x) >= Math.abs(pose.facing.y);
  ctx.save();
  if (scaleUp !== 1) {
    if (scaleUp <= 0) {
      ctx.restore();
      return;
    }
    ctx.translate(foot.x, foot.y);
    ctx.scale(scaleUp, scaleUp);
    ctx.translate(-foot.x, -foot.y);
  }
  if (animated(scene) && pose.pushing) {
    ctx.translate(foot.x, foot.y);
    ctx.rotate(((horizontal ? Math.sign(pose.facing.x) : 0) * LEAN_DEG * Math.PI) / 180);
    ctx.translate(-foot.x, -foot.y);
  } else if (animated(scene) && pose.blocked) {
    ctx.translate(foot.x, foot.y);
    if (horizontal) ctx.scale(SQUASH, 1);
    else ctx.scale(1, SQUASH);
    ctx.translate(-foot.x, -foot.y);
  }
  if (outlineOnly) {
    // the same pill and hat, in the same pose, as a dashed outline: what shows of a figure behind a
    // wall. Nothing is filled, and it is the same transform as the body, so it cannot drift from it.
    ctx.strokeStyle = WORLD.line;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    pill(ctx, at, s);
    ctx.stroke();
    hat(ctx, at, s, ROLE_SHAPE[who.role]);
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.fillStyle = color;
  ctx.strokeStyle = WORLD.line;
  ctx.lineWidth = 2;
  pill(ctx, at, s);
  ctx.fill();
  paintFigureBody(ctx, at.y - s * BODY_H, s * BODY_H, color); // the soft gradient over the flat role colour
  ctx.stroke();
  // the face: a pale disc whose eyes lean toward the facing
  const faceY = at.y - s * BODY_H * 0.62;
  ctx.fillStyle = COLOR.ui;
  ctx.beginPath();
  ctx.arc(at.x, faceY, s * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = WORLD.line;
  // towed: the eyes look toward the leader's hand, not the way they walk
  const look = extra.look ?? pose.facing;
  const [lookX, lookY] = [look.x * s * 0.05, look.y * s * 0.03];
  for (const dx of [-0.06, 0.06]) {
    ctx.beginPath();
    ctx.arc(at.x + s * dx + lookX, faceY + lookY, s * 0.026, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = color;
  hat(ctx, at, s, ROLE_SHAPE[who.role]);
  ctx.fill();
  ctx.stroke();
  paintHatSheen(ctx, at.x, at.y - s * BODY_H - s * 0.2 * 0.6, s * 0.2);
  if (extra.dyed) {
    // just splattered: the blotches splat in one by one, 80 ms apart (reduced motion: at once)
    const dye = fxOf("dye");
    drawBlotches(ctx, at, s, extra.seat ?? 0, dye === undefined ? 3 : Math.floor((dye * 600) / 80));
  }
  if (extra.item) drawCarried(ctx, extra.item, at, s, faceY, s < PHONE_TILE_PX);
  if (who.bot) {
    // a bot's antenna: a stalk and a bead on the crown
    const top = at.y - s * (BODY_H + 0.34);
    ctx.beginPath();
    ctx.moveTo(at.x, at.y - s * (BODY_H + 0.12));
    ctx.lineTo(at.x, top);
    ctx.stroke();
    ctx.fillStyle = COLOR.ui;
    ctx.beginPath();
    ctx.arc(at.x, top, s * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  if (who.isSelf) {
    // the "You" chevron above the hat
    const top = at.y - s * (BODY_H + 0.55);
    ctx.fillStyle = COLOR.ui;
    ctx.beginPath();
    ctx.moveTo(at.x - s * 0.14, top);
    ctx.lineTo(at.x + s * 0.14, top);
    ctx.lineTo(at.x, top + s * 0.16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// Dust kicked up behind a figure that is walking: one puff a quarter second, growing and fading.
function dust(ctx: CanvasRenderingContext2D, foot: Vec, s: number, facing: Vec, nowMs: number) {
  const p = (nowMs % DUST_MS) / DUST_MS;
  const behind = s * (0.3 + 0.25 * p);
  ctx.save();
  ctx.globalAlpha = 0.6 * (1 - p);
  ctx.fillStyle = WORLD.floorFront;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(
      foot.x - facing.x * behind + side * s * 0.1 * (1 + p),
      foot.y - facing.y * behind * LIVE.depth,
      s * 0.06 * (1 + p),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}

// What a player is doing and how to draw them, from the view and (for you) the client's own state.
// Shared by the body and the outline behind a wall, so the two are always the same figure.
function playerLook(e: EntityView, scene: Scene) {
  const role = scene.roles[e.seat ?? 0] ?? "blind";
  const isSelf = !scene.noSelf && e.seat === scene.seat;
  // you are ahead of the server: your own pose comes from the client when it has one
  const mine = isSelf ? scene.own : undefined;
  const facing = mine?.facing ?? e.facing ?? { x: 0, y: 1 };
  const moving = mine?.moving ?? e.moving ?? false;
  const blocked = mine?.blocked ?? e.blocked ?? false;
  const pose: Pose = {
    facing,
    moving,
    blocked,
    pushing: blocked && pushesCrate(scene, e.pos, facing),
  };
  return { role, isSelf, pose, bot: scene.bots?.[e.seat ?? 0] ?? false };
}

// The outline of a figure that a wall in front of it hides, drawn after the wall at `strength`
// (how much of the figure is covered). The same figure() as the body, so the hop, the squash and
// the lean come with it. `e.pos` is where the body was drawn (yours is already the predicted one).
export function drawHidden(
  ctx: CanvasRenderingContext2D,
  e: EntityView,
  cam: Camera,
  scene: Scene,
  strength: number,
) {
  if (e.seat === undefined || strength <= 0 || e.state === "dim" || e.state === "hidden") return;
  const { role, isSelf, pose, bot } = playerLook(e, scene);
  ctx.save();
  ctx.globalAlpha = Math.min(1, strength * 1.4);
  figure(ctx, toScreen(cam, e.pos.x, e.pos.y), cam.scale, scene, { role, isSelf, bot }, pose, true);
  ctx.restore();
}

// A player: shadow on the floor, then the figure. Your own also has a ring on the floor.
export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  e: EntityView,
  cam: Camera,
  scene: Scene,
) {
  if (e.seat === undefined) return;
  const s = cam.scale;
  const { role, isSelf, pose, bot } = playerLook(e, scene);
  const { facing, moving, blocked } = pose;
  const foot = toScreen(cam, e.pos.x, e.pos.y);
  const color = ROLE_COLOR[role];

  // the shadow, and for you the ring
  paintFigureShadow(ctx, foot.x, foot.y, s * 0.36, LIVE.depth);
  if (isSelf && e.state !== "hidden" && e.state !== "dim") {
    ctx.save();
    ctx.lineWidth = MAP.selfRingPx;
    ctx.strokeStyle = COLOR.ui;
    floorRing(ctx, foot.x, foot.y, s * 0.5, LIVE.depth);
    ctx.stroke();
    ctx.restore();
  }

  if (e.state === "hidden") {
    // on a hide spot: faint, with a dashed outline, so you can see you are hidden. Just hidden
    // (250 ms): squashed down into the box from full height
    ctx.save();
    const into = motionT(scene, e.id, "hide");
    if (into !== undefined) {
      const q = squash(into);
      ctx.translate(foot.x, foot.y);
      ctx.scale(q.sx, q.sy);
      ctx.translate(-foot.x, -foot.y);
    }
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = color;
    pill(ctx, foot, s);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = isSelf ? COLOR.ui : WORLD.line;
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (e.state === "dim") {
    // in a dark zone you are only a ring: the floor, drawn in your colour
    ctx.save();
    ctx.globalAlpha = MAP.blindRingAlpha + 0.2;
    ctx.lineWidth = MAP.ringWidthPx;
    ctx.strokeStyle = color;
    floorRing(ctx, foot.x, foot.y, s * 0.45, LIVE.depth);
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (animated(scene) && !scene.cleared && moving && !blocked)
    dust(ctx, foot, s, facing, scene.nowMs);
  const leader = scene.entities.find((o) => o.kind === "player" && o.seat === e.heldBy);
  const d = leader ? Math.hypot(leader.pos.x - e.pos.x, leader.pos.y - e.pos.y) : 0;
  const look =
    leader && d > 0.01
      ? { x: (leader.pos.x - e.pos.x) / d, y: (leader.pos.y - e.pos.y) / d }
      : undefined;
  figure(ctx, foot, s, scene, { role, isSelf, bot }, pose, false, {
    item: e.item,
    dyed: e.dyed,
    seat: e.seat,
    look,
    id: e.id,
  });
}

// Can't see's own screen: black, and in the middle of it their figure, dimmed, facing the way they
// push and hopping while they walk. Nothing of the room: it tells them what their hands are doing.
export function drawOwnBlind(ctx: CanvasRenderingContext2D, scene: Scene, own: Motion) {
  const s = MAP.phoneTilePx * 2;
  const foot = { x: scene.w / 2, y: scene.h / 2 + s * BODY_H * 0.5 };
  // Can't see's screen is black from the start; their figure fades in as they land, so the room they
  // never see tips and swoops behind a black veil and not in front of one
  const arrive = Math.max(0, Math.min(1, scene.landing ?? 1));
  ctx.save();
  ctx.globalAlpha = 0.4 * arrive;
  figure(
    ctx,
    foot,
    s,
    scene,
    { role: "blind", isSelf: false, bot: scene.bots?.[scene.seat] ?? false },
    { ...own, pushing: false },
  );
  ctx.restore();
}
