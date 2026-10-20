import type { Settings } from "./settings.ts";

// What the V key or the mic button does to the microphone. Hold mode follows the
// key; toggle mode flips on each press and ignores letting go. "off" is Esc, the
// window losing focus or leaving the page: it always closes the mic.
export function micAfter(
  mode: Settings["voiceMode"],
  on: boolean,
  event: "down" | "up" | "off",
): boolean {
  if (event === "off") return false;
  if (mode === "hold") return event === "down";
  return event === "down" ? !on : on;
}
