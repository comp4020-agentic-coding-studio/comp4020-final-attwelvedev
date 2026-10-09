import { formatTime } from "../client/hud.ts";

// Shown over the map once the third room is cleared: the heist is over. There
// is no Next here (there is no fourth room) and no Restart (restarting room 3
// alone would not redo the heist), just the result and the board it landed
// on. Leave is still under Settings, same as every other room.
export function HeistComplete({
  ms,
  loot,
  lootTotal,
  rank,
}: {
  ms: number;
  loot: number;
  lootTotal: number;
  rank: number;
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
      <div class="overlay-actions">
        <a class="btn primary" href="/leaderboard">
          See the leaderboard
        </a>
      </div>
    </div>
  );
}
