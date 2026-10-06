import type { HistoryEntry } from "./items.ts";
import { communityChannel, householdChannel, type Routed } from "./live.ts";
import type { OfferChange } from "./offers.ts";

// The only place an `offer.*` payload is built, so who may hear what is
// decided here and tested here (spec §2.2, NFR-Privacy):
//   - the pickup note travels only in offer.claim, to the claimer
//   - the claimer's name appears only in the offerer's offer.mine
//   - community channels get the offer's name and the display name it is
//     shown under, never a household or member id
//   - what an item is (amount, dates) travels with an offer, never who set it
// Order for one change: for Offer some the household's item.updated (the
// remainder) and item.added (the portion), so the portion's row exists before
// offer.mine names it; then offer.mine, offer.claim, the community events in
// announce order; and last item.merged when a withdrawn portion folded back. A
// feed relies on offer.mine arriving first so a household's own offer is never
// shown as someone else's. A value change sends no offer.mine: the household's
// item events already carry it.
export function offerEvents(change: OfferChange): Routed[] {
  const { offer } = change;
  const household = householdChannel(change.offererHouseholdId);
  const routed: Routed[] = [];
  if (change.split) {
    const { remainder, portion, by } = change.split;
    routed.push(
      { channel: household, event: { type: "item.updated", item: remainder, by } },
      { channel: household, event: { type: "item.added", item: portion, by } },
    );
  }
  if (change.kind !== "valued") {
    routed.push({ channel: household, event: { type: "offer.mine", offer } });
  }
  if (change.claim) {
    routed.push({
      channel: householdChannel(change.claim.householdId),
      event: { type: "offer.claim", offer: change.claim.offer },
    });
  }
  for (const community of change.communities) {
    const communityId = community.id;
    const channel = communityChannel(communityId);
    if (change.kind === "posted") {
      routed.push({
        channel,
        event: {
          type: "offer.posted",
          communityId,
          offer: {
            id: offer.id,
            itemName: offer.itemName,
            fromName: community.fromName,
            communityIds: [communityId],
            createdAt: offer.createdAt,
            value: change.value,
          },
        },
      });
    } else if (change.kind === "valued") {
      routed.push({
        channel,
        event: {
          type: "offer.updated",
          communityId,
          offer: {
            id: offer.id,
            itemName: offer.itemName,
            fromName: community.fromName,
            communityIds: [communityId],
            createdAt: offer.createdAt,
            value: change.value,
          },
        },
      });
    } else if (change.kind === "taken") {
      routed.push({ channel, event: { type: "offer.taken", communityId, offerId: offer.id } });
    } else if (change.kind === "closed") {
      routed.push({ channel, event: { type: "offer.closed", communityId, offerId: offer.id } });
    }
  }
  if (change.merge) {
    routed.push({
      channel: household,
      event: { type: "item.merged", itemId: change.merge.portionId, item: change.merge.remainder },
    });
  }
  return routed;
}

// A collected offer also leaves the offerer's pantry. When the claimer
// collected, no neighbour's member name may reach the offerer's household.
export function collectedEvents(entry: HistoryEntry, byOfferer: boolean): Routed[] {
  return [
    {
      channel: householdChannel(entry.householdId),
      event: {
        type: "item.removed",
        itemId: entry.itemId,
        itemName: entry.itemName,
        outcome: "given",
        historyId: entry.id,
        by: byOfferer
          ? { id: entry.memberId ?? "", name: entry.memberName ?? "" }
          : { id: "", name: "a neighbour" },
      },
    },
  ];
}
