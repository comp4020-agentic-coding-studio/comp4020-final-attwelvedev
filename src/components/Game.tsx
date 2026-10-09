import { useEffect, useRef, useState } from "preact/hooks";
import { createAudio, type GameAudio } from "../client/audio.ts";
import { faceImage, preloadFaces } from "../client/faces.ts";
import { detectFx, FX_MAX, FX_MS, type Fx } from "../client/fx.ts";
import {
  CALLOUT_WORD,
  captionFor,
  caughtText,
  cueCaptions,
  formatTime,
  hearCues,
  heardCues,
  hostChangeText,
  lerpEntities,
} from "../client/hud.ts";
import { createInput } from "../client/input.ts";
import { createPredictor, type Predictor } from "../client/predict.ts";
import { draw, type FacePop, type Scene } from "../client/render.ts";
import { loadSettings, type Settings as SettingsState, saveSettings } from "../client/settings.ts";
import type { ConnectionState, GameSocket } from "../client/socket.ts";
import { browserSpeech } from "../client/speech.ts";
import { NET } from "../client/tokens.ts";
import { FACE_POP_MS } from "../game/channels.ts";
import { ROLE_LABEL, type Role, type Vec } from "../game/types.ts";
import type { CrewMember, LobbyState, RoleView } from "../net/protocol.ts";
import { type CaptionLine, Captions } from "./Captions.tsx";
import { ConfirmButton } from "./ConfirmButton.tsx";
import { Connection } from "./Connection.tsx";
import { Disconnect } from "./Disconnect.tsx";
import { RoleReveal } from "./RoleReveal.tsx";
import { RoleShape } from "./RoleShape.tsx";
import { RoomCleared } from "./RoomCleared.tsx";
import { Settings } from "./Settings.tsx";
import { TouchControls } from "./TouchControls.tsx";
import { Tray } from "./Tray.tsx";

export interface Reveal {
  room: string;
  name: string; // the room's title, from its file
  index: number;
  role: Role;
  crew: CrewMember[];
  from?: Role; // your role in the room before, so the shape can morph into the new one
}

const LAST_ROOM = 2; // the heist is three rooms: index 0, 1, 2

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
  pops: { seat: number; id: string; at: number }[]; // faces on show, by when they landed
  cueHold: Map<string, number>; // cue captions and when to let each go
  fx: { fx: Fx; at: number }[]; // small effects for what just changed, by when they started
  soundOn: boolean;
}

const CAPTION_MS = 5000;
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
  const started = performance.now();
  hearCues(rt.cueHold, cueCaptions(view.sounds), started); // every view, so a one-tick sound is not missed
  rt.fx = [
    ...rt.fx.filter((f) => started - f.at < FX_MS),
    ...detectFx(rt.prevEntities, view.entities).map((fx) => ({ fx, at: started })),
  ].slice(-FX_MAX);
  rt.at = performance.now();
  if (view.tiles) rt.tiles = view.tiles;
  const pos = view.you.pos;
  if (pos && rt.tiles) {
    rt.predictor ??= createPredictor(pos, rt.tiles);
    rt.predictor.observe(view.entities);
    rt.self = rt.predictor.reconcile(pos, view.ack);
    rt.shown ??= rt.self;
  }
  if (rt.soundOn) audio.play(view.sounds);
}

