import { useEffect, useRef, useState } from "preact/hooks";
import { createAudio, type GameAudio } from "../client/audio.ts";
import {
  type CueCaption,
  captionFor,
  cueCaptions,
  cueKey,
  type HeldCues,
  hearCues,
  heardCues,
} from "../client/hud.ts";
import { draw, type Scene } from "../client/render.ts";
import type { ConnectionState, GameSocket } from "../client/socket.ts";
import { ROLE_LABEL, type Role, type Seat } from "../game/types.ts";
import type { LobbyState, RoleView } from "../net/protocol.ts";
import { type CaptionLine, Captions } from "./Captions.tsx";
import { Connection } from "./Connection.tsx";
import { Disconnect } from "./Disconnect.tsx";
import { HudMenu } from "./HudMenu.tsx";
import { RoleShape } from "./RoleShape.tsx";
import { SpectatorChat, type WatchLine } from "./SpectatorChat.tsx";
import { useGone } from "./useGone.ts";
import { useHostNote } from "./useHostNote.ts";
import { usePause } from "./usePause.ts";
import { useVoice } from "./useVoice.ts";

const SEATS = [0, 1, 2] as const;
const CAPTION_MS = 4000;

// A grey dashed frame, no role shape and no tray (spec §4.1): a watcher plays nothing, so the chrome
// that belongs to a seat is left off. The view itself (src/game/perception.ts: spectatorView) is
// always the full room; it starts with nobody followed and no sound, and following a seat adds
// what that seat hears. A spectator and someone sitting this room out share a chat (ADR 0015).
export function Spectator({
  socket,
  state,
  rttMs,
  seats,
  early,
  crew,
  host,
  hostName,
  sitting,
  watchers,
  onStartNewTeam,
  me,
  onLeave,
  roomName,
  next,
}: {
  socket: GameSocket;
  state: ConnectionState;
  rttMs: number | null;
  seats: LobbyState["seats"];
  early: { view: RoleView | null }; // the room as it was when the reveal was sent: it arrives before this page does
  crew: { seat: Seat; role: Role }[]; // this room's roles, from the reveal that came before this page drew
  hostName: string | null;
  host: boolean; // the host may only be watching: the empty seats are still theirs to fill
  sitting: { index: number; nickname: string }[];
  watchers: { ref: number; nickname: string }[];
  onStartNewTeam: () => void;
  me: number | null; // this person's index in the lobby, to say which room they play next
  onLeave: () => void; // the menu's Leave: the lobby asks first
  roomName: string;
  next: number | null; // the next room this person plays (from 1), when someone sitting out
}) {
  const goneNote = useGone(socket);
  const hostNote = useHostNote(hostName, host);
  const gone = [goneNote, hostNote].filter(Boolean).join(" ") || null;
  const { pause, secondsLeft } = usePause(socket);
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<RoleView | null>(early.view);
  const roles = useRef<[Role, Role, Role]>(
    crew.reduce(
      (acc, c) => {
        acc[c.seat] = c.role;
        return acc;
      },
      ["blind", "deaf", "mute"] as [Role, Role, Role],
    ),
  );
  const [follow, setFollow] = useState<Seat | null>(null); // null: the whole room, no sound
  const [chat_, setChat] = useState<WatchLine[]>([]);
  const chatId = useRef(0);
  const [lines, setLines] = useState<CaptionLine[]>([]);
  const lineId = useRef(0);
  // What the followed seat hears: played, and captioned with arrows, as that seat's own page would
  const audio = useRef<GameAudio | null>(null);
  const cueHold = useRef<HeldCues>(new Map());
  const [cues, setCues] = useState<CueCaption[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"chat" | "players">("chat");
  // A watcher talks to the other watchers and hears them and the seat it follows (ADR 0015)
  const voice = useVoice(socket, "watcher", true, root, "hold");

  useEffect(
    () =>
      socket.on("reveal", (m) => {
        roles.current = m.crew.reduce(
          (acc, c) => {
            acc[c.seat] = c.role;
            return acc;
          },
          ["blind", "deaf", "mute"] as [Role, Role, Role],
        );
      }),
    [socket],
  );

  // `early` is the lobby's record of what arrived before this page drew: the view that came with the
  // reveal may land after this page rendered but before this effect ran, so it is read here, once
  // the listener is in place, not only when the page was first rendered.
  useEffect(() => {
    if (early.view && view.current === null) view.current = early.view;
    audio.current = createAudio();
    // browsers keep sound off until the page has been touched: any press or key is that touch
    const wake = () => void audio.current?.resume();
    document.addEventListener("pointerdown", wake);
    document.addEventListener("keydown", wake);
    const off = socket.on("view", (m) => {
      view.current = m.view;
      hearCues(cueHold.current, cueCaptions(m.view.sounds), performance.now());
      audio.current?.play(m.view.sounds);
    });
    const timer = setInterval(() => {
      const heard = heardCues(cueHold.current, performance.now());
      setCues((old) => (cueKey(old) === cueKey(heard) ? old : heard));
    }, 100);
    return () => {
      off();
      clearInterval(timer);
      document.removeEventListener("pointerdown", wake);
      document.removeEventListener("keydown", wake);
      audio.current?.dispose();
      audio.current = null;
    };
  }, [socket, early]);

  useEffect(
    () =>
      socket.on("msg", (m) => {
        const caption = captionFor(m);
        if (!caption) return;
        const now = performance.now();
        const line = { id: ++lineId.current, ...caption, until: now + CAPTION_MS };
        setLines((old) => [...old.filter((l) => l.until > now), line].slice(-3));
      }),
    [socket],
  );

  useEffect(
    () =>
      socket.on("spec.msg", (m) =>
        setChat((old) =>
          [...old, { id: ++chatId.current, nickname: m.nickname, text: m.text }].slice(-50),
        ),
      ),
    [socket],
  );

  function followSeat(seat: Seat | null) {
    cueHold.current.clear();
    setCues([]);
    setFollow(seat);
    socket.send({ t: "spectate", seat });
  }

  // V talks, as in a game, unless a text field has the keys
  useEffect(() => {
    const isField = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
    const down = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "v" || e.repeat || isField(e.target)) return;
      if (voice.status === "ready") {
        e.preventDefault();
        voice.mic("down");
      }
    };
    const up = (e: KeyboardEvent) => e.key.toLowerCase() === "v" && voice.mic("up");
    const blur = () => voice.mic("off");
    document.addEventListener("keydown", down);
    document.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      document.removeEventListener("keydown", down);
      document.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [voice]);

  // Same full-bleed layout as a game: the site header and footer step aside.
  useEffect(() => {
    document.body.classList.add("playing");
    return () => document.body.classList.remove("playing");
  }, []);

  useEffect(() => {
    const el = canvas.current;
    const box = frame.current;
    const ctx = el?.getContext("2d");
    if (!el || !box || !ctx) return;
    let size = { w: 0, h: 0 };
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      size = { w: box.clientWidth, h: box.clientHeight };
      el.width = Math.round(size.w * dpr);
      el.height = Math.round(size.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(box);
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const v = view.current;
      if (!v) return;
      const scene: Scene = {
        ...size,
        role: v.role,
        seat: v.you.seat,
        roles: roles.current,
        tiles: v.tiles ?? null,
        entities: v.entities,
        self: v.you.pos ?? null,
        layout: size.w >= 720 ? "fit" : "follow",
        alarm: v.alarm,
        nowMs: performance.now(),
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
        spectator: true,
        noSelf: v.you.pos === undefined, // the whole room: nobody is followed
      };
      draw(ctx, scene);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  const micNote =
    voice.status === "ready" || voice.status === "starting"
      ? null
      : voice.status === "blocked"
        ? "Microphone blocked: voice is off. Chat still works."
        : "This browser can't do voice: voice is off. Chat still works.";
  const players = (
    <div class="spectator-players">
      <fieldset class="spectator-follow">
        <legend>Follow</legend>
        {SEATS.map((seat) => (
          <button
            key={seat}
            type="button"
            class="btn"
            aria-pressed={follow === seat}
            disabled={!seats[seat]?.who && !seats[seat]?.bot}
            onClick={() => followSeat(seat)}
          >
            <RoleShape role={roles.current[seat]} size={16} />{" "}
            {seats[seat]?.nickname ?? `Seat ${seat + 1}`}
          </button>
        ))}
        <button
          type="button"
          class="btn"
          aria-pressed={follow === null}
          onClick={() => followSeat(null)}
        >
          Whole room
        </button>
      </fieldset>
      {sitting.length > 0 && (
        <p class="muted">
          Sitting out this room: {sitting.map((p) => p.nickname).join(", ")}
          {next !== null && sitting.some((p) => p.index === me) ? ` (you play room ${next})` : ""}
        </p>
      )}
    </div>
  );
  const chat = (
    <SpectatorChat
      lines={chat_}
      onSay={(text) => socket.send({ t: "spec.say", text })}
      onTalk={voice.talk}
      talking={voice.talking}
      micNote={micNote}
    />
  );
  return (
    <div class="spectator" ref={root}>
      <h1 class="sr-only">Watching {roomName}</h1>
      <header class="hud-top">
        <span class="hud-room">Watching {roomName}</span>
        <Connection state={state} rttMs={rttMs} />
        <HudMenu restarts={false} leaveLabel="Leave" onLeave={onLeave} />
      </header>
      <div class="spectator-body">
        <div class="frame spectator-frame" ref={frame}>
          <canvas
            ref={canvas}
            role="img"
            aria-label={
              follow === null
                ? "Spectator view of the whole room"
                : `Spectator view, following ${ROLE_LABEL[roles.current[follow]]}`
            }
          />
          <Captions lines={lines} cues={cues} />
        </div>
        <section
          class="spectator-panel"
          aria-label={`Spectators (${sitting.length + watchers.length})`}
        >
          <p class="spectator-panel-title">
            Spectators ({sitting.length + watchers.length}) — only spectators see and hear this
          </p>
          <div class="spectator-tabs" role="tablist" aria-label="Panel">
            {(["chat", "players"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                class="btn"
                id={`spec-tab-${t}`}
                aria-selected={tab === t}
                aria-controls={`spec-pane-${t}`}
                onClick={() => setTab(t)}
              >
                {t === "chat" ? "Chat" : "Players"}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id="spec-pane-players"
            aria-labelledby="spec-tab-players"
            class={tab === "players" ? "spectator-pane" : "spectator-pane off-phone"}
          >
            {players}
          </div>
          <div
            role="tabpanel"
            id="spec-pane-chat"
            aria-labelledby="spec-tab-chat"
            class={tab === "chat" ? "spectator-pane" : "spectator-pane off-phone"}
          >
            {chat}
          </div>
          <button type="button" class="btn primary" onClick={onStartNewTeam}>
            Start a new team
          </button>
        </section>
      </div>
      {gone && (
        <p class="hud-alert spectator-gone" role="status">
          {gone}
        </p>
      )}
      {pause && (
        <Disconnect
          waitingFor={pause.waitingFor}
          secondsLeft={secondsLeft}
          choosing={pause.choosing}
          host={host}
          sitting={sitting}
          watching={watchers}
          gone={pause.gone}
          forReady={pause.forReady}
          hostName={hostName}
          onChoice={(choice, person) =>
            socket.send({ t: "host.choice", choice, ...(person === undefined ? {} : { person }) })
          }
        />
      )}
    </div>
  );
}
