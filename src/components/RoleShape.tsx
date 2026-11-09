import type { Role } from "../game/types.ts";

// A role's shape in its colour, drawn (not typed) so all three are the same
// visual size in any font. `mono` fills it with the surrounding text colour. `outline` draws it
// hollow, stroked in the role's own colour: a role held before, not now (the crew row's Played history).
export function RoleShape({
  role,
  size = 28,
  mono = false,
  outline = false,
}: {
  role: Role;
  size?: number;
  mono?: boolean;
  outline?: boolean;
}) {
  const fill = outline ? "none" : mono ? "currentColor" : `var(--role-${role})`;
  return (
    <svg
      class="role-shape"
      width={size}
      height={size}
      viewBox="0 0 28 28"
      aria-hidden="true"
      focusable="false"
      fill={fill}
      stroke={outline ? `var(--role-${role})` : undefined}
      stroke-width={outline ? 2.5 : undefined}
      stroke-linejoin={outline ? "round" : undefined}
    >
      {role === "blind" && <circle cx="14" cy="14" r="11" />}
      {role === "deaf" && <rect x="3" y="3" width="22" height="22" />}
      {role === "mute" && <polygon points="14,2 26,25 2,25" />}
    </svg>
  );
}

export { ROLE_GLYPH } from "../client/hud.ts";
