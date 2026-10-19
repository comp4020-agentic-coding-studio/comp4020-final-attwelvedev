import type { Dir8 } from "../client/hud.ts";

const ANGLE: Record<Dir8, number> = {
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SW: 225,
  W: 270,
  NW: 315,
};
const WORDS: Record<Dir8, string> = {
  N: "above",
  NE: "the upper right",
  E: "the right",
  SE: "the lower right",
  S: "below",
  SW: "the lower left",
  W: "the left",
  NW: "the upper left",
};

// An arrow drawn (the font is ASCII only) that points the way a sound came from,
// screen up being north. Never colour alone: the shape carries the direction.
export function DirArrow({ dir, size = 18 }: { dir: Dir8; size?: number }) {
  return (
    <svg
      class="dir-arrow"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={`from ${WORDS[dir]}`}
      fill="currentColor"
    >
      <g transform={`rotate(${ANGLE[dir]} 12 12)`}>
        <polygon points="12,2 20,14 14,14 14,22 10,22 10,14 4,14" />
      </g>
    </svg>
  );
}
