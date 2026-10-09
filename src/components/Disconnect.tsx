// Over the paused game when a person's connection drops: who the game waits for
// and for how long, then (once the time is up) the host's choice. A bot takes the
// seat and play goes on, or everyone goes back to the lobby.
export const countdown = (seconds: number): string => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function Disconnect({
  waitingFor,
  secondsLeft,
  choosing,
  host,
  onChoice,
}: {
  waitingFor: string;
  secondsLeft: number;
  choosing: boolean;
  host: boolean;
  onChoice: (choice: "bot" | "lobby") => void;
}) {
  return (
    <div class="overlay" role="alertdialog" aria-labelledby="pause-title">
      <h2 id="pause-title">
        Waiting for {waitingFor}
        {!choosing && (
          <>
            {" "}
            <span class="countdown" role="timer">
              {countdown(secondsLeft)}
            </span>
          </>
        )}
      </h2>
      <p>Their connection dropped.</p>
      {choosing &&
        (host ? (
          <div class="overlay-actions">
            <button type="button" class="btn primary" onClick={() => onChoice("bot")}>
              Let a bot take over
            </button>
            <button type="button" class="btn" onClick={() => onChoice("lobby")}>
              Back to lobby
            </button>
          </div>
        ) : (
          <p class="muted">Waiting for the host to choose</p>
        ))}
    </div>
  );
}
