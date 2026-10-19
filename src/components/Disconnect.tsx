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
  sitting,
  gone = false,
  forReady = false,
  onChoice,
}: {
  waitingFor: string;
  secondsLeft: number;
  choosing: boolean;
  host: boolean;
  sitting: { index: number; nickname: string }[]; // people sitting out, who the host may pull in
  gone?: boolean; // they pressed Leave, so there is no connection to wait for
  forReady?: boolean; // someone was pulled in and the game waits for their Ready
  onChoice: (choice: "bot" | "lobby" | "pull", person?: number) => void;
}) {
  return (
    <div class="overlay" role="alertdialog" aria-labelledby="pause-title">
      <h2 id="pause-title">
        Waiting for {waitingFor}
        {!choosing && !forReady && (
          <>
            {" "}
            <span class="countdown" role="timer">
              {countdown(secondsLeft)}
            </span>
          </>
        )}
      </h2>
      {forReady ? (
        <p>Waiting for {waitingFor} to be ready.</p>
      ) : gone ? (
        <p>{waitingFor} left.</p>
      ) : (
        <p>Their connection dropped.</p>
      )}
      {choosing &&
        (host ? (
          <div class="overlay-actions">
            {sitting.map((p) => (
              <button
                key={p.index}
                type="button"
                class="btn primary"
                onClick={() => onChoice("pull", p.index)}
              >
                Pull in {p.nickname}
              </button>
            ))}
            <button
              type="button"
              class={sitting.length === 0 ? "btn primary" : "btn"}
              onClick={() => onChoice("bot")}
            >
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
