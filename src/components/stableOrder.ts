import type { Row } from "./pantryState.ts";
import { BUCKET_ORDER, type BucketGroup, bucketOf, groupRows } from "./pantryView.ts";

export interface Held {
  count: number;
}

// While `busy` (focus or a pointer is in the list), rows keep the group and
// position they had so nothing slides away from under a finger; a row that
// arrived since waits, and one that would change bucket still shows its new
// contents in its old place. Not busy: a full regroup.
// My own adds are never held: a pending row, or a real row whose id is in
// `ownRids` (the island adds a confirmed add's item id there beside its rid).
export function stableGroups(
  previous: BucketGroup[],
  rows: Row[],
  today: string,
  busy: boolean,
  ownRids: ReadonlySet<string>,
): { groups: BucketGroup[]; held: Held } {
  if (!busy) return { groups: groupRows(rows, today), held: { count: 0 } };

  const byId = new Map(rows.map((r) => [r.item.id, r]));
  const seen = new Set<string>();
  const kept: BucketGroup[] = [];
  for (const group of previous) {
    const members = group.rows.flatMap((r) => {
      const current = byId.get(r.item.id);
      if (!current) return [];
      seen.add(r.item.id);
      return [current];
    });
    if (members.length) kept.push({ bucket: group.bucket, rows: members });
  }

  let held = 0;
  const own: Row[] = [];
  for (const row of rows) {
    if (seen.has(row.item.id)) continue;
    if (row.pending || ownRids.has(row.item.id)) own.push(row);
    else held += 1;
  }
  // an own row leads its (fresh) bucket, in bucket order if that group is new
  for (const row of own) {
    const bucket = bucketOf(row.item, today);
    const group = kept.find((g) => g.bucket === bucket);
    if (group) group.rows = [row, ...group.rows];
    else {
      kept.push({ bucket, rows: [row] });
      kept.sort((a, b) => BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket));
    }
  }
  return { groups: kept, held: { count: held } };
}
