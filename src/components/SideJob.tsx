import { useState } from "preact/hooks";
import { ITEM_NAMES } from "../client/items.ts";
import type { RoleView } from "../game/perception.ts";
import { KeepsakePlate } from "./KeepsakePlate.tsx";
import { MotifGlyph } from "./MotifGlyph.tsx";

// Your private side job, a chip at the frame's top-left, through four states. Hidden or open: the
// motif and the whole riddle, shown from the start; a click hides it down to "Side job" and a
// small chevron says it can be shown again. In the vault: the item on its plate
// and "Waiting in the vault", no tick yet, because nothing counts until you take it. Taken: the
// item from your keepsake slot, a drawn tick and "Taken by you" (the owner is the only viewer); it
// pulses once as it lands (game.css). Neither later state has more to say, so neither expands.
export function SideJob({
  cache,
  keepsake,
}: {
  cache: RoleView["cache"];
  keepsake?: RoleView["keepsake"];
}) {
  const [open, setOpen] = useState(true);
  if (!cache) return null;
  if (cache.state === "vault" || cache.state === "taken") {
    const taken = cache.state === "taken";
    const item = keepsake && taken ? keepsake : cache.item;
    const name = ITEM_NAMES[item];
    return (
      <div
        class={taken ? "side-job is-found is-taken" : "side-job is-found is-vault"}
        role="img"
        aria-label={taken ? `Side job taken: ${name}` : `Side job in the vault: ${name}`}
      >
        <KeepsakePlate item={item} size={32} />
        <span class="side-job-found">
          <span class="side-job-name">
            {taken && (
              <svg
                class="side-job-tick"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  d="M2.5 8.5l4 4 7-9"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.4"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            )}
            {name}
          </span>
          <span class="side-job-text">{taken ? "Taken by you" : "Waiting in the vault"}</span>
        </span>
      </div>
    );
  }
  return (
    <button type="button" class="side-job" aria-expanded={open} onClick={() => setOpen(!open)}>
      <MotifGlyph motif={cache.motif} size={24} />
      <span class="side-job-lines">
        <span class="side-job-label">Side job</span>
        {open && <span class="side-job-text">{cache.riddle}</span>}
      </span>
      <svg
        class="side-job-chevron"
        data-open={open ? "true" : "false"}
        width="12"
        height="12"
        viewBox="0 0 12 12"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M2 4.5l4 4 4-4"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
  );
}
