import type { Role } from "../game/types.ts";
import { ROLE_LABEL } from "../game/types.ts";
import { RoleShape } from "./RoleShape.tsx";

// The lamp's light in a sighted HUD (FR25): four rays and the puller's role shape, for a second.
// Lit or nothing: the rays and the shape carry it, not the colour.
export function LampLight({ from }: { from: Role | null }) {
  if (!from) return null;
  return (
    <span class="lamp-light" role="status" aria-label={`Lamp from ${ROLE_LABEL[from]}`}>
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="5" fill="var(--w-lamp)" stroke="currentColor" stroke-width="2" />
        <path d="M12 1v4M12 19v4M1 12h4M19 12h4" stroke="currentColor" stroke-width="2" />
      </svg>
      <RoleShape role={from} size={14} />
    </span>
  );
}
