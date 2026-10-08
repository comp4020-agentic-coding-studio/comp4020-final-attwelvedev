export type Role = "blind" | "deaf" | "mute";
export const ROLES: readonly Role[] = ["blind", "deaf", "mute"];
export const ROLE_LABEL: Record<Role, string> = {
  blind: "Can't see",
  deaf: "Can't hear",
  mute: "Can't speak",
};
export type Family = "say" | "sound" | "show";
export const CHANNEL_RULES: Record<Family, { send: readonly Role[]; receive: readonly Role[] }> = {
  say: { send: ["blind", "deaf"], receive: ["blind", "mute"] },
  sound: { send: ["blind", "deaf", "mute"], receive: ["blind", "mute"] },
  show: { send: ["blind", "deaf", "mute"], receive: ["deaf", "mute"] },
};
export interface Vec {
  x: number; // tiles, may be fractional
  y: number;
}
export type Seat = 0 | 1 | 2;
export interface PlayerInput {
  seq: number; // client counter, echoed in views for reconciliation
  move: Vec; // each component in [-1, 1]
  act: boolean; // held
}
