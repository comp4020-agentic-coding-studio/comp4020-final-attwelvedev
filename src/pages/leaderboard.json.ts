import type { APIRoute } from "astro";
import { loadRooms } from "../game/rooms/load.ts";
import { db } from "../lib/db.ts";
import { json } from "../lib/http.ts";
import { boardTabs } from "../lib/runs.ts";

// The `/leaderboard` page's boards, for the in-game panel. Public on purpose (FR32): team names,
// nicknames, times and loot, never a run id or a device hash.
export const GET: APIRoute = () => {
  const tabs = boardTabs(db, loadRooms()).map((t) => ({
    id: t.id,
    label: t.label,
    rows: t.rows.map((r) => ({
      rank: r.rank,
      teamName: r.teamName,
      names: r.names,
      ms: r.ms,
      loot: r.loot,
      lootTotal: r.lootTotal,
    })),
  }));
  const res = json({ tabs });
  res.headers.set("Cache-Control", "no-store");
  return res;
};
