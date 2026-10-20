import type { Role } from "../game/types.ts";

interface ColorTokens {
  bg: string;
  panel: string;
  ink: string;
  ui: string;
  uiMuted: string;
  danger: string;
  goal: string;
  cameraLight: string;
}

// Canvas colours mirror src/styles/tokens.css (tokens.test.ts keeps them equal,
// normal and high-contrast both). Code draws with these and never writes a
// colour of its own; setContrast mutates them in place, so render.ts (which
// reads them fresh every frame) never needs to know contrast mode exists.
const NORMAL: ColorTokens = {
  bg: "#0b1220",
  panel: "#141e36",
  ink: "#000000", // the Can't-see viewport
  ui: "#e8eef9",
  uiMuted: "#9aa7c2",
  danger: "#ff3b5c",
  goal: "#5be3a8",
  cameraLight: "#ffd166", // a watched zone, always hatched
};
const HIGH_CONTRAST: ColorTokens = {
  bg: "#000000",
  panel: "#000000",
  ink: "#000000",
  ui: "#ffffff",
  uiMuted: "#ffffff",
  danger: "#ff1a1a",
  goal: "#00ff88",
  cameraLight: "#ffff00",
};
export const COLOR: ColorTokens = { ...NORMAL };

// The world: what the canvas draws the island with (tokens.css --w-*, DESIGN.md section 2).
export interface WorldTokens {
  skyHi: string;
  skyLo: string;
  water: string;
  waterDeep: string;
  ripple: string;
  floor: string;
  floorFront: string;
  seam: string;
  cliffHi: string;
  cliffLo: string;
  wallTop: string;
  wallFront: string;
  wallShade: string;
  crate: string;
  crateFront: string;
  crateBrace: string;
  door: string;
  doorFront: string;
  doorSeam: string;
  plate: string;
  platePressed: string;
  glass: string;
  glassFront: string;
  vent: string;
  ventFront: string;
  ventSlat: string;
  mist: string;
  night: string;
  nightRim: string;
  line: string;
  laser: string;
  watch: string;
  exit: string;
  exitFlag: string;
}

const WORLD_NORMAL: WorldTokens = {
  skyHi: "#fadccb",
  skyLo: "#cdebdf",
  water: "#6cc3b8",
  waterDeep: "#3f9a98",
  ripple: "#a9e2d6",
  floor: "#f7e9d2",
  floorFront: "#e6c7a0",
  seam: "#eedcc1",
  cliffHi: "#e9b48c",
  cliffLo: "#c98a86",
  wallTop: "#f4b9c3",
  wallFront: "#dc8fa6",
  wallShade: "#b9708f",
  crate: "#f2b57a",
  crateFront: "#cf8a55",
  crateBrace: "#a86a3d",
  door: "#f6cf63",
  doorFront: "#d9a93a",
  doorSeam: "#a9822a",
  plate: "#a8e3c9",
  platePressed: "#7fcfae",
  glass: "#d6f2f8",
  glassFront: "#9ccfdb",
  vent: "#a3a8c4",
  ventFront: "#8e93b0",
  ventSlat: "#6c7192",
  mist: "#e4e8ec",
  night: "#1d2130",
  nightRim: "#3a4157",
  line: "#2e2a4a",
  laser: "#e5304f",
  watch: "#e9a400",
  exit: "#bdefd8",
  exitFlag: "#2fa678",
};
const WORLD_HIGH: WorldTokens = {
  skyHi: "#000000",
  skyLo: "#000000",
  water: "#000000",
  waterDeep: "#000000",
  ripple: "#262626",
  floor: "#1a1a1a",
  floorFront: "#333333",
  seam: "#2e2e2e",
  cliffHi: "#262626",
  cliffLo: "#0d0d0d",
  wallTop: "#ffffff",
  wallFront: "#bdbdbd",
  wallShade: "#7a7a7a",
  crate: "#ffaa00",
  crateFront: "#cc8800",
  crateBrace: "#000000",
  door: "#ffdd00",
  doorFront: "#b39b00",
  doorSeam: "#000000",
  plate: "#00ff88",
  platePressed: "#00b35f",
  glass: "#66ddff",
  glassFront: "#00aacc",
  vent: "#cccccc",
  ventFront: "#999999",
  ventSlat: "#000000",
  mist: "#000000",
  night: "#000000",
  nightRim: "#ffffff",
  line: "#ffffff",
  laser: "#ff1a1a",
  watch: "#ffff00",
  exit: "#00ff88",
  exitFlag: "#ffffff",
};
// The alarm's dusk set (--dusk-*): only what is listed changes; lasers, roles and Show items do not.
export const DUSK: Partial<WorldTokens> = {
  skyHi: "#3a2e44",
  skyLo: "#5a2236",
  water: "#2b3346",
  waterDeep: "#1f2536",
  wallTop: "#4a5068",
  wallFront: "#353a4f",
  wallShade: "#2a2e40",
  floor: "#5c6178",
  floorFront: "#474c62",
  seam: "#50556c",
};

