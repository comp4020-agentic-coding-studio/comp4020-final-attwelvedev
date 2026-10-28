import type { GearItem } from "../game/sim/world.ts";

// A gear item's glyph, drawn (never typed, DESIGN.md's ASCII-subset rule): goggles two linked
// lenses, a stethoscope a looped tube and bell, an earpiece a curl, a torch a barrel and lens. The
// HUD's mirror of the canvas's gearGlyph (src/client/render/gear.ts). Decorative: say the name too.
export const GEAR_NAME: Record<GearItem, string> = {
  earpiece: "Earpiece",
  goggles: "Goggles",
  stethoscope: "Stethoscope",
  uv: "UV torch",
};

export function GearGlyph({ item, size = 20 }: { item: GearItem; size?: number }) {
  return (
    <svg
      class="gear-glyph"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
    >
      {item === "goggles" && (
        <>
          <circle cx="7" cy="12" r="4.5" />
          <circle cx="17" cy="12" r="4.5" />
          <path d="M11.5 12h1" />
        </>
      )}
      {item === "stethoscope" && (
        <>
          <path d="M5 4v5a5 5 0 0 0 10 0V4" />
          <path d="M10 14v3a3 3 0 0 0 6 0" />
          <circle cx="18" cy="15" r="2.5" />
        </>
      )}
      {item === "earpiece" && <path d="M8 18a6 6 0 1 1 8-5c0 3-3 3-3 6a2 2 0 0 1-4 0" />}
      {item === "uv" && (
        <>
          <rect x="3" y="9" width="12" height="6" rx="1" />
          <circle cx="18.5" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}
