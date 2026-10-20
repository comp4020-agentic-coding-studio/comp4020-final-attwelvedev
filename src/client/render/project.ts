import { MAP } from "../tokens.ts";
import type { Scene } from "./index.ts";

// The 3/4 projection (ADR 0016, DESIGN.md "The 3/4 recipe"). The grid stays axis-aligned with
// north up; depth is squashed by TILT.depth and height lifts a point straight up the screen.
// All three are fractions of a tile.
export const TILT = { depth: 0.82, wall: 1.1, block: 0.7 } as const;

// What the projection is right now. The world rises out of the flat reveal (FR25): at rise 0 depth
// is a full tile and nothing has height, at rise 1 it is TILT. Set once per frame, by camera() and
// draw(), so one frame never mixes two states.
export const LIVE: { depth: number; wall: number; block: number } = { ...TILT };

export function setRise(rise: number): void {
  const r = Math.max(0, Math.min(1, rise));
  LIVE.depth = 1 + (TILT.depth - 1) * r;
  LIVE.wall = TILT.wall * r;
  LIVE.block = TILT.block * r;
}

export interface Camera {
  scale: number; // pixels per tile across
  ox: number; // pixel position of tile (0, 0) on the floor
  oy: number;
  // How fast the eased camera is moving, in pixels a second, so the next frame can carry it on.
  // Only an eased camera has it; the target the game asks for does not.
  vx?: number;
  vy?: number;
}

export function toScreen(cam: Camera, x: number, y: number, z = 0): { x: number; y: number } {
  return { x: cam.ox + x * cam.scale, y: cam.oy + y * cam.scale * LIVE.depth - z * cam.scale };
}

// The floor point under a screen point, for turning a tap into a tile.
export function fromScreen(cam: Camera, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - cam.ox) / cam.scale, y: (sy - cam.oy) / (cam.scale * LIVE.depth) };
}

// Tiles across the window while following: about 18 on desktop, about 7 on a phone.
export const VIEW_TILES = { desktop: 18, phone: 7 } as const;
const DESKTOP_MIN_PX = 720;
// The room's slab runs this far below its south edge before the cliff meets the water; fit
// keeps a little of it in frame, follow lets the rest run off the bottom.
const CLIFF_RESERVE = 0.5;

// Where the window sits along one axis: centred on `want`, but never so far
// from `self` that it would leave them closer than `margin` to the edge, and
// never past the room's edges (a room smaller than the window is centred).
function windowStart(
  want: number,
  self: number,
  view: number,
  room: number,
  margin: number,
): number {
  if (room <= view) return (room - view) / 2;
  const reach = Math.max(0, view / 2 - margin);
  const centre = Math.max(self - reach, Math.min(self + reach, want));
  return Math.max(0, Math.min(room - view, centre - view / 2));
}

// The whole room in frame, walls and a strip of cliff included.
function fitCamera(scene: Scene): Camera {
  const roomW = scene.tiles?.[0]?.length ?? 1;
  const roomH = scene.tiles?.length ?? 1;
  const projected = roomH * LIVE.depth + LIVE.wall; // the room's height on screen, in tiles
  const scale = Math.max(Math.min(scene.w / roomW, scene.h / (projected + CLIFF_RESERVE)), 1);
  return {
    scale,
    ox: (scene.w - roomW * scale) / 2,
    oy: (scene.h - (projected + CLIFF_RESERVE) * scale) / 2 + LIVE.wall * scale,
  };
}

// The game camera: follows the team and keeps your own avatar in frame.
function followCamera(scene: Scene): Camera {
  const roomW = scene.tiles?.[0]?.length ?? 1;
  const roomH = scene.tiles?.length ?? 1;
  const projected = roomH * LIVE.depth + LIVE.wall;
  const scale = scene.w / (scene.w >= DESKTOP_MIN_PX ? VIEW_TILES.desktop : VIEW_TILES.phone);
  const players = scene.entities.filter((e) => e.kind === "player");
  const centroid =
    players.length === 0
      ? (scene.self ?? { x: roomW / 2, y: roomH / 2 })
      : {
          x: players.reduce((sum, p) => sum + p.pos.x, 0) / players.length,
          y: players.reduce((sum, p) => sum + p.pos.y, 0) / players.length,
        };
  const self = scene.self ?? centroid;
  const left = windowStart(
    centroid.x,
    self.x,
    scene.w / scale,
    roomW,
    MAP.edgeMargin * (scene.w / scale),
  );
  // vertically in screen tiles from the top of the north wall, since depth is squashed
  const q = (y: number) => y * LIVE.depth + LIVE.wall;
  const top = windowStart(
    q(centroid.y),
    q(self.y),
    scene.h / scale,
    projected,
    MAP.edgeMargin * (scene.h / scale),
  );
  return { scale, ox: -left * scale, oy: (LIVE.wall - top) * scale };
}

