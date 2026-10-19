export type Role = "blind" | "deaf" | "mute";
export const ROLES: readonly Role[] = ["blind", "deaf", "mute"];
export const ROLE_LABEL: Record<Role, string> = {
  blind: "Can't see",
  deaf: "Can't hear",
  mute: "Can't speak",
};
export type Method = "callout" | "text" | "voice" | "clip" | "face" | "mark";
export const METHODS: readonly Method[] = ["callout", "text", "voice", "clip", "face", "mark"];
// ADR 0011: who may send and who receives, per method.
export const SENDS: Record<Role, readonly Method[]> = {
  blind: ["callout", "text", "voice", "face"],
  deaf: ["callout", "text", "voice", "clip", "face", "mark"],
  mute: ["clip", "face", "mark"],
};
export const RECEIVES: Record<Role, readonly Method[]> = {
  blind: ["callout", "text", "voice", "clip"],
  deaf: ["face", "mark"],
  mute: ["callout", "text", "voice", "clip", "face", "mark"],
};
export const canSend = (role: Role, method: Method): boolean => SENDS[role].includes(method);
export const canReceive = (role: Role, method: Method): boolean => RECEIVES[role].includes(method);
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
