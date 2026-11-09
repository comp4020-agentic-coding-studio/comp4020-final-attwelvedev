import type { Vec } from "../../game/types.ts";

// The motion primitives each object's own drawer reads (FR15): pure numbers in, numbers out. `t` is
// how far through its fx the motion is (0 to 1, clamped). Every one ends where it started or where
// the object now rests, so a drawer that stops reading its fx at t = 1 never jumps.

export type Ease = (t: number) => number;

const clamp = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t);

export const ease: {
  out: Ease;
  inOut: Ease;
  outBack: Ease;
  outBounce: Ease;
  spring: Ease;
  linear: Ease;
} = {
  linear: (t) => clamp(t),
  out: (t) => 1 - (1 - clamp(t)) ** 3,
  inOut: (t) => {
    const u = clamp(t);
    return u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2;
  },
  outBack: (t) => {
    const u = clamp(t);
    if (u === 1) return 1;
    const c = 1.70158;
    return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2;
  },
  outBounce: (t) => {
    const u = clamp(t);
    const n = 7.5625;
    const d = 2.75;
    const at = (c: number, k: number) => n * (u - c / d) ** 2 + k;
    if (u < 1 / d) return n * u * u;
    if (u < 2 / d) return at(1.5, 0.75);
    if (u < 2.5 / d) return at(2.25, 0.9375);
    return at(2.625, 0.984375);
  },
  // a damped spring that overshoots once and settles exactly on 1
  spring: (t) => {
    const u = clamp(t);
    if (u === 1) return 1;
    return 1 - Math.exp(-6 * u) * Math.cos(u * Math.PI * 2.5);
  },
};

// How far a thing has sunk into the floor: 0 at rest to 1 fully down.
export const sink = (t: number): number => ease.out(t);

// A squash and its recovery: wide and low at the middle, back to 1 × 1 at both ends.
export const squash = (t: number): { sx: number; sy: number } => {
  const k = Math.sin(clamp(t) * Math.PI);
  return { sx: 1 + 0.25 * k, sy: 1 - 0.3 * k };
};

// A rock about a corner: out to `deg` and back, once.
export const pivot = (t: number, deg: number): number => deg * Math.sin(clamp(t) * Math.PI);

// A swing that dies away: `times` full swings of ±`deg`, still at the end.
export const swing = (t: number, deg: number, times: number): number => {
  const u = clamp(t);
  if (u === 1) return 0;
  return deg * Math.sin(u * Math.PI * 2 * times) * (1 - u);
};

// How far along a slide the thing is: 0 to 1, easing in to its stop.
export const slide = (t: number): number => ease.inOut(t);

// A side-to-side shake of ±`px`, three times, still at both ends.
export const shake = (t: number, px: number): number => {
  const u = clamp(t);
  if (u === 1) return 0;
  return px * Math.sin(u * Math.PI * 6) * (1 - u);
};

// A hop: up by `h` and back down, on the ground at both ends.
export const hop = (t: number, h: number): number => h * Math.sin(clamp(t) * Math.PI);

// A thrown path from `from` to `to`, lifted by `h` at the middle (y up is minus, as on screen).
export const arc = (t: number, from: Vec, to: Vec, h: number): Vec => {
  const u = clamp(t);
  if (u === 1) return { x: to.x, y: to.y };
  return {
    x: from.x + (to.x - from.x) * u,
    y: from.y + (to.y - from.y) * u - h * Math.sin(u * Math.PI),
  };
};

// A scale that pops in past full size and settles: 0 to 1.
export const pop = (t: number): number => ease.outBack(t);

// How much of a pennant or a tape has unrolled: 0 to 1.
export const unfurl = (t: number): number => ease.out(t);

// A fill spreading from its middle: 0 to 1.
export const ripple = (t: number): number => ease.out(t);

export type PuffShape = "side" | "line" | "trail" | "curtain" | "burst";

// Where each puff of dust is, as offsets in tiles from the fx's point, with its radius (tiles) and
// alpha. They drift out and fade: every alpha is 0 at t = 1.
const PUFF_DIRS: Record<PuffShape, [number, number][]> = {
  side: [
    [-1, 0],
    [1, 0],
    [-0.8, 0.4],
    [0.8, 0.4],
  ],
  line: [
    [-0.45, 0],
    [-0.15, 0],
    [0.15, 0],
    [0.45, 0],
  ],
  trail: [
    [0, 0],
    [-0.3, 0.2],
    [0.3, 0.2],
  ],
  curtain: [
    [-0.4, -0.2],
    [0, -0.3],
    [0.4, -0.2],
    [-0.2, 0.1],
    [0.2, 0.1],
  ],
  burst: [
    [1, 0],
    [0.7, 0.7],
    [0, 1],
    [-0.7, 0.7],
    [-1, 0],
    [-0.7, -0.7],
    [0, -1],
    [0.7, -0.7],
  ],
};
export const puff = (
  t: number,
  shape: PuffShape,
): { dx: number; dy: number; r: number; a: number }[] => {
  const u = clamp(t);
  const out = ease.out(u);
  const spread = shape === "line" ? 0.1 : 0.4;
  return PUFF_DIRS[shape].map(([x, y]) => ({
    dx: shape === "line" ? x : x * (0.3 + spread * out),
    dy: shape === "line" ? -0.15 * out : y * (0.3 + spread * out),
    r: 0.07 + 0.05 * out,
    a: 0.85 * (1 - u),
  }));
};
