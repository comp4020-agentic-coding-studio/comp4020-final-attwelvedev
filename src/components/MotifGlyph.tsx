import type { Motif } from "../game/rooms/format.ts";

// A motif as a flat shape in the text colour on a 24 grid: the HUD's counterpart of the canvas's
// `motifGlyph` (src/client/render/stations.ts), the same six silhouettes. Shape is the whole
// message, so it is never told apart by colour. Decorative: the riddle beside it names the motif.
const STAR = Array.from({ length: 12 }, (_, i) => {
  const a = -Math.PI / 2 + (i * Math.PI) / 6;
  const r = i % 2 === 0 ? 10 : 5.5;
  return `${(12 + Math.cos(a) * r).toFixed(1)} ${(12 + Math.sin(a) * r).toFixed(1)}`;
});

export const MOTIF_PATHS: Record<Motif, { d: string; evenodd?: true }> = {
  moon: { d: "M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" },
  star: { d: `M${STAR.join("L")}Z` },
  wave: { d: "M2 18C7 2 12 22 14 10C17 2 22 12 22 18Z" },
  key: { d: "M2.5 12a5 5 0 1 0 10 0a5 5 0 1 0-10 0ZM11.5 10.5h10.5v3H11.5ZM18 13h2.5v4H18Z" },
  eye: {
    d: "M2 12Q12-2 22 12Q12 26 2 12ZM9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0Z",
    evenodd: true,
  },
  leaf: { d: "M12 2Q22 9.6 12 22Q2 9.6 12 2Z" },
};

export function MotifGlyph({ motif, size = 24 }: { motif: Motif; size?: number }) {
  const { d, evenodd } = MOTIF_PATHS[motif];
  return (
    <svg
      class="motif-glyph"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} fill-rule={evenodd ? "evenodd" : undefined} />
    </svg>
  );
}
