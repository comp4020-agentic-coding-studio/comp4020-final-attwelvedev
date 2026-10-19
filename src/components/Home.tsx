import { useEffect, useRef, useState } from "preact/hooks";
import { codeLetters } from "../client/lobbyCode.ts";
import { readNickname, saveNickname } from "../client/nickname.ts";
import { ROLE_LABEL } from "../game/types.ts";
import { LOBBY_CODE_LENGTH, type LobbySummary } from "../net/protocol.ts";
import { Connection } from "./Connection.tsx";
import { FEED_ROLES, Feeds } from "./Feeds.tsx";
import { RoleShape } from "./RoleShape.tsx";
import { useSocket } from "./useSocket.ts";

interface Errors {
  nickname?: string;
  create?: string;
  join?: string;
}

const LIST_ROWS = 4; // teams shown before "Show all"

// Join a team by code (the usual way in: a friend sent it), pick a team that is
// waiting, or start a new one. Open teams only show when there are some. The
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
  const codeField = useRef<HTMLInputElement>(null);
  const [showAll, setShowAll] = useState(false);

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
        if (m.code === "cooldown" || m.code === "cant-send" || m.code === "not-in-sight") return;
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
      <section class="home-hero" aria-labelledby="home-title">
        <h1 id="home-title">
          <span>A heist for three.</span>
          {FEED_ROLES.map((role) => (
            <span key={role}>
              {" "}
              <RoleShape role={role} size={30} /> One{" "}
              {ROLE_LABEL[role].toLowerCase().replace("'", "’")}.
            </span>
          ))}
        </h1>
        <Feeds />
      </section>

      <section class="home-desk" aria-label="Play">
        <div class="field desk-name">
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

        <form
          class="desk-join"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length < LOBBY_CODE_LENGTH) {
              setErrors({ join: `A code is ${LOBBY_CODE_LENGTH} letters.` });
              codeField.current?.focus();
              return;
            }
            join(code);
          }}
        >
          <div class="join-row">
            <div class="field">
              <label for="code">Lobby code</label>
              <input
                id="code"
                ref={codeField}
                class="code-input"
                value={code}
                maxLength={LOBBY_CODE_LENGTH}
                placeholder="ABCD"
                autoCapitalize="characters"
                autoComplete="off"
                spellcheck={false}
                aria-describedby={errors.join ? "join-error" : "code-hint"}
                onInput={(e) => {
                  // only letters a code can have: a paste of "ab-cd" becomes ABCD
                  const typed = codeLetters(e.currentTarget.value);
                  e.currentTarget.value = typed;
                  setCode(typed);
                  if (errors.join) setErrors({});
                }}
              />
            </div>
            <button
              type="submit"
              class="btn primary"
              aria-disabled={code.length < LOBBY_CODE_LENGTH}
            >
              Join
            </button>
          </div>
          <p id="code-hint" class="code-hint" hidden={!!errors.join}>
            {code.length < LOBBY_CODE_LENGTH
              ? `${LOBBY_CODE_LENGTH - code.length} more ${LOBBY_CODE_LENGTH - code.length === 1 ? "letter" : "letters"}`
              : "Ready to join"}
          </p>
          {errors.join && (
            <p id="join-error" class="error" role="alert">
              {errors.join}
            </p>
          )}
        </form>

        {list && list.length > 0 && (
          <section class="waiting" aria-labelledby="waiting-title">
            <h2 id="waiting-title">
              <span class="waiting-light" aria-hidden="true" />
              {list.length === 1 ? "A team is waiting" : `${list.length} teams are waiting`}
            </h2>
            <ul class="open-list" id="open-list">
              {(showAll ? list : list.slice(0, LIST_ROWS)).map((lobby) => (
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
            {list.length > LIST_ROWS && (
              <button
                type="button"
                class="btn list-more"
                aria-expanded={showAll}
                aria-controls="open-list"
                onClick={() => setShowAll((s) => !s)}
              >
                {showAll ? "Show fewer" : `Show all ${list.length} teams`}
              </button>
            )}
          </section>
        )}

        <form class="desk-new" onSubmit={create}>
          <p>No code? Start a team and send its code to two friends.</p>
          <button type="submit" class="btn">
            Start a new team
          </button>
          {errors.create && (
            <p class="error" role="alert">
              {errors.create}
            </p>
          )}
        </form>

        {/* nothing to say while connected; worth saying when Join would fail */}
        {state !== "live" && <Connection state={state} rttMs={rttMs} />}
      </section>
    </div>
  );
}
