import type { Role } from "../game/types.ts";

interface ColorTokens {
  bg: string;
  panel: string;
  panelHi: string;
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
  bg: "#15121f",
  panel: "#221c30",
  panelHi: "#261f35",
  ink: "#000000", // the Can't-see viewport
  ui: "#efeaf5",
  uiMuted: "#aba1c0",
  danger: "#ff3b5c",
  goal: "#5be3a8",
  cameraLight: "#ffd166", // a watched zone, always hatched
};
const HIGH_CONTRAST: ColorTokens = {
  bg: "#000000",
  panel: "#000000",
  panelHi: "#000000",
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
  // stations, gear and signals: a code colour is never alone (outlined in `line`, with its pattern)
  codeRed: string;
  codeBlue: string;
  codeYellow: string;
  codeGreen: string;
  codeWhite: string;
  codeBlack: string;
  steel: string;
  steelFront: string;
  brass: string;
  lamp: string;
  uv: string;
  uvInk: string;
  nv: string;
  card: string;
  dyePink: string;
  dyeMint: string;
  dyeSky: string;
  sconce: string; // decor's light: a lit item's glow (render/decor-paint.ts)
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
  codeRed: "#d7263d",
  codeBlue: "#2b6cd4",
  codeYellow: "#f2c230",
  codeGreen: "#2e9e5b",
  codeWhite: "#fbfaf6",
  codeBlack: "#1f1c2c",
  steel: "#b8c0cc",
  steelFront: "#8a93a3",
  brass: "#c9a14a",
  lamp: "#ffd75e",
  uv: "#6a4cff",
  uvInk: "#c8ff3d",
  nv: "#7f9a84",
  card: "#fffaf0",
  dyePink: "#ff9ec7",
  dyeMint: "#8fe3c0",
  dyeSky: "#9cc9ff",
  sconce: "#ffe9c4",
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
  codeRed: "#ff3b3b",
  codeBlue: "#4d9bff",
  codeYellow: "#ffe100",
  codeGreen: "#2bff7a",
  codeWhite: "#ffffff",
  codeBlack: "#000000",
  steel: "#d9d9d9",
  steelFront: "#8c8c8c",
  brass: "#ffcc33",
  lamp: "#ffff66",
  uv: "#000000",
  uvInk: "#ffff00",
  nv: "#000000",
  card: "#000000",
  dyePink: "#ff66cc",
  dyeMint: "#33ffcc",
  dyeSky: "#66ccff",
  sconce: "#ffffff",
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

// Each room's wall set, picked by its `hue` meta (setHue). Rose is the original set. High contrast is
// one look, so it ignores the hue. tokens.test.ts keeps these equal to --w-wall-*-<hue>.
export type Hue = "rose" | "teal" | "amber" | "violet" | "indigo";
export const HUES: readonly Hue[] = ["rose", "teal", "amber", "violet", "indigo"];
type Walls = Pick<WorldTokens, "wallTop" | "wallFront" | "wallShade">;
export const HUE_WALLS: Record<Hue, Walls> = {
  rose: { wallTop: "#f4b9c3", wallFront: "#dc8fa6", wallShade: "#b9708f" },
  teal: { wallTop: "#a9ddd3", wallFront: "#7fbfb6", wallShade: "#5f9c98" },
  amber: { wallTop: "#f2cf9a", wallFront: "#d9a96e", wallShade: "#b78653" },
  violet: { wallTop: "#cdb9ec", wallFront: "#a991d4", wallShade: "#8670b3" },
  indigo: { wallTop: "#b3bde8", wallFront: "#8a97cf", wallShade: "#6b77ae" },
};
export const HUE_DUSK: Record<Hue, Walls> = {
  rose: { wallTop: "#4a5068", wallFront: "#353a4f", wallShade: "#2a2e40" },
  teal: { wallTop: "#3f5560", wallFront: "#2f4049", wallShade: "#243239" },
  amber: { wallTop: "#56505a", wallFront: "#403b45", wallShade: "#312d36" },
  violet: { wallTop: "#4b4568", wallFront: "#37324f", wallShade: "#2a2640" },
  indigo: { wallTop: "#3f4870", wallFront: "#2f3656", wallShade: "#242a44" },
};
let hue: Hue = "rose";
export const currentHue = (): Hue => hue;

// How much of the veil shows over tiles out of sight: 60 % mist, or half black under high contrast.
export const MIST = { alpha: 0.6 };
// How the UV pool and the goggles are drawn: a wash and a tint, or (high contrast) a 3 px dashed
// rim and a 2 px inner frame with no wash or tint, so the light never muddies the black floor.
export const OVERLAY = { wash: true };

const DUSK_MS = 600;
let high = false;
// Whether the canvas is in high contrast (flat fills, no gloss or shadow on the keepsakes).
export const isHighContrast = (): boolean => high;
let dusk = { p: 0, target: 0, at: 0 }; // p: how far toward dusk, 0 to 1
let shown = -1; // the blend WORLD currently holds, so a still frame costs nothing

const hex = (c: string) => [1, 3, 5].map((i) => Number.parseInt(c.slice(i, i + 2), 16));
// Mixes two #rrggbb colours: t = 0 is a, 1 is b. Materials (render/materials.ts) mix world tokens
// toward white or black with it, so no drawn colour is a literal of its own.
export const mix = (a: string, b: string, t: number): string => {
  const [x, y] = [hex(a), hex(b)];
  return `#${[0, 1, 2]
    .map((i) =>
      Math.round((x[i] as number) + ((y[i] as number) - (x[i] as number)) * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
};

// Bumped every time WORLD is repainted, so a cache of drawn tiles (render/atlas.ts) keys on it and
// never serves a tile painted in another palette.
let stamp = 0;
export const worldStamp = (): number => stamp;
// Whether the dusk palette is at rest (fully day or fully dusk), not mid-blend.
export const duskSettled = (): boolean => dusk.p === 0 || dusk.p === 1;

// Told every time WORLD is repainted (the tile atlas drops what it painted in the old palette).
const changed: (() => void)[] = [];
export function onWorldChange(f: () => void): void {
  changed.push(f);
}

function paintWorld() {
  const t = high ? -2 : dusk.p;
  if (t === shown) return;
  shown = t;
  stamp++;
  for (const f of changed) f();
  if (high) return void Object.assign(WORLD, WORLD_HIGH);
  Object.assign(WORLD, WORLD_NORMAL, HUE_WALLS[hue]);
  if (t === 0) return;
  const day: WorldTokens = { ...WORLD_NORMAL, ...HUE_WALLS[hue] };
  for (const [key, to] of Object.entries({ ...DUSK, ...HUE_DUSK[hue] }) as [
    keyof WorldTokens,
    string,
  ][])
    WORLD[key] = t === 1 ? to : mix(day[key], to, t);
}

// Picks the room's wall set (an unknown or absent hue is rose) and repaints, as setContrast does.
export function setHue(next: string | undefined): void {
  hue = HUES.find((h) => h === next) ?? "rose";
  shown = -1;
  paintWorld();
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
  OVERLAY.wash = !on;
  SHELL.glass = on ? GLASS_HIGH : GLASS_NORMAL;
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
// The shell's chip: the canvas can't read an rgba CSS token, so --glass (rgb(34 28 48 / 90%)) and
// --r (8px) are mirrored here for labels and pops.
// setContrast swaps glass (to --glass's high-contrast value, rgb(0 0 0 / 92%)).
const GLASS_NORMAL = "rgba(34, 28, 48, 0.9)";
const GLASS_HIGH = "rgba(0, 0, 0, 0.92)";
export const SHELL: { r: number; glass: string } = { r: 8, glass: GLASS_NORMAL };

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
