import type { ComponentChildren } from "preact";
import { ROLE_LABEL, type Role } from "../game/types.ts";
import { ROLE_GLYPH } from "./RoleShape.tsx";

export const HOTBAR = 6; // keys 1–6 send six items of a 12-item grid; 0 moves to the other six

// The key that sends item `i` right now, if any: only the page the keys are on.
export const hotbarHint = (i: number, page: number): string | undefined =>
  Math.floor(i / HOTBAR) === page ? String((i % HOTBAR) + 1) : undefined;

export interface Cell {
  key: string;
  name: string; // spoken name of the button
  content: ComponentChildren;
  hint?: string; // the key that picks it, shown on desktop
}

// A grid of big buttons: the callouts (3×3), stamps (3×3), faces (4×3) and
// clips (2×4) are all one of these.
export function SheetGrid({
  cells,
  cols,
  label,
  wait,
  onPick,
  noMenu = false,
  class: extra = "",
}: {
  cells: Cell[];
  cols: number;
  label: string;
  wait: number; // seconds left on this family's cooldown; 0 when ready
  onPick: (index: number) => void;
  noMenu?: boolean; // no right-click or long-press menu: the cells are pictures
  class?: string;
}) {
  return (
    <fieldset class={`cells ${extra}`} style={{ "--cols": cols }}>
      <legend class="sr-only">{label}</legend>
      {cells.map((cell, i) => (
        <button
          key={cell.key}
          type="button"
          class={wait > 0 ? "cell cooling" : "cell"}
          aria-disabled={wait > 0 ? "true" : undefined}
          aria-label={cell.name}
          onClick={() => onPick(i)}
          onContextMenu={noMenu ? (e) => e.preventDefault() : undefined}
        >
          {cell.hint && <kbd>{cell.hint}</kbd>}
          {cell.content}
        </button>
      ))}
    </fieldset>
  );
}

// The frame every sheet shares: which family, who gets it, and one line on what
// it means for you.
export function Sheet({
  family,
  label,
  receivers,
  youReceive,
  wait,
  children,
}: {
  family: string;
  label: string;
  receivers: Role[];
  youReceive: boolean;
  wait: number;
  children: ComponentChildren;
}) {
  return (
    <section class="sheet" id="sheet" aria-label={`${label} sheet`} data-family={family}>
      <header class="sheet-head">
        <h2>{label}</h2>
        <span class="sheet-to">
          <span class="sr-only">goes to {receivers.map((r) => ROLE_LABEL[r]).join(" and ")}</span>
          <span aria-hidden="true">
            →{" "}
            {receivers.map((r) => (
              <span key={r} class="glyph">
                {ROLE_GLYPH[r]}
              </span>
            ))}
          </span>
        </span>
        <span class="sheet-note">
          {youReceive
            ? `You ${family === "show" ? "see" : "hear"} replies here`
            : "You send only; replies don't come to you"}
        </span>
        {wait > 0 && (
          <span class="sheet-wait" role="status">
            Wait {wait} s
          </span>
        )}
      </header>
      {children}
    </section>
  );
}
