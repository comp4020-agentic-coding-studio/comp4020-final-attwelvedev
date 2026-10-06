import { describe, expect, it } from "vitest";
import type { Community, CommunityJoin, CommunityLeave } from "./communities.ts";
import { joinedEvents, leftEvents } from "./communityEvents.ts";

const community: Community = {
  id: "c1",
  name: "Elm Street",
  joinCode: "KETTLE-42",
  creatorHouseholdId: "h1",
  createdAt: 1,
};
const join: CommunityJoin = {
  community,
  joined: true,
  household: { id: "h2", displayName: "Unit 4 · 2" },
};
const leave: CommunityLeave = {
  community: { id: "c1", name: "Elm Street" },
  householdId: "h2",
  communityDeleted: false,
  creatorHouseholdId: "h1",
};

describe("joinedEvents", () => {
  it("is membership.joined on the household channel, then community.householdJoined on the community's", () => {
    expect(joinedEvents(join)).toEqual([
      {
        channel: "household:h2",
        event: { type: "membership.joined", community: { id: "c1", name: "Elm Street" } },
      },
      {
        channel: "community:c1",
        event: {
          type: "community.householdJoined",
          communityId: "c1",
          household: { id: "h2", displayName: "Unit 4 · 2" },
        },
      },
    ]);
  });

  it("is nothing when the household was already a member", () => {
    expect(joinedEvents({ ...join, joined: false })).toEqual([]);
  });
});

describe("leftEvents", () => {
  it("is the mirror pair, carrying the creator household", () => {
    expect(leftEvents(leave)).toEqual([
      { channel: "household:h2", event: { type: "membership.left", communityId: "c1" } },
      {
        channel: "community:c1",
        event: {
          type: "community.householdLeft",
          communityId: "c1",
          householdId: "h2",
          creatorHouseholdId: "h1",
        },
      },
    ]);
  });

  it("carries no member name", () => {
    const text = JSON.stringify([...joinedEvents(join), ...leftEvents(leave)]);
    expect(text).not.toMatch(/memberName|member"/);
  });
});
