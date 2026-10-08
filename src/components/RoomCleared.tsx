import { formatTime } from "../client/hud.ts";
import { ConfirmButton } from "./ConfirmButton.tsx";

// Shown over the map when the team is on the exit. Only the host has anything to
// press: on to the next room, or play this one again. There is deliberately no
// Leave here: it is the only other button, and people press whatever is in front
// of them. Leaving is under Settings, and asks first.
export function RoomCleared({
  ms,
  loot,
  lootTotal,
  last,
  host,
  onNext,
  onRestart,
}: {
  ms: number;
  loot: number;
  lootTotal: number;
  last: boolean;
  host: boolean;
  onNext: () => void;
  onRestart: () => void;
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
      {host ? (
        <div class="overlay-actions">
          {!last && (
            <button type="button" class="btn primary" onClick={onNext}>
              Next room
            </button>
          )}
          <ConfirmButton
            class="btn"
            label="Restart room"
            confirmLabel="Sure? Restart room"
            onConfirm={onRestart}
          />
        </div>
      ) : (
        <p class="muted">Waiting for the host…</p>
      )}
    </div>
  );
}