export const WORLD: WorldTokens = { ...WORLD_NORMAL };

// How much of the veil shows over tiles out of sight: 60 % mist, or half black under high contrast.
export const MIST = { alpha: 0.6 };

const DUSK_MS = 600;
let high = false;
let dusk = { p: 0, target: 0, at: 0 }; // p: how far toward dusk, 0 to 1
let shown = -1; // the blend WORLD currently holds, so a still frame costs nothing

const hex = (c: string) => [1, 3, 5].map((i) => Number.parseInt(c.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) => {
  const [x, y] = [hex(a), hex(b)];
  return `#${[0, 1, 2]
    .map((i) =>
      Math.round((x[i] as number) + ((y[i] as number) - (x[i] as number)) * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
};

function paintWorld() {
  const t = high ? -2 : dusk.p;
  if (t === shown) return;
  shown = t;
  if (high) return void Object.assign(WORLD, WORLD_HIGH);
  Object.assign(WORLD, WORLD_NORMAL);
  if (t === 0) return;
  for (const [key, to] of Object.entries(DUSK) as [keyof WorldTokens, string][])
    WORLD[key] = t === 1 ? to : mix(WORLD_NORMAL[key], to, t);
}

// Called every frame by the renderer. Eases the world toward the dusk set (or back) over 600 ms;
// `instant` skips the ease (reduced motion, or a frame with no clock). High contrast ignores it.
export function setDusk(on: boolean, nowMs: number, instant = false): void {
  const target = on ? 1 : 0;
  const step = instant ? 1 : Math.max(0, nowMs - dusk.at) / DUSK_MS;
  const p = dusk.p < target ? Math.min(target, dusk.p + step) : Math.max(target, dusk.p - step);
  dusk = { p, target, at: nowMs };
  paintWorld();
}

const ROLE_NORMAL: Record<Role, string> = {
  blind: "#f2a93b",
  deaf: "#4db3ff",
  mute: "#9b7ee0",
};
const ROLE_HIGH_CONTRAST: Record<Role, string> = {
  blind: "#ffaa00",
  deaf: "#00ccff",
  mute: "#dd88ff",
};
export const ROLE_COLOR: Record<Role, string> = { ...ROLE_NORMAL };

// Swaps every canvas colour to its high-contrast value (or back). Reaches
// every reader because COLOR/ROLE_COLOR are mutated in place, not replaced.
export function setContrast(on: boolean): void {
  Object.assign(COLOR, on ? HIGH_CONTRAST : NORMAL);
  Object.assign(ROLE_COLOR, on ? ROLE_HIGH_CONTRAST : ROLE_NORMAL);
  high = on;
  MIST.alpha = on ? 0.5 : 0.6;
  shown = -1;
  paintWorld();
}

export type Shape = "circle" | "square" | "triangle";
export const ROLE_SHAPE: Record<Role, Shape> = {
  blind: "circle",
  deaf: "square",
  mute: "triangle",
};

// Map layout. The server runs at 20 Hz; the client draws every frame.
export const MAP = {
  desktopMinTilePx: 12,
  phoneTilePx: 28, // the phone shows a window of the room, following the team
  edgeMargin: 0.3, // your avatar stays this share of the view inside the window's edge, either axis
  avatarRadius: 0.4, // tiles
  ringWidthPx: 3,
  blindRingAlpha: 0.4,
  blindRingTiles: 1.2,
  plateInset: 0.18,
  hatchPx: 6,
  selfRingPx: 4, // the ring on the floor under your own figure
} as const;

export const NET = {
  inputHz: 20,
  interpolateMs: 50, // others are drawn this far behind, between two views
} as const;
