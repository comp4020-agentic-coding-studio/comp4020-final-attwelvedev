// One braille cell: six positions in two columns (1 2 3 down the left, 4 5 6 down the right). A raised
// dot is a filled `--ui` disc; a flat position is a small hollow ring. They differ by shape, never by
// colour alone, so high contrast keeps them apart (DESIGN.md: BrailleCell).
const POSITIONS: readonly [number, number, number][] = [
  [1, 0, 0],
  [2, 0, 1],
  [3, 0, 2],
  [4, 1, 0],
  [5, 1, 1],
  [6, 1, 2],
];

export function BrailleCell({ dots, size }: { dots: number[]; size: number }) {
  const gap = size * 1.6; // centre to centre
  const w = gap + size;
  const h = gap * 2 + size;
  return (
    <svg
      class="braille-cell"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
      focusable="false"
    >
      {POSITIONS.map(([n, col, row]) => {
        const cx = size / 2 + col * gap;
        const cy = size / 2 + row * gap;
        return dots.includes(n) ? (
          <circle key={n} class="braille-dot" cx={cx} cy={cy} r={size / 2} />
        ) : (
          <circle key={n} class="braille-flat" cx={cx} cy={cy} r={2} />
        );
      })}
    </svg>
  );
}
