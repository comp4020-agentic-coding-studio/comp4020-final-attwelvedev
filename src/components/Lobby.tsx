import { useEffect, useRef, useState } from "preact/hooks";
import { readNickname, saveNickname } from "../client/nickname.ts";
import { loadSetup, saveSetup } from "../client/preferences.ts";
import { qrSvg } from "../client/qr.ts";
import type { LobbyState, Setup } from "../net/protocol.ts";
import { Connection } from "./Connection.tsx";
import { Game, type Reveal } from "./Game.tsx";
import { Spectator } from "./Spectator.tsx";
import { useSocket } from "./useSocket.ts";

type Status = "joining" | "in" | "full" | "missing" | "failed";

// Seat shapes name the seat, not the role: roles rotate between rooms. Drawn
// rather than typed so all three are the same visual size in any font.
const SEAT_SHAPE = ["circle", "square", "triangle"] as const;

function SeatShape({ shape }: { shape: (typeof SEAT_SHAPE)[number] }) {
  return (
    <svg class="shape" viewBox="0 0 28 28" aria-hidden="true" focusable="false">
      {shape === "circle" && <circle cx="14" cy="14" r="11" />}
      {shape === "square" && <rect x="3" y="3" width="22" height="22" />}
      {shape === "triangle" && <polygon points="14,2 26,25 2,25" />}
    </svg>
  );
}

// Temporary until Task 10 replaces it with the designed panel: two radio pairs and three
// checkboxes, each answer sent as it is made.
function SetupForm({ setup, onChange }: { setup: Setup; onChange: (next: Setup) => void }) {
  const set = (patch: Partial<Setup>) => onChange({ ...setup, ...patch });
  return (
    <form class="setup stack" aria-labelledby="setup-title" onSubmit={(e) => e.preventDefault()}>
      <h2 id="setup-title">Your setup</h2>
      <fieldset>
        <legend>Where are you?</legend>
        <label>
          <input
            type="radio"
            name="where"
            checked={!setup.inRoom}
            onChange={() => set({ inRoom: false })}
          />
          Remote
        </label>
        <label>
          <input
            type="radio"
            name="where"
            checked={setup.inRoom}
            onChange={() => set({ inRoom: true })}
          />
          In the same room as the others
        </label>
      </fieldset>
      <fieldset>
        <legend>Headphones?</legend>
        <label>
          <input
            type="radio"
            name="phones"
            checked={setup.headphones}
            onChange={() => set({ headphones: true })}
          />
          I have headphones
        </label>
        <label>
          <input
            type="radio"
            name="phones"
            checked={!setup.headphones}
            onChange={() => set({ headphones: false })}
          />
          No headphones
        </label>
      </fieldset>
      <label>
        <input
          type="checkbox"
          checked={setup.captions}
          onChange={(e) => set({ captions: e.currentTarget.checked })}
        />
        Always show captions
      </label>
      <label>
        <input
          type="checkbox"
          checked={setup.earplugs}
          onChange={(e) => set({ earplugs: e.currentTarget.checked })}
        />
        I have earplugs
      </label>
      <label>
        <input
          type="checkbox"
          checked={setup.mask}
          onChange={(e) => set({ mask: e.currentTarget.checked })}
        />
        I have a sleep mask or blindfold
      </label>
    </form>
  );
}