// "fit" shows the whole room (the home feeds, the reveal); "follow" is the game camera. While the
// world is still rising, "follow" is eased from the whole room toward the game camera, so the
// first frame of the game is the reveal's room exactly and the two cross-fade without a jump.
export function camera(scene: Scene): Camera {
  const rise = Math.max(0, Math.min(1, scene.rise ?? 1));
  setRise(rise);
  if (scene.layout === "fit" || !scene.tiles) return fitCamera(scene);
  const follow = followCamera(scene);
  if (rise >= 1) return follow;
  const fit = fitCamera(scene);
  const mix = (a: number, b: number) => a + (b - a) * rise;
  return {
    scale: mix(fit.scale, follow.scale),
    ox: mix(fit.ox, follow.ox),
    oy: mix(fit.oy, follow.oy),
  };
}

// The tiles that can touch the canvas, with a tile's slack, so a big room costs what a window costs.
export function tileWindow(cam: Camera, w: number, h: number, cols: number, rows: number) {
  const s = cam.scale;
  const d = s * LIVE.depth;
  return {
    x0: Math.max(0, Math.floor(-cam.ox / s) - 1),
    x1: Math.min(cols - 1, Math.ceil((w - cam.ox) / s) + 1),
    y0: Math.max(0, Math.floor(-cam.oy / d) - 1),
    y1: Math.min(rows - 1, Math.ceil((h - cam.oy + LIVE.wall * s) / d) + 1),
  };
}

// Eases the drawn camera toward where the game camera says it should be, so it never snaps. The
// target is a clamp with a dead zone: it sits still, then follows at full speed the moment you pass
// its margin, and your own position arrives in 0.2-tile steps at 20 Hz. A first-order ease turns
// that corner into a curve but still starts at full strength, and a measured walk in a browser had
// its speed change by 1.1 to 1.5 px in a single frame at the start: a lurch. So the camera is a
// critically damped spring with a velocity of its own: its speed cannot change faster than the
// spring allows, which is "no lurch" by construction, and it settles with no overshoot. `dtMs` is
// the frame's time, so it behaves the same at 30 fps and 144. With nothing to ease from, or a
// window that changed size, or a jump, the target is taken as it is. Once it is within half a pixel
// and almost still it lands on the target exactly, so a still room is a still picture (the home
// feeds, and the specs that compare frames, rely on that).
// Seconds to close most of a gap. Measured over a walk the full length of a 48-tile room with the
// teammates left behind, at desktop and phone width, 20 Hz position steps and all (the avatar's
// closest approach to the window edge; the worst change of camera speed in one frame, as a share of
// its cruise speed): 0.4 lets you out of the phone window; 0.3 keeps you 6% in on a phone; 0.15
// keeps you 14% in on desktop and 18% on a phone with a change of 9-12%; 0.1 and below buys no more
// room and gets visibly more abrupt (17-24% at 0.05). Smoother than 0.15 costs you the edge.
const SMOOTH_S = 0.15;
const SETTLE_PX = 0.5;
const SETTLE_SPEED = 8; // px a second
const JUMP_TILES = 6; // a gap this wide is a teleport, not a walk: take the target outright

export function easeCamera(
  from: Camera | null,
  target: Camera,
  dtMs: number,
  _scene: Scene,
  smoothS = SMOOTH_S,
): Camera {
  if (!from || Math.abs(from.scale - target.scale) > 1e-6) return target;
  if (Math.hypot(target.ox - from.ox, target.oy - from.oy) > JUMP_TILES * target.scale)
    return target;
  const dt = Math.min(Math.max(0, dtMs), 100) / 1000; // a long frame must not fling the camera
  const omega = 2 / smoothS;
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x); // exp(-x), cheaply and stably
  const step = (at: number, aim: number, speed: number) => {
    const gap = at - aim;
    const carry = (speed + omega * gap) * dt;
    return { at: aim + (gap + carry) * decay, speed: (speed - omega * carry) * decay };
  };
  const px = step(from.ox, target.ox, from.vx ?? 0);
  const py = step(from.oy, target.oy, from.vy ?? 0);
  const settled =
    Math.abs(target.ox - px.at) < SETTLE_PX &&
    Math.abs(target.oy - py.at) < SETTLE_PX &&
    Math.abs(px.speed) < SETTLE_SPEED &&
    Math.abs(py.speed) < SETTLE_SPEED;
  if (settled) return target;
  return { scale: target.scale, ox: px.at, oy: py.at, vx: px.speed, vy: py.speed };
}
