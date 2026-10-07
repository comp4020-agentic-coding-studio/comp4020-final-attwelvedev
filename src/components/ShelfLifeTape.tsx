import type { Bucket } from "../lib/expiry.ts";

// The row's bottom-edge bar: its length is the share of shelf life left and its
// pattern says the bucket (tape.css), so colour is never the only signal. Purely
// decorative: the row's label and the heading say the same in words.
export function ShelfLifeTape({ bucket, fraction }: { bucket: Bucket; fraction: number }) {
  return (
    <span class="tape" aria-hidden="true" data-bucket={bucket}>
      <span class="tape-bar" style={{ "--frac": fraction }} />
    </span>
  );
}
