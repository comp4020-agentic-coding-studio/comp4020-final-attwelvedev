import { useEffect, useRef, useState } from "preact/hooks";
import { readNickname, saveNickname } from "../client/nickname.ts";
import { loadSetup, saveSetup } from "../client/preferences.ts";
import { qrSvg } from "../client/qr.ts";
import { forecast, nextRoomFor } from "../client/rotation.ts";
import { MAX_PEOPLE } from "../game/crew.ts";
import { sharesRoom } from "../game/setup.ts";
import type { Seat } from "../game/types.ts";
import type { LobbyState, RoleView, Setup } from "../net/protocol.ts";
import { Connection } from "./Connection.tsx";
import { Game, type Reveal } from "./Game.tsx";
import { LeaveGuard } from "./LeaveGuard.tsx";
import { PlayerRow } from "./PlayerRow.tsx";
import { PreferencesSheet } from "./PreferencesSheet.tsx";
import { Spectator } from "./Spectator.tsx";
import { useSocket } from "./useSocket.ts";
import { YourSetup } from "./YourSetup.tsx";

// Spectators as the server names them when the host pulls one in: -4 - n for the nth.
const watchersOf = (lobby: LobbyState) =>
  lobby.spectators.map((s, n) => ({ ref: -4 - n, nickname: s.nickname }));

// The people sitting this room out, whom the host may pull into an empty seat.
const sittingOutOf = (lobby: LobbyState) =>
  lobby.sittingOut.flatMap((who) => {
    const index = lobby.people.findIndex((p) => p.who === who);
    const person = lobby.people[index];
    return person ? [{ index, nickname: person.nickname }] : [];
  });

