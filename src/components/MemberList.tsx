import { useState } from "preact/hooks";
import type { LiveEvent } from "../lib/live.ts";
import type { Snapshot } from "../lib/snapshot.ts";
import { useLiveStream } from "./useLiveStream.ts";

interface Member {
  id: string;
  name: string;
}

// The household page's member list, live: someone joining or leaving shows up
// without a reload. Each Remove is still a real form, so it works with
// scripts off.
export function MemberList({ initial, meId }: { initial: Member[]; meId: string }) {
  const [members, setMembers] = useState(initial);

  const { connected } = useLiveStream({
    onEvent(e: LiveEvent) {
      if (e.type === "member.joined") {
        setMembers((all) => (all.some((m) => m.id === e.member.id) ? all : [...all, e.member]));
      } else if (e.type === "member.removed") {
        if (e.member.id === meId) window.location.assign("/");
        else setMembers((all) => all.filter((m) => m.id !== e.member.id));
      }
    },
    onOpen() {
      fetch("/api/pantry", { headers: { Accept: "application/json" } })
        .then((res) => {
          if (res.status === 401) window.location.assign("/");
          else return res.json() as Promise<Snapshot>;
        })
        .then((snapshot) => snapshot && setMembers(snapshot.members))
        .catch(() => {});
    },
    onUnauthorised: () => window.location.assign("/"),
  });

  return (
    <ul id="members" class="rows" data-stream={connected ? "open" : "connecting"}>
      {members.map((m) => (
        <li key={m.id}>
          <span class="who">
            {m.name}
            {m.id === meId && <span class="muted"> (you)</span>}
          </span>
          {m.id !== meId && (
            <form method="post" action={`/household/members/${m.id}/remove`}>
              <button type="submit">
                Remove<span class="sr-only"> {m.name}</span>
              </button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
