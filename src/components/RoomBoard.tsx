import { formatTime } from "../client/hud.ts";
import type { RoomBoard as Board } from "../net/protocol.ts";

// This room's top 5 on the cleared card, this team's run highlighted. A run outside the top 5 gets
// a sixth line with its rank; a room nobody else has cleared says so instead of a lonely table.
export function RoomBoard({ board, onFull }: { board: Board; onFull: () => void }) {
  const first = board.top.length === 0 || (board.top.length === 1 && board.top[0]?.mine);
  return (
    <section class="room-board" aria-labelledby="room-board-title">
      <h3 id="room-board-title">{first ? "First clear of this room" : "This room's best"}</h3>
      {board.top.length > 0 && (
        <table>
          <thead>
            <tr>
              <th scope="col">
                <span class="sr-only">Rank</span>
              </th>
              <th scope="col">Team</th>
              <th scope="col">Time</th>
              <th scope="col">Loot</th>
            </tr>
          </thead>
          <tbody>
            {board.top.map((r) => (
              <tr
                key={r.rank}
                class={r.mine ? "mine" : undefined}
                aria-current={r.mine ? "true" : undefined}
              >
                <td>{r.rank}</td>
                <td class="team">{r.teamName}</td>
                <td>{formatTime(r.ms)}</td>
                <td>{r.lootTotal > 0 ? `${r.loot}/${r.lootTotal}` : "—"}</td>
              </tr>
            ))}
            {board.mine && (
              <tr class="mine" aria-current="true">
                <td>{board.mine.rank}</td>
                <td class="team">You</td>
                <td>{formatTime(board.mine.ms)}</td>
                <td>
                  {board.mine.lootTotal > 0 ? `${board.mine.loot}/${board.mine.lootTotal}` : "—"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      <button type="button" class="btn" onClick={onFull}>
        Full leaderboard
      </button>
    </section>
  );
}