export function Game({
  socket,
  state,
  rttMs,
  online,
  reveal,
  host,
  hostName,
  seats,
}: {
  socket: GameSocket;
  state: ConnectionState;
  rttMs: number | null;
  online: boolean;
  reveal: Reveal;
  host: boolean;
  hostName: string | null;
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
    pops: [],
    fx: [],
    cueHold: new Map(),
    soundOn: true,
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
      hostName={hostName}
      seats={seats}
      audio={audio}
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
  hostName,
  seats,
  audio,
}: {
  rt: Runtime;
  socket: GameSocket;
  state: ConnectionState;
  rttMs: number | null;
  online: boolean;
  reveal: Reveal;
  host: boolean;
  hostName: string | null;
  seats: LobbyState["seats"] | null;
  audio: { current: GameAudio | null };
}) {
  const { role } = reveal;
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [clock, setClock] = useState("0:00");
  const [cleared, setCleared] = useState(false);
  const [summary, setSummary] = useState<{ ms: number; loot: number; lootTotal: number } | null>(
    null,
  );
  // the game is paused for a dropped seat; `until` is on this page's clock (the server says how long is left)
  const [pause, setPause] = useState<{
    waitingFor: string;
    until: number;
    choosing: boolean;
  } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [back, setBack] = useState<string | null>(null);
  const [hostNote, setHostNote] = useState<string | null>(null); // the host role passed to someone
  const hostSeen = useRef({ name: hostName, you: host });
  const [replaced, setReplaced] = useState<string | null>(null); // someone left and a bot took their seat
  const crewSeen = useRef(reveal.crew);
  const [caught, setCaught] = useState<string | null>(null); // why the team was just sent back
  const [touch, setTouch] = useState(false);
  const lastSent = useRef<string | null>(null);
  const [settings, setSettings] = useState<SettingsState>(() => loadSettings(role));
  const [lines, setLines] = useState<CaptionLine[]>([]);
  const [cues, setCues] = useState<string[]>([]);
  const [typing, setTyping] = useState(false);
  const live = useRef({ settings, lineId: 0 });
  live.current.settings = settings;
  rt.soundOn = settings.sound;

  function change(next: SettingsState) {
    setSettings(next);
    saveSettings(next);
  }

  // Everything a channel message does on arrival: speak it, play it, show it.
  useEffect(() => {
    const speech = browserSpeech(role, () => live.current.settings.speech);
    if (role !== "blind") preloadFaces();
    return socket.on("msg", (m) => {
      const now = performance.now();
      const { settings: s } = live.current;
      if (m.family === "say") {
        speech.say(m.kind === "callout" ? CALLOUT_WORD[m.callout] : m.text);
      } else if (m.family === "sound" && s.sound) {
        audio.current?.playClip(m.clip);
      } else if (m.family === "show" && m.kind === "face") {
        rt.pops.push({ seat: m.from.seat, id: m.id, at: now });
      }
      // text to Can't speak is always shown, since reading it is their only way
      const caption = captionFor(m);
      const wanted = s.captions || (m.family === "say" && m.kind === "text" && role !== "blind");
      if (caption && wanted) {
        const line = { id: ++live.current.lineId, ...caption, until: now + CAPTION_MS };
        setLines((old) => [...old.filter((l) => l.until > now), line].slice(-3));
      }
    });
  }, [socket, role, rt, audio]);

  useEffect(
    () =>
      socket.on("cleared", (m) => setSummary({ ms: m.ms, loot: m.loot, lootTotal: m.lootTotal })),
    [socket],
  );

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const offs = [
      socket.on("pause", (m) => {
        setBack(null);
        setPause({
          waitingFor: m.waitingFor,
          until: performance.now() + m.left,
          choosing: m.choosing,
        });
      }),
      socket.on("resume", (m) => {
        setPause(null);
        setBack(m.back);
        clearTimeout(timer);
        if (m.back) timer = setTimeout(() => setBack(null), 4000);
      }),
    ];
    return () => {
      for (const off of offs) off();
      clearTimeout(timer);
    };
  }, [socket]);

  // The host role passed to someone: say who, so nobody has to work it out from a button.
  useEffect(() => {
    const before = hostSeen.current;
    hostSeen.current = { name: hostName, you: host };
    const text = hostChangeText(before, hostSeen.current);
    if (!text) return;
    setHostNote(text);
    const timer = setTimeout(() => setHostNote(null), 6000);
    return () => clearTimeout(timer);
  }, [hostName, host]);

  // A person left the game and a bot took their seat: the crew changes under us, so say so.
  useEffect(() => {
    const before = crewSeen.current;
    crewSeen.current = reveal.crew;
    const gone = reveal.crew.find((c) => c.bot && before.some((b) => b.seat === c.seat && !b.bot));
    if (!gone) return;
    const who = before.find((b) => b.seat === gone.seat)?.nickname ?? "Someone";
    setReplaced(`${who} left the game. A bot took their seat.`);
    const timer = setTimeout(() => setReplaced(null), 6000);
    return () => clearTimeout(timer);
  }, [reveal.crew]);

  // The team was caught: say what got whom, in words on the screen for everyone and
  // spoken to Can't see, who has nothing else to go on (and in the dark, nor do the others).
  useEffect(() => {
    const speech = browserSpeech(role, () => live.current.settings.speech);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = socket.on("caught", (m) => {
      const text = caughtText(
        m,
        reveal.crew,
        reveal.crew.findIndex((c) => c.seat === rt.view?.you.seat),
      );
      setCaught(text);
      speech.say(text);
      clearTimeout(timer);
      timer = setTimeout(() => setCaught(null), 7000);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [socket, role, reveal.crew, rt]);

  useEffect(() => {
    if (!pause) return;
    const tick = () => setSecondsLeft((pause.until - performance.now()) / 1000);
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [pause]);

  // Restarts the room, not the heist: everyone back to this room's start. The
  // buttons that call it (ConfirmButton) have already asked twice.
  function restart() {
    lastSent.current = null;
    setSummary(null);
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
      const now = performance.now();
      rt.pops = rt.pops.filter((p) => now - p.at < FACE_POP_MS);
      setLines((old) => (old.some((l) => l.until <= now) ? old.filter((l) => l.until > now) : old));
      const heard = live.current.settings.captions ? heardCues(rt.cueHold, now) : [];
      setCues((old) => (old.join("|") === heard.join("|") ? old : heard));
    }, 100);
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
      const now = performance.now();
      const pops: FacePop[] = [];
      for (const p of rt.pops) {
        const img = faceImage(p.id);
        const left = FACE_POP_MS - (now - p.at);
        if (img && left > 0)
          pops.push({ seat: p.seat as 0 | 1 | 2, img, fade: Math.min(1, left / 300) });
      }
      const scene: Scene = {
        ...size,
        role,
        seat: view.you.seat,
        roles: reveal.crew.map((c) => c.role) as Scene["roles"],
        tiles: role === "blind" ? null : rt.tiles,
        entities: lerpEntities(rt.prevEntities, view.entities, t),
        self: rt.shown,
        layout: size.w >= 720 ? "fit" : "follow",
        pops,
        fx: rt.fx
          .filter((f) => now - f.at < FX_MS)
          .map((f) => ({ ...f.fx, age: (now - f.at) / FX_MS })),
        alarm: view.alarm,
        nowMs: now,
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
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
  const label = ROLE_LABEL[role];
  return (
    <div class="game" ref={root} style={{ "--frame": `var(--role-${role})` }}>
      <h1 class="sr-only">
        {reveal.name}: {label}
      </h1>
      <header class="hud-top">
        <span class="hud-role">
          <RoleShape role={role} size={20} />
          {label}
        </span>
        <span class="hud-room">{reveal.name}</span>
        <span class="hud-clock" role="timer" aria-label="Time">
          {clock}
        </span>
        <Connection state={state} rttMs={rttMs} />
        <Settings
          role={role}
          settings={settings}
          onChange={change}
          onLeave={() => socket.send({ t: "lobby.leave" })}
        />
        {host && (
          <ConfirmButton
            class="hud-btn"
            label="Restart room"
            confirmLabel="Sure? Restart room"
            onConfirm={restart}
          />
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

      {hostNote && (
        <p class="hud-alert" role="status">
          {hostNote}
        </p>
      )}

      {replaced && (
        <p class="hud-alert" role="status">
          {replaced}
        </p>
      )}

      {back && (
        <p class="hud-alert" role="status">
          {back} is back.
        </p>
      )}

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
        <Captions lines={lines} cues={cues} />
        {typing && (
          <span class="typing-badge" role="status">
            Typing
          </span>
        )}
        {cleared && (
          <RoomCleared
            ms={summary?.ms ?? rt.view?.elapsedMs ?? 0}
            loot={summary?.loot ?? 0}
            lootTotal={summary?.lootTotal ?? 0}
            last={reveal.index >= LAST_ROOM}
            host={host}
            onNext={() => socket.send({ t: "next" })}
            onRestart={restart}
          />
        )}
        {caught && (
          <p class="caught-banner" role="alert">
            {caught}
          </p>
        )}
        {pause && (
          <Disconnect
            waitingFor={pause.waitingFor}
            secondsLeft={secondsLeft}
            choosing={pause.choosing}
            host={host}
            onChoice={(choice) => socket.send({ t: "host.choice", choice })}
          />
        )}
        {!online && (
          <div class="overlay" role="alert">
            <h2>Lost connection</h2>
            <p>Retrying…</p>
          </div>
        )}
      </div>

      <Tray role={role} socket={socket} keepOpen={settings.keepOpen} onTyping={setTyping} />

      {touch ? (
        <TouchControls disabled={cleared} />
      ) : (
        <p class={cleared ? "keys is-off" : "keys"}>WASD or arrows move · Space acts</p>
      )}
    </div>
  );
}
