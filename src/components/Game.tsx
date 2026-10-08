import { useEffect, useRef, useState } from "preact/hooks";
import { createAudio, type GameAudio } from "../client/audio.ts";
import { formatTime, lerpEntities, roomTitle, trayFor } from "../client/hud.ts";
import { createInput } from "../client/input.ts";
import { createPredictor, type Predictor } from "../client/predict.ts";
import { draw, type Scene } from "../client/render.ts";
import type { ConnectionState, GameSocket } from "../client/socket.ts";
import { NET } from "../client/tokens.ts";
import { ROLE_LABEL, type Role, type Vec } from "../game/types.ts";
import type { CrewMember, LobbyState, RoleView } from "../net/protocol.ts";
import { Connection } from "./Connection.tsx";
import { RoleReveal } from "./RoleReveal.tsx";
import { ROLE_GLYPH, RoleShape } from "./RoleShape.tsx";

export interface Reveal {
  room: string;
  index: number;
  role: Role;
  crew: CrewMember[];
}

// What the frame loop and the input loop share. Plain mutable state in a ref:
// it changes 20 times a second and must not re-render the page each time.
interface Runtime {
  view: RoleView | null;
  prevEntities: RoleView["entities"];
  at: number; // when `view` arrived
  tiles: string[] | null;
  predictor: Predictor | null;
  self: Vec | null; // where we think we are
  shown: Vec | null; // where we draw ourselves (self, eased)
}

const EASE = 0.5; // share of the gap to the predicted position closed each frame
const SNAP_TILES = 1.5;

function onView(rt: Runtime, view: RoleView, audio: GameAudio): void {
  // the tick going backwards means the room was restarted: forget what we predicted
  if (rt.view && view.tick < rt.view.tick) {
    rt.predictor = null;
    rt.self = null;
    rt.shown = null;
  }
  rt.prevEntities = rt.view?.entities ?? [];
  rt.view = view;
  rt.at = performance.now();
  if (view.tiles) rt.tiles = view.tiles;
  const pos = view.you.pos;
  if (pos && rt.tiles) {
    rt.predictor ??= createPredictor(pos, rt.tiles);
    rt.predictor.observe(view.entities);
    rt.self = rt.predictor.reconcile(pos, view.ack);
    rt.shown ??= rt.self;
  }
  audio.play(view.sounds);
}

export function Game({
  socket,
  state,
  rttMs,
  online,
  reveal,
  host,
  seats,
}: {
  socket: GameSocket;
  state: ConnectionState;
  rttMs: number | null;
  online: boolean;
  reveal: Reveal;
  host: boolean;
  seats: LobbyState["seats"] | null;
}) {
  const rt = useRef<Runtime>({
    view: null,
    prevEntities: [],
    at: 0,
    tiles: null,
    predictor: null,
    self: null,
    shown: null,
  });
  const audio = useRef<GameAudio | null>(null);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);

  // Registered as soon as the reveal shows, so the first (full) view is never missed.
  useEffect(() => {
    audio.current = createAudio();
    const off = socket.on("view", (m) => {
      if (audio.current) onView(rt.current, m.view, audio.current);
      setPlaying(true);
    });
    return () => {
      off();
      audio.current?.dispose();
      audio.current = null;
    };
  }, [socket]);

  if (!playing) {
    return (
      <RoleReveal
        {...reveal}
        ready={ready}
        onReady={() => {
          audio.current?.resume(); // a tap is the browser's cue to let sound play
          setReady(true);
          socket.send({ t: "ready" });
        }}
      />
    );
  }
  return (
    <Hud
      rt={rt.current}
      socket={socket}
      state={state}
      rttMs={rttMs}
      online={online}
      reveal={reveal}
      host={host}
      seats={seats}
    />
  );
}