type Status = "joining" | "in" | "full" | "missing" | "failed";

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
  // The server sends the reveal's first view and the ready list straight after the reveal, before the
  // page has drawn the game. They are kept here so the game, once mounted, starts from them.
  const early = useRef<{ view: RoleView | null; ready: Seat[] }>({ view: null, ready: [] });
  const [setup, setSetup] = useState<Setup | null>(null); // your own answers, from this browser
  const [rooms, setRooms] = useState<string[]>([]); // room names, for the rotation table
  const [asking, setAsking] = useState<string | null>(null); // where a clicked link was going, while the leave modal is open
  const [moved, setMoved] = useState<{ person: string; dir: -1 | 1 } | null>(null); // the Move button to keep focus on
  const [prefsOpen, setPrefsOpen] = useState(false);
  const dragging = useRef<number | null>(null);
  const leaveTo = useRef("/"); // where a confirmed leave goes: home, or the link that was clicked
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
        setRooms(m.rooms);
        // the host gave the game up (or nobody was left): back to the lobby screen
        if (m.lobby.phase === "open") setReveal(null);
        setHost(m.you.host);
        setMySeat(m.you.seat);
        setMyPerson(m.you.person);
        if (!editingTeam.current) setTeam(m.lobby.teamName);
        setStatus("in");
      }),
      socket.on("view", (m) => {
        early.current.view = m.view;
      }),
      socket.on("ready", (m) => {
        early.current.ready = m.seats;
      }),
      socket.on("reveal", (m) =>
        setReveal((old) => ({
          room: m.room,
          name: m.name,
          index: m.index,
          role: m.role,
          crew: m.crew,
          real: m.real,
          cues: m.cues,
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
      socket.on("left", () => location.assign(leaveTo.current)),
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

  // Leaving always asks first (FR22): the Leave button and any link of the page open the modal.
  // Confirming tells the server, which answers "left"; a link then goes where it was headed.
  function leave() {
    socket?.send({ t: "lobby.leave" });
    // if the server can't answer, don't strand the person here
    setTimeout(() => location.assign(leaveTo.current), 1500);
  }

  function move(person: number, dir: -1 | 1) {
    if (!lobby) return;
    const to = person + dir;
    if (to < 0 || to >= lobby.people.length) return;
    const order = lobby.people.map((_, i) => i);
    [order[person], order[to]] = [order[to] as number, order[person] as number];
    setMoved({ person: lobby.people[person]?.who ?? "", dir });
    socket?.send({ t: "lobby.order", order });
  }

  function dropOn(place: number) {
    const from = dragging.current;
    dragging.current = null;
    if (from === null || from === place || !lobby) return;
    const order = lobby.people.map((_, i) => i);
    order.splice(place, 0, order.splice(from, 1)[0] as number);
    socket?.send({ t: "lobby.order", order });
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

  const askLeave = () => {
    leaveTo.current = "/";
    setAsking("/");
  };
  // Leaving a game or a watch asks first too (FR22, FR33): any link of the page opens the modal, and
  // the menu's Leave does. Confirming says so to the server, whose "left" takes the page home.
  const guard = (watching: boolean) => (
    <LeaveGuard
      active
      open={asking !== null}
      onAsk={(href) => {
        leaveTo.current = href;
        setAsking(href);
      }}
      onStay={() => setAsking(null)}
      onLeave={leave}
      title={watching ? "Stop watching?" : "Leave the heist?"}
      body={
        watching
          ? "You'll leave this lobby."
          : "Your crew carries on with a bot or a teammate in your place."
      }
      leaveLabel={watching ? "Leave" : "Leave heist"}
    />
  );

  // A game is only this page's if the page is in the lobby its address names: typing another
  // code while in a game is told about that game again on connecting, and must still say "No lobby".
  if (reveal && socket && lobby && status === "in" && mySeat === null) {
    return (
      <>
        <Spectator
          key={reveal.index}
          socket={socket}
          state={state}
          rttMs={rttMs}
          seats={lobby.seats}
          early={early.current}
          crew={reveal.crew}
          host={host}
          hostName={lobby.people.find((p) => p.who === lobby.host)?.nickname ?? null}
          sitting={sittingOutOf(lobby)}
          watchers={watchersOf(lobby)}
          onStartNewTeam={startNewTeam}
          me={myPerson}
          roomName={reveal.name}
          next={
            myPerson === null
              ? null
              : nextRoomFor(myPerson, lobby.people, reveal.index, reveal.rooms)
          }
          onLeave={askLeave}
        />
        {guard(true)}
      </>
    );
  }

  if (reveal && socket && lobby && status === "in") {
    return (
      <>
        <Game
          early={early.current}
          key={reveal.index}
          socket={socket}
          state={state}
          rttMs={rttMs}
          online={online}
          reveal={reveal}
          host={host}
          hostName={lobby?.people.find((p) => p.who === lobby.host)?.nickname ?? null}
          seats={lobby?.seats ?? null}
          people={lobby.people.map((p) => p.nickname)}
          watching={lobby.spectators.map((s) => s.nickname)}
          sitting={sittingOutOf(lobby)}
          onLeave={askLeave}
        />
        {guard(false)}
      </>
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
  const plan = forecast(here, rooms.length);
  const together = sharesRoom(lobby.people.map((x) => x.setup));
  const crowded = here > 3; // "plays N" only means something when people sit out
  const name = (i: number) => lobby.people[i]?.nickname ?? "";
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
        {lobby.private && (
          <p class="muted private-note">
            Hidden from open lobbies. Only people with the code can join.
          </p>
        )}

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

        {rooms.length > 0 && !watching && (
          <section aria-labelledby="rotation-title">
            <h2 id="rotation-title" class="rotation-title">
              Rooms and who plays
            </h2>
            <ol class="rotation">
              {plan.rooms.map((room, i) => (
                <li key={rooms[i]}>
                  <span class="room-name">
                    {i + 1} {rooms[i]}
                  </span>
                  <span class="crew">
                    {room.playing.map((p) => (p === null ? "bot" : name(p))).join(" · ")}
                    {room.out.length > 0 && (
                      <span class="out">
                        {" "}
                        · {room.out.map(name).join(", ")} {room.out.length === 1 ? "sits" : "sit"}{" "}
                        out
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
            <p class="muted">
              Your roles are revealed before each room.
              {crowded ? " The host can change who plays then." : ""}
            </p>
          </section>
        )}
      </div>

      <div class="lobby-side">
        <div class="section-head">
          <h2 id="players-title">
            {watching ? "You are watching" : `Players ${here} of ${MAX_PEOPLE}`}
          </h2>
          <Connection state={state} rttMs={rttMs} />
        </div>
        {host && (
          <button
            type="button"
            class={lobby.private ? "toggle on" : "toggle"}
            role="switch"
            aria-checked={lobby.private}
            onClick={() => socket?.send({ t: "lobby.private", on: !lobby.private })}
          >
            <span>Private</span>
            <span class="state">{lobby.private ? "on" : "off"}</span>
          </button>
        )}
        {host && here > 1 && (
          <p class="muted">Drag, or use the arrows, to set the starting order.</p>
        )}
        {here === 1 && !watching && (
          <p class="muted">Share the code to fill seats; bots fill the rest.</p>
        )}
        <ol class="players" aria-labelledby="players-title">
          {lobby.people.map((person, i) => (
            <PlayerRow
              key={person.who}
              person={person}
              place={i}
              isHost={lobby.host === person.who}
              isYou={myPerson === i}
              canOrder={host && here > 1}
              last={i === here - 1}
              together={together}
              plays={crowded ? (plan.plays[i] ?? 0) : null}
              focusMove={moved?.person === person.who ? moved.dir : null}
              onMove={(dir) => move(i, dir)}
              onRename={(nick) => socket?.send({ t: "lobby.nickname", nickname: nick })}
              onDragStart={() => {
                dragging.current = i;
              }}
              onDrop={() => dropOn(i)}
            />
          ))}
        </ol>
        {lobby.spectators.length > 0 && (
          <p class="spectators">Spectators: {lobby.spectators.map((s) => s.nickname).join(", ")}</p>
        )}

        {!watching && setup && (
          <>
            <YourSetup setup={setup} onChange={answer} />
            <button type="button" class="btn" onClick={() => setPrefsOpen(true)}>
              Preferences
            </button>
          </>
        )}

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
          <button
            type="button"
            class="btn"
            onClick={() => {
              leaveTo.current = "/";
              setAsking("/");
            }}
          >
            Leave lobby
          </button>
        </div>
      </div>
      <PreferencesSheet open={prefsOpen} onClose={() => setPrefsOpen(false)} onSetup={answer} />
      <LeaveGuard
        active={status === "in"}
        open={asking !== null}
        onAsk={(href) => {
          leaveTo.current = href;
          setAsking(href);
        }}
        onStay={() => setAsking(null)}
        onLeave={leave}
        title="Leave the lobby?"
        body="You'll lose your spot."
        leaveLabel="Leave lobby"
      />
    </div>
  );
}
