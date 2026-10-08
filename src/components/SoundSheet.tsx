import { CLIPS } from "../game/channels.ts";
import { type Cell, hotbarHint, SheetGrid } from "./SheetGrid.tsx";

export function SoundSheet({
  wait,
  page,
  onClip,
}: {
  wait: number;
  page: number;
  onClip: (id: string) => void;
}) {
  const cells: Cell[] = CLIPS.map((c, i) => ({
    key: c.id,
    name: c.label,
    content: <span class="cell-label">{c.label}</span>,
    hint: hotbarHint(i, page),
  }));
  return (
    <>
      <p class="sheet-note key-only">
        Keys 1–6 play the numbered clips. 0 switches to the other six.
      </p>
      <SheetGrid
        cells={cells}
        cols={4}
        label="Soundboard"
        wait={wait}
        onPick={(i) => {
          const clip = CLIPS[i];
          if (clip) onClip(clip.id);
        }}
      />
    </>
  );
}
