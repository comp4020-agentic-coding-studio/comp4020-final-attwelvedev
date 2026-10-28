import { formatTime } from "../client/hud.ts";
import type { CommsEdge, CrewMember } from "../net/protocol.ts";
import { CommsMap } from "./CommsMap.tsx";

// Shown over the map once the third room is cleared: the heist is over. There
// is no Next here (there is no fourth room) and no Restart (restarting room 3
// alone would not redo the heist), just the result and the board it landed
// on, opened in the game as a panel. Leave is still under Settings, same as every other room.
export function HeistComplete({
  ms,
  loot,
  lootTotal,
  rank,
  onBoard,
  comms,
  crew,
}: {
  ms: number;
  loot: number;
  lootTotal: number;
  rank: number;
  onBoard: () => void; // open the leaderboard panel on the full-heist tab
  // the last room's comms map: this card takes the place of that room's cleared card. Only that
  // room's, since the crew and their seats change from room to room.
  comms?: CommsEdge[];
  crew: readonly CrewMember[];
}) {
  return (
    <div class="overlay" role="status">
      <h2>Heist complete</h2>
      <p>Time {formatTime(ms)}</p>
      {lootTotal > 0 && (
        <p>
          Loot {loot} of {lootTotal}
        </p>
      )}
      <p>
        Rank <strong>#{rank}</strong> on the board
      </p>
      {comms && <CommsMap edges={comms} crew={crew} title="Comms in the last room" />}
      <div class="overlay-actions">
        <button type="button" class="btn primary" onClick={onBoard}>
          See the leaderboard
        </button>
      </div>
    </div>
  );
}
