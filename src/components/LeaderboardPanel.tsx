import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { formatTime } from "../client/hud.ts";

interface Row {
  rank: number;
  teamName: string;
  names: { nickname: string; bot: boolean }[];
  ms: number;
  loot: number;
  lootTotal: number;
}
interface Tab {
  id: string;
  label: string;
  rows: Row[];
}

// The leaderboard inside the game: the same tabs and rows as `/leaderboard`, from
// `/leaderboard.json`, in a modal over the game so nobody leaves their seat to look. Close or
// Escape returns to the game; focus goes back where it was.
export function LeaderboardPanel({
  initial = "heist",
  onClose,
}: {
  initial?: string; // the tab to open on: "heist" or "room-N"
  onClose: () => void;
}) {
  const [tabs, setTabs] = useState<Tab[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(initial);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    fetch("/leaderboard.json")
      .then((res) => (res.ok ? (res.json() as Promise<{ tabs: Tab[] }>) : Promise.reject()))
      .then((data) => live && setTabs(data.tabs))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  // Escape closes it wherever focus is, before the game's own keys see it. A layout effect, so it
  // holds from the frame the panel first shows, not one paint later.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      closeRef.current();
    };
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      before?.focus?.();
    };
  }, []);

  const tab = tabs?.find((t) => t.id === active) ?? tabs?.[0];
  return (
    <div class="scrim">
      <div
        class="modal board-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="board-panel-title"
      >
        <div class="board-panel-head">
          <h2 id="board-panel-title" class="modal-title">
            Leaderboard
          </h2>
          <button ref={close} type="button" class="btn" onClick={onClose}>
            Close
          </button>
        </div>
        {failed && <p role="alert">The board didn't load. Try again in a moment.</p>}
        {!tabs && !failed && <p role="status">Loading…</p>}
        {tabs && tab && (
          <>
            <div class="board-tabs" role="tablist" aria-label="Board">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`board-tab-${t.id}`}
                  aria-selected={t.id === tab.id}
                  aria-controls="board-tab-panel"
                  tabIndex={t.id === tab.id ? 0 : -1}
                  onClick={() => setActive(t.id)}
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                    const at = tabs.indexOf(t) + (e.key === "ArrowRight" ? 1 : -1);
                    const next = tabs[(at + tabs.length) % tabs.length];
                    if (!next) return;
                    setActive(next.id);
                    document.getElementById(`board-tab-${next.id}`)?.focus();
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div
              id="board-tab-panel"
              role="tabpanel"
              aria-labelledby={`board-tab-${tab.id}`}
              class="board-tab-panel"
            >
              {tab.rows.length === 0 ? (
                <p>No runs yet. Be first.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Rank</th>
                      <th scope="col">Team</th>
                      <th scope="col">Crew</th>
                      <th scope="col">Time</th>
                      <th scope="col">Loot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tab.rows.map((r) => (
                      <tr key={r.rank}>
                        <td>{r.rank}</td>
                        <td>{r.teamName}</td>
                        <td>
                          {r.names
                            .map((n) => (n.bot ? `${n.nickname} (bot)` : n.nickname))
                            .join(", ")}
                        </td>
                        <td>{formatTime(r.ms)}</td>
                        <td>{r.lootTotal > 0 ? `${r.loot}/${r.lootTotal}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
