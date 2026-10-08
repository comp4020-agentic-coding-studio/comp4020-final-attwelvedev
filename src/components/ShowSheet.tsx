import { faceUrl } from "../client/faces.ts";
import { STAMP_FACE, STAMP_NAME } from "../client/hud.ts";
import { FACES, STAMPS, type Stamp } from "../game/channels.ts";
import { type Cell, hotbarHint, SheetGrid } from "./SheetGrid.tsx";

export type ShowTab = "faces" | "stamps";

// Every face stays on screen; only the key hints follow the hotbar's page.
const faceCells = (page: number): Cell[] =>
  FACES.map((f, i) => ({
    key: f.id,
    name: f.label,
    content: <img src={faceUrl(f.file)} alt="" width="56" height="56" draggable={false} />,
    hint: hotbarHint(i, page),
  }));
const STAMP_CELLS: Cell[] = STAMPS.map((s, i) => ({
  key: s,
  name: STAMP_NAME[s],
  content: <span class="cell-face">{STAMP_FACE[s]}</span>,
  hint: String(i + 1),
}));

export function ShowSheet({
  tab,
  onTab,
  page,
  faceWait,
  stampWait,
  onFace,
  onStamp,
}: {
  tab: ShowTab;
  onTab: (tab: ShowTab) => void;
  page: number;
  faceWait: number;
  stampWait: number;
  onFace: (id: string) => void;
  onStamp: (id: Stamp) => void;
}) {
  return (
    <>
      <fieldset class="tabs">
        <legend class="sr-only">Show</legend>
        {(["faces", "stamps"] as const).map((t) => (
          <button
            key={t}
            type="button"
            class="tab"
            aria-pressed={tab === t}
            onClick={() => onTab(t)}
          >
            <kbd>{t === "faces" ? "F" : "T"}</kbd> {t === "faces" ? "Faces" : "Stamps"}
          </button>
        ))}
      </fieldset>
      {tab === "faces" && (
        <p class="sheet-note key-only">
          Keys 1–6 send the numbered faces. 0 switches to the other six. F and T switch tab.
        </p>
      )}
      {tab === "faces" ? (
        <SheetGrid
          cells={faceCells(page)}
          cols={4}
          class="faces"
          noMenu
          label="Faces"
          wait={faceWait}
          onPick={(i) => {
            const f = FACES[i];
            if (f) onFace(f.id);
          }}
        />
      ) : (
        <SheetGrid
          cells={STAMP_CELLS}
          cols={3}
          label="Stamps"
          wait={stampWait}
          onPick={(i) => {
            const s = STAMPS[i];
            if (s) onStamp(s);
          }}
        />
      )}
    </>
  );
}
