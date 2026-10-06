import type { CommunityJoin, CommunityLeave } from "./communities.ts";
import { communityChannel, householdChannel, type Routed } from "./live.ts";
import { offerEvents } from "./offerEvents.ts";

// What a household's own members hear, then what its neighbours hear. Payloads
// carry household display names only, never a member name.

export function joinedEvents(join: CommunityJoin): Routed[] {
  if (!join.joined) return [];
  const { community, household } = join;
  return [
    {
      channel: householdChannel(household.id),
      event: { type: "membership.joined", community: { id: community.id, name: community.name } },
    },
    {
      channel: communityChannel(community.id),
      event: {
        type: "community.householdJoined",
        communityId: community.id,
        household: { id: household.id, displayName: household.displayName },
      },
    },
  ];
}

// Offer events first, then the membership pair: a household's streams stop
// following the community only once they have heard what happened to its offers.
export function leftEvents(leave: CommunityLeave): Routed[] {
  return [
    ...leave.offerChanges.flatMap(offerEvents),
    {
      channel: householdChannel(leave.householdId),
      event: { type: "membership.left", communityId: leave.community.id },
    },
    {
      channel: communityChannel(leave.community.id),
      event: {
        type: "community.householdLeft",
        communityId: leave.community.id,
        householdId: leave.householdId,
        creatorHouseholdId: leave.creatorHouseholdId,
      },
    },
  ];
}