function Hud({
  rt,
  socket,
  state,
  rttMs,
  online,
  reveal,
  host,
  seats,
}: {
  rt: Runtime;
  socket: GameSocket;
  state: ConnectionState;
  rttMs: number | null;
  online: boolean;
  reveal: Reveal;
  host: boolean;
  seats: LobbyState["seats"] | null;
}) {
  const { role } = reveal;
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [clock, setClock] = useState("0:00");
  const [cleared, setCleared] = useState(false);
  const [touch, setTouch] = useState(false);
  const lastSent = useRef<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Restart asks twice (a stray tap must not wipe the room); the ask lapses after 3 s.
  function restart() {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    setConfirming(false);
    lastSent.current = null;
    socket.send({ t: "room.restart" });
  }

  useEffect(() => {
    document.body.classList.add("playing");
    setTouch(matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0);
    const tick = setInterval(() => {
      const view = rt.view;
      if (!view) return;
      setClock(formatTime(view.elapsedMs));
      setCleared(view.status === "cleared");
    }, 250);
    return () => {
      document.body.classList.remove("playing");
      clearInterval(tick);
    };
  }, [rt]);

  // Draw every frame; the canvas is sized to its frame in device pixels.
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
    const frameLoop = () => {
      raf = requestAnimationFrame(frameLoop);
      const view = rt.view;
      if (!view) return;
      if (rt.self && rt.shown) {
        const gap = Math.hypot(rt.self.x - rt.shown.x, rt.self.y - rt.shown.y);
        rt.shown =
          gap > SNAP_TILES
            ? rt.self
            : {
                x: rt.shown.x + (rt.self.x - rt.shown.x) * EASE,
                y: rt.shown.y + (rt.self.y - rt.shown.y) * EASE,
              };
      }
      const t = (performance.now() - rt.at) / NET.interpolateMs;
      const scene: Scene = {
        ...size,
        role,
        seat: view.you.seat,
        roles: reveal.crew.map((c) => c.role) as Scene["roles"],
        tiles: role === "blind" ? null : rt.tiles,
        entities: lerpEntities(rt.prevEntities, view.entities, t),
        self: rt.shown,
        layout: size.w >= 720 ? "fit" : "follow",
      };
      draw(ctx, scene);
    };
    raf = requestAnimationFrame(frameLoop);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [rt, role, reveal.crew]);

  // Keyboard and touch, sent at 20 Hz while moving or changing; nothing goes
  // out while offline, and coming back online sends the current input afresh.
  useEffect(() => {
    if (!root.current) return;
    const source = createInput(root.current);
    lastSent.current = null;
    const timer = setInterval(() => {
      if (!online || rt.view?.status === "cleared") return;
      const input = source.read();
      const moving = input.move.x !== 0 || input.move.y !== 0;
      const sig = `${input.move.x},${input.move.y},${input.act}`;
      if (!moving && sig === lastSent.current) return;
      lastSent.current = sig;
      socket.send({ t: "input", ...input });
      if (moving && rt.predictor) rt.self = rt.predictor.apply(input, 1000 / NET.inputHz);
    }, 1000 / NET.inputHz);
    return () => {
      clearInterval(timer);
      source.dispose();
    };
  }, [rt, socket, online, touch]);

  // Who is gone: "left" frees the seat, "away" is a dropped connection (seat held).
  const presence = reveal.crew.map((c) => {
    const seat = seats?.[c.seat];
    if (!seat || c.bot) return null;
    if (!seat.who) return "left" as const;
    return seat.connected ? null : ("away" as const);
  });
  const gone = reveal.crew.flatMap((c, i) =>
    presence[i] ? [{ name: c.nickname, how: presence[i] }] : [],
  );
  const tray = trayFor(role);
  const label = ROLE_LABEL[role];
  return (
    <div class="game" ref={root} style={{ "--frame": `var(--role-${role})` }}>
      <h1 class="sr-only">
        {roomTitle(reveal.room)}: {label}
      </h1>
      <header class="hud-top">
        <span class="hud-role">
          <RoleShape role={role} size={20} />
          {label}
        </span>
        <span class="hud-room">{roomTitle(reveal.room)}</span>
        <span class="hud-clock" role="timer" aria-label="Time">
          {clock}
        </span>
        <Connection state={state} rttMs={rttMs} />
        {host && (
          <button type="button" class="hud-btn" onClick={restart}>
            {confirming ? "Sure? Restart" : "Restart"}
          </button>
        )}
      </header>

      <ul class="hud-crew" aria-label="Your team">
        {reveal.crew.map((c) => (
          <li key={c.seat}>
            <RoleShape role={c.role} size={16} />
            <span>
              {c.nickname}
              {c.seat === rt.view?.you.seat ? " (you)" : ""}
              {presence[c.seat] ? ` (${presence[c.seat]})` : ""}
            </span>
          </li>
        ))}
        {role === "blind" && <li class="hud-hint">No map. Listen.</li>}
      </ul>

      {gone.length > 0 && (
        <p class="hud-alert" role="status">
          {gone
            .map((g) =>
              g.how === "left" ? `${g.name} left the game.` : `${g.name} lost connection.`,
            )
            .join(" ")}
        </p>
      )}

      <div class="frame" ref={frame}>
        <span class="notch" aria-hidden="true">
          <RoleShape role={role} size={20} mono />
        </span>
        <canvas
          ref={canvas}
          role="img"
          aria-label={role === "blind" ? "No map. Listen to the room." : "Map of the room"}
        />
        {cleared && (
          <div class="overlay" role="status">
            <h2>Room cleared</h2>
            <p>Time {clock}</p>
            <button type="button" class="btn" onClick={() => socket.send({ t: "lobby.leave" })}>
              Leave
            </button>
          </div>
        )}
        {!online && (
          <div class="overlay" role="alert">
            <h2>Lost connection</h2>
            <p>Retrying…</p>
          </div>
        )}
      </div>

      <ul class="tray" aria-label="Ways to talk">
        {tray.map((tile, i) => (
          <li key={tile.family} class={tile.canSend ? "tile" : "tile cant"}>
            <span class="tile-name">
              <kbd>{i + 1}</kbd> {tile.label}
            </span>
            {tile.canSend ? (
              <span class="tile-to">
                <span class="sr-only">
                  goes to {tile.receivers.map((r) => ROLE_LABEL[r]).join(" and ")}
                </span>
                <span aria-hidden="true">
                  →{" "}
                  {tile.receivers.map((r) => (
                    <span key={r} class={r === role ? "glyph me" : "glyph"}>
                      {ROLE_GLYPH[r]}
                    </span>
                  ))}
                </span>
              </span>
            ) : (
              <span class="tile-cant">Can't send</span>
            )}
          </li>
        ))}
      </ul>

      {touch ? (
        <div class="touch-zone">
          <div class="joystick" data-joystick role="application" aria-label="Move">
            <span class="knob" />
          </div>
          <button type="button" class="act" data-act>
            Act
          </button>
        </div>
      ) : (
        <p class="keys">WASD or arrows move · Space acts</p>
      )}
    </div>
  );
}
