import { formatTime } from "../client/hud.ts";
import { ConfirmButton } from "./ConfirmButton.tsx";

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
}: {
  ms: number;
  loot: number;
  lootTotal: number;
  last: boolean;
  host: boolean;
  onNext: () => void;
  onRestart: () => void;
  onRestartHeist: () => void;
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
    </div>
  );
}
