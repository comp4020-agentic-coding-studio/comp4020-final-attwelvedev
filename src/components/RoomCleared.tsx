import type { CreditRow } from "../client/credits.ts";
import { formatTime } from "../client/hud.ts";
import type { RoomBoard as Board } from "../net/protocol.ts";
import { ConfirmButton } from "./ConfirmButton.tsx";
import { RoleShape } from "./RoleShape.tsx";
import { RoomBoard } from "./RoomBoard.tsx";
import { SideJobTile, type TileCache } from "./SideJobTile.tsx";

// Shown over the map when the team is on the exit. The host moves on to the next room; anyone
// may ask to play this one again, or the whole heist, which the others vote on. There is
// deliberately no Leave here: it is the only other button, and people press whatever is in front
// of them. Leaving is under Settings, and asks first.
export function RoomCleared({
  ms,
  loot,
  lootTotal,
  last,
  host,
  onNext,
  onRestart,
  onRestartHeist,
  board,
  onBoard,
  credits,
  cache,
  names,
}: {
  ms: number;
  loot: number;
  lootTotal: number;
  last: boolean;
  host: boolean;
  onNext: () => void;
  onRestart: () => void;
  onRestartHeist: () => void;
  board?: Board; // the room's board, once the `cleared` message brings it
  onBoard: () => void; // open the full leaderboard panel
  credits?: CreditRow[]; // who did what, names filled in by the page
  cache?: TileCache; // the room's side job, if it had one
  names?: string[]; // nicknames by seat, for the tile
}) {
  return (
    <div class="overlay" role="status">
      <div class="cleared">
        <header class="cleared-head">
          <h2>{last ? "Last room cleared" : "Room cleared"}</h2>
          <dl class="cleared-stats">
            <div>
              <dt>Time</dt>
              <dd>{formatTime(ms)}</dd>
            </div>
            {lootTotal > 0 && (
              <div>
                <dt>Loot</dt>
                <dd>
                  {loot} of {lootTotal}
                </dd>
              </div>
            )}
          </dl>
        </header>
        {credits && credits.length > 0 && (
          <ul class="credits" aria-label="Who did what">
            {credits.map((c) => (
              <li key={c.name}>
                <h3>
                  <RoleShape role={c.role} size={16} />
                  {c.name}
                </h3>
                <ul>
                  {c.lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
        {cache && <SideJobTile cache={cache} names={names ?? []} />}
        {last && <p class="muted">That was the last room.</p>}
        <div class="cleared-actions">
          {host && !last && (
            <button type="button" class="btn primary" onClick={onNext}>
              Next room
            </button>
          )}
          <ConfirmButton
            class="btn"
            label="Restart room"
            confirmLabel="Sure? Ask to restart room"
            onConfirm={onRestart}
          />
          <ConfirmButton
            class="btn"
            label="Restart heist"
            confirmLabel="Sure? Ask to restart heist"
            onConfirm={onRestartHeist}
          />
        </div>
        {!host && <p class="muted">The host picks the next room.</p>}
        {board && <RoomBoard board={board} onFull={onBoard} />}
      </div>
    </div>
  );
}
