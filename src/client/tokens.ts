import type { Role } from "../game/types.ts";

// Canvas colours mirror src/styles/tokens.css (tokens.test.ts keeps them equal).
// Code draws with these and never writes a colour of its own.
export const COLOR = {
  bg: "#0b1220",
  panel: "#141e36",
  ink: "#000000", // the Can't-see viewport
  ui: "#e8eef9",
  uiMuted: "#9aa7c2",
  danger: "#ff3b5c",
  goal: "#5be3a8",
  cameraLight: "#ffd166", // a watched zone, always hatched
  solid: "#3a4d7a", // walls
  floor: "#0f1830",
  crate: "#c98f5a",
} as const;

export const ROLE_COLOR: Record<Role, string> = {
  blind: "#f2a93b",
  deaf: "#4db3ff",
  mute: "#9b7ee0",
};

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
  edgeMarginTiles: 1.5, // own avatar stays this far inside the phone window
  avatarRadius: 0.4, // tiles
  ringWidthPx: 3,
  blindRingAlpha: 0.4,
  blindRingTiles: 1.2,
  plateInset: 0.18,
  hatchPx: 6,
} as const;

export const NET = {
  inputHz: 20,
  interpolateMs: 50, // others are drawn this far behind, between two views
} as const;
