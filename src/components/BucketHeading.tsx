import type { Bucket } from "../lib/expiry.ts";
import { BUCKET_LABEL } from "./pantryView.ts";

// Sticky, so while scrolling a long pantry you always know which part of the
// shelf you are in.
export function BucketHeading({ bucket, count }: { bucket: Bucket; count: number }) {
  return (
    <h2 class="bucket-heading" id={`bucket-${bucket}`} data-bucket={bucket}>
      {BUCKET_LABEL[bucket]} <span class="count">({count})</span>
    </h2>
  );
}
