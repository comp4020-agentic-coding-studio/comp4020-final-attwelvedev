import { BUCKET_LABEL, type BucketGroup } from "./pantryView.ts";

// A long pantry gets a way to the heading you want without scrolling.
export function JumpToBucket({ groups }: { groups: BucketGroup[] }) {
  return (
    <label class="jump">
      Jump to{" "}
      <select
        value=""
        onChange={(event) => {
          const target = document.getElementById(`bucket-${event.currentTarget.value}`);
          event.currentTarget.value = "";
          target?.scrollIntoView({
            block: "start",
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "auto"
              : "smooth",
          });
        }}
      >
        <option value="">a group…</option>
        {groups.map((g) => (
          <option key={g.bucket} value={g.bucket}>
            {BUCKET_LABEL[g.bucket]} ({g.rows.length})
          </option>
        ))}
      </select>
    </label>
  );
}
