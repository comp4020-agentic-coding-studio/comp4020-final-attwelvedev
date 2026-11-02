import { useState } from "preact/hooks";
import { ITEM_NAMES } from "../client/items.ts";
import type { RoleView } from "../game/perception.ts";
import type { Seat } from "../game/types.ts";
import { KeepsakePlate } from "./KeepsakePlate.tsx";
import { MotifGlyph } from "./MotifGlyph.tsx";

// Your private side job, a chip at the frame's top-left. Unsolved: the motif and the riddle (a tap
// shows the whole line on a phone). Solved: the keepsake on its plate, its name, a drawn tick and
// who found it; it pulses once as it lands (game.css) and has no more to say, so it does not expand.
export function SideJob({
  cache,
  names,
  me,
}: {
  cache: RoleView["cache"];
  names: readonly string[]; // by seat
  me: Seat;
}) {
  const [open, setOpen] = useState(false);
  if (!cache) return null;
  // the vault is open or the item taken: the old solved chip, until Task 56 (14-03) redesigns it
  if (cache.state === "vault" || cache.state === "taken") {
    const item = ITEM_NAMES[cache.item];
    const who =
      cache.by === undefined
        ? "a teammate"
        : cache.by === me
          ? "you"
          : (names[cache.by] ?? "a teammate");
    return (
      <div class="side-job is-found" role="img" aria-label={`Side job found: ${item}, with ${who}`}>
        <KeepsakePlate item={cache.item} size={32} />
        <span class="side-job-found">
          <span class="side-job-name">
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
            {item}
          </span>
          <span class="side-job-text">Found by {who}</span>
        </span>
      </div>
    );
  }
  return (
    <button type="button" class="side-job" aria-expanded={open} onClick={() => setOpen(!open)}>
      <MotifGlyph motif={cache.motif} size={24} />
      <span class="side-job-lines">
        <span class="side-job-label">Side job</span>
        <span class={open ? "side-job-text is-open" : "side-job-text"}>{cache.riddle}</span>
      </span>
    </button>
  );
}
