import { useState } from "preact/hooks";
import type { LiveEvent } from "../lib/live.ts";
import { getJson } from "./api.ts";
import { useLiveStream } from "./useLiveStream.ts";

interface Household {
  householdId: string;
  displayName: string;
}
export interface CommunityView {
  households: Household[];
  creatorHouseholdId: string;
}

// A community page's household list, live: a household joining, leaving or
// being removed shows up without a reload, and the Remove buttons follow the
// creator role when it passes on. Each Remove is still a real form.
export function CommunityHouseholds({
  communityId,
  initial,
  myHouseholdId,
}: {
  communityId: string;
  initial: CommunityView;
  myHouseholdId: string;
}) {
  const [view, setView] = useState(initial);

  const { connected } = useLiveStream({
    onEvent(e: LiveEvent) {
      if (e.type === "community.householdJoined" && e.communityId === communityId) {
        setView((v) =>
          v.households.some((h) => h.householdId === e.household.id)
            ? v
            : {
                ...v,
                households: [
                  ...v.households,
                  { householdId: e.household.id, displayName: e.household.displayName },
                ],
              },
        );
      } else if (e.type === "community.householdLeft" && e.communityId === communityId) {
        setView((v) => ({
          households: v.households.filter((h) => h.householdId !== e.householdId),
          creatorHouseholdId: e.creatorHouseholdId ?? v.creatorHouseholdId,
        }));
      } else if (e.type === "membership.left" && e.communityId === communityId) {
        // this household was removed, or left from another device
        window.location.assign("/communities");
      }
    },
    onOpen() {
      getJson<CommunityView>(`/communities/${communityId}`)
        .then((fresh) => fresh && setView(fresh))
        .catch(() => {});
    },
    onUnauthorised: () => window.location.assign("/"),
  });

  const isCreator = view.creatorHouseholdId === myHouseholdId;

  return (
    <ul id="community-households" class="rows" data-stream={connected ? "open" : "connecting"}>
      {view.households.map((h) => (
        <li key={h.householdId}>
          <span class="who">
            {h.displayName}
            {h.householdId === myHouseholdId && <span class="muted"> (you)</span>}
            {h.householdId === view.creatorHouseholdId && <span class="muted"> · creator</span>}
          </span>
          {isCreator && h.householdId !== myHouseholdId && (
            <form
              method="post"
              action={`/communities/${communityId}/households/${h.householdId}/remove`}
            >
              <button type="submit">
                Remove<span class="sr-only"> {h.displayName}</span>
              </button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
