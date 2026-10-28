import { formatTime } from "../client/hud.ts";
import type { RoomBoard as Board, CommsEdge, CrewMember } from "../net/protocol.ts";
import { CommsMap } from "./CommsMap.tsx";
import { ConfirmButton } from "./ConfirmButton.tsx";
import { RoomBoard } from "./RoomBoard.tsx";

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
  comms,
  crew,
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
  comms?: CommsEdge[]; // the comms map's counts, once the `cleared` message brings them
  crew: readonly CrewMember[]; // who sat where this room, to name the map's corners
}) {
  return (
    <div class="overlay" role="status">
      <h2>{last ? "Last room cleared" : "Room cleared"}</h2>
      <p>Time {formatTime(ms)}</p>
      {lootTotal > 0 && (
        <p>
          Loot {loot} of {lootTotal}
        </p>
      )}
      {last && <p class="muted">That was the last room.</p>}
      {comms && <CommsMap edges={comms} crew={crew} />}
      {/* Task 28: the credit lines (`credits` on `cleared`, one per seat) go here, under the map */}
      <div class="overlay-actions">
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
  );
}