export function Lobby({ code }: { code: string }) {
  const { socket, state, rttMs, online } = useSocket();
  const [nickname, setNickname] = useState<string | null>(null); // null until read from this browser
  const [draftName, setDraftName] = useState("");
  const [status, setStatus] = useState<Status>("joining");
  const [message, setMessage] = useState("");
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [host, setHost] = useState(false);
  const [mySeat, setMySeat] = useState<number | null>(null);
  const [myPerson, setMyPerson] = useState<number | null>(null); // your place in the lobby's list of people
  const [team, setTeam] = useState("");
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null); // your own answers, from this browser
  const sentSetup = useRef(false); // the saved setup goes to the server once per page, when the join is confirmed
  const as = useRef<"player" | "spectator">("player");
  const following = useRef(false); // this page asked to start a new team
  const editingTeam = useRef(false); // an update from the server must not overwrite what the host is typing

  useEffect(() => {
    setNickname(readNickname());
    setSetup(loadSetup());
  }, []);

  useEffect(() => {
    if (!socket) return;
    const offs = [
      socket.on("lobby", (m) => {
        // An answer about another lobby is the new team this page asked to start: follow it. Any
        // other (the one we are already in, told again on reconnecting) is not about this page.
        if (m.lobby.code !== code) {
          if (following.current) location.assign(`/lobby/${m.lobby.code}`);
          return;
        }
        setLobby(m.lobby);
        // the host gave the game up (or nobody was left): back to the lobby screen
        if (m.lobby.phase === "open") setReveal(null);
        setHost(m.you.host);
        setMySeat(m.you.seat);
        setMyPerson(m.you.person);
        if (!editingTeam.current) setTeam(m.lobby.teamName);
        setStatus("in");
      }),
      socket.on("reveal", (m) =>
        setReveal((old) => ({
          room: m.room,
          name: m.name,
          index: m.index,
          role: m.role,
          crew: m.crew,
          real: m.real,
          rooms: m.rooms,
          sittingOut: m.sittingOut,
          played: m.played,
          // a reveal for the room you are already in (a reconnect) has nothing to morph from
          ...(old && old.index !== m.index ? { from: old.role } : {}),
        })),
      ),
      socket.on("error", (m) => {
        // a refused send (too soon, not allowed, not in sight) is the wheel's to show, never the lobby failing
        if (m.code === "cooldown" || m.code === "cant-send" || m.code === "not-in-sight") return;
        setMessage(m.message);
        if (m.code === "lobby-not-found") setStatus("missing");
        else if (m.code === "lobby-full") setStatus("full");
        else if (m.code !== "not-host") setStatus("failed");
      }),
      socket.on("left", () => location.assign("/")),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, [socket, code]);

  // The saved setup is sent as soon as the first `lobby` message confirms this page is a person of
  // it, so a person who answered in an earlier lobby shows "Set up" with no clicks. Only if they
  // ever answered: nothing saved means the defaults, left as "not set up".
  useEffect(() => {
    if (!socket || !setup || myPerson === null || sentSetup.current) return;
    sentSetup.current = true;
    if (setup.done) socket.send({ t: "lobby.setup", setup });
  }, [socket, setup, myPerson]);

  // joining again after a reconnect is a rejoin: the server hands back the same seat
  const joinActive = status === "joining" || status === "in";
  useEffect(() => {
    if (socket && online && nickname && joinActive) {
      socket.send({ t: "lobby.join", code, nickname, as: as.current });
    }
  }, [socket, online, nickname, code, joinActive]);

  function submitName(event: Event) {
    event.preventDefault();
    const name = draftName.trim();
    if (!name) return;
    saveNickname(name);
    setNickname(name);
  }

  function watch() {
    as.current = "spectator";
    setStatus("joining");
  }

  function startNewTeam() {
    following.current = true;
    if (socket && nickname) socket.send({ t: "lobby.create", nickname });
  }

  function leave() {
    socket?.send({ t: "lobby.leave" });
    // the server answers "left"; if it can't, don't strand the person here
    setTimeout(() => location.assign("/"), 1500);
  }

  function commitTeam() {
    editingTeam.current = false;
    const name = team.trim();
    if (host && name && name !== lobby?.teamName) socket?.send({ t: "lobby.team", name });
    else if (lobby) setTeam(lobby.teamName);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function toggleQr() {
    if (qr) return setQr(null);
    setQr(await qrSvg(`${location.origin}/lobby/${code}`));
  }

  function start() {
    setMessage("");
    socket?.send({ t: "lobby.start" });
  }

  function answer(next: Setup) {
    setSetup(next);
    saveSetup({ ...next, done: true });
    socket?.send({ t: "lobby.setup", setup: next });
  }

  const letters = code.split("");
  const heading = (
    <div class="code-block">
      <h1 class="share">Share this code</h1>
      <p class="code">
        {letters.map((letter, i) => (
          <>
            {i > 0 && " "}
            <span aria-hidden="true">{letter}</span>
          </>
        ))}
        <span class="sr-only">Lobby code {letters.join(", ")}</span>
      </p>
    </div>
  );

  // A game is only this page's if the page is in the lobby its address names: typing another
  // code while in a game is told about that game again on connecting, and must still say "No lobby".
  if (reveal && socket && lobby && status === "in" && mySeat === null) {
    return (
      <Spectator
        key={reveal.index}
        socket={socket}
        state={state}
        rttMs={rttMs}
        seats={lobby.seats}
        onStartNewTeam={startNewTeam}
      />
    );
  }

  if (reveal && socket && lobby && status === "in") {
    return (
      <Game
        key={reveal.index}
        socket={socket}
        state={state}
        rttMs={rttMs}
        online={online}
        reveal={reveal}
        host={host}
        hostName={lobby?.people.find((p) => p.who === lobby.host)?.nickname ?? null}
        seats={lobby?.seats ?? null}
      />
    );
  }

  if (nickname === "") {
    return (
      <div class="lobby-solo">
        {heading}
        <form class="stack" onSubmit={submitName}>
          <div class="field">
            <label for="nickname">Nickname</label>
            <input
              id="nickname"
              value={draftName}
              maxLength={16}
              autoComplete="off"
              onInput={(e) => setDraftName(e.currentTarget.value)}
            />
          </div>
          <button type="submit" class="btn primary">
            Join lobby
          </button>
        </form>
      </div>
    );
  }

  if (status === "missing") {
    return (
      <div class="lobby-solo">
        <h1 class="share">
          {message.includes("closed") ? `Lobby ${code} has closed.` : `No lobby ${code}.`}
        </h1>
        <div class="actions">
          <a class="btn" href="/">
            Try another code
          </a>
          <button type="button" class="btn primary" onClick={startNewTeam}>
            Start a new team
          </button>
        </div>
      </div>
    );
  }

  if (status === "full") {
    return (
      <div class="lobby-solo">
        {heading}
        <p>This lobby is full. You can watch, or start a team of your own.</p>
        <div class="actions">
          <button type="button" class="btn" onClick={watch}>
            Watch
          </button>
          <button type="button" class="btn primary" onClick={startNewTeam}>
            Start a new team
          </button>
        </div>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div class="lobby-solo">
        {heading}
        <p class="error" role="alert">
          {message}
        </p>
        <a class="btn" href="/">
          Back to start
        </a>
      </div>
    );
  }

  if (!lobby) {
    return (
      <div class="lobby-solo">
        {heading}
        <div class="section-head">
          <p class="muted">Joining…</p>
          <Connection state={state} rttMs={rttMs} />
        </div>
      </div>
    );
  }

  const watching = myPerson === null;
  const here = lobby.people.length;
  const bots = Math.max(0, 3 - here); // Start fills every empty seat with a bot
  return (
    <div class="lobby">
      <div class="lobby-code">
        {heading}
        <div class="actions">
          <button type="button" class="btn" onClick={copy}>
            Copy
          </button>
          <button type="button" class="btn" onClick={toggleQr} aria-expanded={qr !== null}>
            {qr ? "Hide QR" : "Show QR"}
          </button>
          <span class="muted" role="status">
            {copied ? "Copied" : ""}
          </span>
        </div>
        {qr && (
          <div
            class="qr"
            role="img"
            aria-label={`QR code for lobby ${code}`}
            dangerouslySetInnerHTML={{ __html: qr }}
          />
        )}
      </div>

      <div class="lobby-side">
        <div class="section-head">
          <h2 id="team-title">{watching ? "You are watching" : "Your team"}</h2>
          <Connection state={state} rttMs={rttMs} />
        </div>
        {host ? (
          <div class="field">
            <label for="team">Team name</label>
            <input
              id="team"
              value={team}
              maxLength={24}
              autoComplete="off"
              onInput={(e) => {
                editingTeam.current = true;
                setTeam(e.currentTarget.value);
              }}
              onBlur={commitTeam}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitTeam();
                }
              }}
            />
          </div>
        ) : (
          <p class="team-name">
            Team: <strong>{lobby.teamName}</strong>
          </p>
        )}

        <h2 id="seats-title">People</h2>
        <ul class="seats" aria-labelledby="seats-title">
          {lobby.people.map((person, i) => (
            <li key={person.who} class="seat">
              <SeatShape shape={SEAT_SHAPE[i % 3] ?? "circle"} />
              <span class="sr-only">Person {i + 1}: </span>
              <span class="nick">{person.nickname}</span>
              {lobby.host === person.who && <span class="tag">host</span>}
              {myPerson === i && <span class="tag">you</span>}
              {person.setup.done && <span class="tag">set up</span>}
              {!person.connected && <span class="tag">away</span>}
            </li>
          ))}
        </ul>
        {lobby.spectators.length > 0 && (
          <p class="spectators">Spectators: {lobby.spectators.map((s) => s.nickname).join(", ")}</p>
        )}

        {!watching && setup && <SetupForm setup={setup} onChange={answer} />}

        {!watching && (
          <div class="start">
            {host ? (
              <>
                <button type="button" class="btn primary" onClick={start}>
                  {bots === 0
                    ? "Start"
                    : `Start (${bots} ${bots === 1 ? "bot fills" : "bots fill"})`}
                </button>
                <p class="muted" role="status">
                  {bots === 0
                    ? `${here} ${here === 1 ? "person is" : "people are"} here.`
                    : `${here} of 3 players here. Start now and ${bots === 1 ? "a bot takes" : "bots take"} the rest.`}
                </p>
              </>
            ) : (
              <p class="muted" role="status">
                Waiting for the host to start.
              </p>
            )}
            {message && lobby.phase === "open" && (
              <p class="error" role="alert">
                {message}
              </p>
            )}
          </div>
        )}

        <div class="actions">
          <button type="button" class="btn" onClick={leave}>
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}
