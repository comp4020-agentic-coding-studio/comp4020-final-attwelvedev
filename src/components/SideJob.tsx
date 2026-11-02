import { useState } from "preact/hooks";
import type { RoleView } from "../game/perception.ts";

// Your private side job: a chip with the riddle, ticked when its stash is found. On a phone the chip
// is short, and a tap shows the whole line. The keepsake look (the item, "Found by") is Task 56.
export function SideJob({ cache }: { cache: RoleView["cache"] }) {
  const [open, setOpen] = useState(false);
  if (!cache) return null;
  const done = cache.state === "found";
  return (
    <button
      type="button"
      class={done ? "side-job is-done" : "side-job"}
      aria-expanded={open}
      onClick={() => setOpen(!open)}
    >
      <span class="side-job-label">Side job{done ? ", done" : ""}</span>
      <span class={open ? "side-job-text is-open" : "side-job-text"}>{cache.riddle}</span>
    </button>
  );
}
