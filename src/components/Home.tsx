import { useEffect, useRef, useState } from "preact/hooks";
import { readNickname, saveNickname } from "../client/nickname.ts";
import type { LobbySummary } from "../net/protocol.ts";
import { Connection } from "./Connection.tsx";
import { useSocket } from "./useSocket.ts";

interface Errors {
  nickname?: string;
  create?: string;
  join?: string;
}

// Create a lobby, join one by code, or pick one from the live open list. The
// server decides everything; this page only asks and shows what comes back.
export function Home() {
  const { socket, state, rttMs, online } = useSocket();
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");
  const [list, setList] = useState<LobbySummary[] | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const going = useRef(false); // a create or join of ours is in flight
  const target = useRef(""); // the code we asked to join, to follow if the lobby turns out to be full
  const nicknameField = useRef<HTMLInputElement>(null);

  useEffect(() => setNickname(readNickname()), []);

  useEffect(() => {
    if (!socket) return;
    const offs = [
      socket.on("lobbies", (m) => setList(m.list)),
      socket.on("lobby", (m) => {
        // only a lobby we asked for: broadcasts about one we're still seated in must not move us
        if (going.current) location.assign(`/lobby/${m.lobby.code}`);
      }),
      socket.on("error", (m) => {
        going.current = false;
        // a full lobby is not an error here: its page offers Watch or Start a new team
        if (m.code === "lobby-full" && target.current) location.assign(`/lobby/${target.current}`);
        else if (m.code === "server-full") setErrors({ create: m.message });
        else if (m.code === "bad-nickname") setErrors({ nickname: m.message });
        else setErrors({ join: m.message });
      }),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, [socket]);

  useEffect(() => {
    if (socket && online) socket.send({ t: "lobbies.watch" });
  }, [socket, online]);

  // returns the nickname to use, or null after showing why not
  function ready(slot: "create" | "join"): string | null {
    const name = nickname.trim();
    if (!name) {
      setErrors({ nickname: "Pick a nickname first." });
      nicknameField.current?.focus();
      return null;
    }
    if (!socket || !online) {
      setErrors({ [slot]: "Not connected yet. Try again in a moment." });
      return null;
    }
    saveNickname(name);
    setErrors({});
    going.current = true;
    return name;
  }

  function create(event: Event) {
    event.preventDefault();
    const name = ready("create");
    if (name) socket?.send({ t: "lobby.create", nickname: name });
  }

  function join(wanted: string) {
    const name = ready("join");
    if (!name) return;
    target.current = wanted.trim().toUpperCase();
    socket?.send({ t: "lobby.join", code: target.current, nickname: name, as: "player" });
  }

  return (
    <div class="home">
      <div class="home-start">
        <h1>Hold three stations at once. Each of you is missing a sense.</h1>
        <form class="stack" onSubmit={create}>
          <div class="field">
            <label for="nickname">Nickname</label>
            <input
              id="nickname"
              ref={nicknameField}
              value={nickname}
              maxLength={16}
              autoComplete="off"
              aria-describedby={errors.nickname ? "nickname-error" : undefined}
              onInput={(e) => setNickname(e.currentTarget.value)}
            />
            {errors.nickname && (
              <p id="nickname-error" class="error" role="alert">
                {errors.nickname}
              </p>
            )}
          </div>
          <button type="submit" class="btn primary">
            Create lobby
          </button>
          {errors.create && (
            <p class="error" role="alert">
              {errors.create}
            </p>
          )}
        </form>

        <form
          class="stack join"
          onSubmit={(e) => {
            e.preventDefault();
            join(code);
          }}
        >
          <h2>Join with a code</h2>
          <div class="join-row">
            <div class="field">
              <label for="code">Lobby code</label>
              <input
                id="code"
                class="code-input"
                value={code}
                maxLength={4}
                autoCapitalize="characters"
                autoComplete="off"
                spellcheck={false}
                aria-describedby={errors.join ? "join-error" : undefined}
                onInput={(e) => setCode(e.currentTarget.value.toUpperCase())}
              />
            </div>
            <button type="submit" class="btn">
              Join
            </button>
          </div>
          {errors.join && (
            <p id="join-error" class="error" role="alert">
              {errors.join}
            </p>
          )}
        </form>
      </div>

      <section class="home-open" aria-labelledby="open-title">
        <div class="section-head">
          <h2 id="open-title">Open lobbies</h2>
          <Connection state={state} rttMs={rttMs} />
        </div>
        {list === null ? (
          <p class="muted">Loading open lobbies…</p>
        ) : list.length === 0 ? (
          <p class="muted">No open lobbies. Create one and share its code.</p>
        ) : (
          <ul class="open-list">
            {list.map((lobby) => (
              <li key={lobby.code}>
                <span class="team">{lobby.teamName}</span>
                <span class="filled">{lobby.filled}/3</span>
                <button
                  type="button"
                  class="btn"
                  aria-label={`Join ${lobby.teamName}`}
                  onClick={() => join(lobby.code)}
                >
                  Join
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
