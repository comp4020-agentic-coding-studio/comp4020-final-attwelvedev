import { useEffect, useRef, useState } from "preact/hooks";
import { createAudio, type GameAudio } from "../client/audio.ts";
import { faceImage, preloadFaces } from "../client/faces.ts";
import { detectFx, FX_MAX, FX_MS, type Fx } from "../client/fx.ts";
import {
  CALLOUT_WORD,
  type CueCaption,
  captionFor,
  caughtText,
  crewChangeText,
  cueCaptions,
  cueKey,
  formatTime,
  type HeldCues,
  hearCues,
  heardCues,
  lerpEntities,
} from "../client/hud.ts";
import { createInput } from "../client/input.ts";
import { createPredictor, type Predictor } from "../client/predict.ts";
import {
  camera,
  draw,
  type FacePop,
  fromScreen,
  type Motion,
  type Scene,
} from "../client/render.ts";
import { loadSettings, type Settings as SettingsState, saveSettings } from "../client/settings.ts";
import type { ConnectionState, GameSocket } from "../client/socket.ts";
import { browserSpeech } from "../client/speech.ts";
import { NET, setContrast } from "../client/tokens.ts";
import { quickSlot } from "../client/wheel.ts";
import { FACE_POP_MS } from "../game/channels.ts";
import { botRef } from "../game/crew.ts";
import type { BriefingCue } from "../game/cues.ts";
import { ROLE_LABEL, type Role, type Seat, type Vec } from "../game/types.ts";
import type { CrewMember, LobbyState, RealLife, RoleView } from "../net/protocol.ts";
import { type CaptionLine, Captions } from "./Captions.tsx";
import { type CommsApi, CommsWheel } from "./CommsWheel.tsx";
import { Connection } from "./Connection.tsx";
import { Disconnect } from "./Disconnect.tsx";
import { HeistComplete } from "./HeistComplete.tsx";
import { HudMenu } from "./HudMenu.tsx";
import { RoleReveal } from "./RoleReveal.tsx";
import { RoleShape } from "./RoleShape.tsx";
import { RoomCleared } from "./RoomCleared.tsx";
import { Settings } from "./Settings.tsx";
import { TalkBar } from "./TalkBar.tsx";
import { TouchControls } from "./TouchControls.tsx";
import { useGone } from "./useGone.ts";
import { useHostNote } from "./useHostNote.ts";
import { usePause } from "./usePause.ts";
import { useVoice } from "./useVoice.ts";
import { type OpenVote, outcomeText, VotePrompt } from "./VotePrompt.tsx";

export interface Reveal {
  room: string;
  name: string; // the room's title, from its file
  index: number;
  role: Role;
  crew: CrewMember[];
  rooms: number; // how many rooms the heist has
  sittingOut: string[]; // nicknames of the people not playing this room
  played: Record<string, Role[]>; // by nickname: roles played so far
  real: RealLife; // what your setup means for you in this room
  cues: BriefingCue[]; // Can't see only: the sounds to learn
  from?: Role; // your role in the room before, so the shape can morph into the new one
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
  facing: Vec; // the way we last pushed: our own figure turns the moment the key goes down
  walking: { moving: boolean; blocked: boolean }; // what the last input did to the predicted position
  pops: { seat: number; id: string; at: number }[]; // faces on show, by when they landed
  cueHold: HeldCues; // cue captions and when to let each go
  fx: { fx: Fx; at: number }[]; // small effects for what just changed, by when they started
  soundOn: boolean;
  cam: { scale: number; ox: number; oy: number } | null; // the last frame's map camera, to turn a tap into a tile
}

const CAPTION_MS = 5000;
const SPAWN_FACING: Vec = { x: 1, y: 0 }; // everyone starts a room facing east (src/game/sim/world.ts)
const EASE = 0.5; // share of the gap to the predicted position closed each frame
const SNAP_TILES = 1.5;

// Draw every frame; the canvas is sized to its frame in device pixels. Shared by the reveal (the
// room behind the card) and the game, so both read the same runtime.
function useDraw(
  rt: Runtime,
  canvas: { current: HTMLCanvasElement | null },
  frame: { current: HTMLDivElement | null },
  role: Role,
  crew: CrewMember[],
) {
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
      if (!view || !el.isConnected) return; // the reveal's backdrop goes when the game starts
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
        roles: crew.map((c) => c.role) as Scene["roles"],
        tiles: role === "blind" ? null : rt.tiles,
        entities: lerpEntities(rt.prevEntities, view.entities, t),
        self: rt.shown,
        // Can't see is told whether they are walking or pushing (they hear it already); a sighted
        // role reads it off its own predicted position, which is ahead of the server
        own: ownMotion(rt, role),
        bots: crew.map((c) => !!c.bot) as Scene["bots"],
        layout: size.w >= 720 ? "fit" : "follow",
        pops,
        fx: rt.fx
          .filter((f) => now - f.at < FX_MS)
          .map((f) => ({ ...f.fx, age: (now - f.at) / FX_MS })),
        alarm: view.alarm,
        nowMs: now,
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      };
      rt.cam = camera(scene);
      draw(ctx, scene);
    };
    raf = requestAnimationFrame(frameLoop);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [rt, role, crew, canvas, frame]);
}

// How hard a held direction has to push to count as moving: under this share of the step, it is
// blocked (the server's rule is the same shape: "almost nowhere").
const BLOCKED_SHARE = 0.2;
const STEP_TILES = 4 / NET.inputHz; // SPEED_TPS in predict.ts, per input

function ownMotion(rt: Runtime, role: Role): Motion {
  const motion = role === "blind" ? rt.view?.you.motion : rt.walking;
  return { facing: rt.facing, moving: motion?.moving ?? false, blocked: motion?.blocked ?? false };
}

function onView(rt: Runtime, view: RoleView, audio: GameAudio): void {
  // the tick going backwards means the room was restarted: forget what we predicted
  if (rt.view && view.tick < rt.view.tick) {
    rt.predictor = null;
    rt.self = null;
    rt.shown = null;
    rt.facing = SPAWN_FACING;
    rt.walking = { moving: false, blocked: false };
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
  sitting,
  people,
  watching,
  early,
  onLeave,
}: {
  socket: GameSocket;
  state: ConnectionState;
  rttMs: number | null;
  online: boolean;
  early: { view: RoleView | null; ready: Seat[] }; // what the server sent between the reveal and this page drawing
  reveal: Reveal;
  host: boolean;
  hostName: string | null;
  seats: LobbyState["seats"] | null;
  sitting: { index: number; nickname: string }[]; // people sitting out, whom the host may pull in
  people: string[]; // nicknames by person index, so a swap named in the reveal is sent by index
  watching: string[]; // spectators' nicknames, listed in the crew column
  onLeave: () => void; // the menu's Leave: the lobby asks first, then leaves
}) {
  const rt = useRef<Runtime>({
    view: null,
    prevEntities: [],
    at: 0,
    tiles: null,
    predictor: null,
    self: null,
    shown: null,
    facing: SPAWN_FACING,
    walking: { moving: false, blocked: false },
    pops: [],
    fx: [],
    cueHold: new Map(),
    soundOn: true,
    cam: null,
  });
  const audio = useRef<GameAudio | null>(null);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [readySeats, setReadySeats] = useState<Seat[]>(early.ready); // who the server says is ready, bots included
  const stage = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLCanvasElement>(null);

  // Registered as soon as the reveal shows, so the first (full) view is never missed. The reveal
  // is sent a view of the room at tick 0 to draw behind its card; the game has started once a view
  // from a later tick arrives.
  useEffect(() => {
    audio.current = createAudio();
    // the view that came with the reveal, before this listener existed
    if (early.view && rt.current.view === null) {
      onView(rt.current, early.view, audio.current);
      if (early.view.tick > 0) setPlaying(true);
    }
    const off = socket.on("view", (m) => {
      if (audio.current) onView(rt.current, m.view, audio.current);
      if (m.view.tick > 0) setPlaying(true);
    });
    return () => {
      off();
      audio.current?.dispose();
      audio.current = null;
    };
  }, [socket, early]);

  // The server says who is ready, on every change. A swap clears everyone, so this page's own button
  // follows the server rather than its own memory.
  useEffect(
    () =>
      socket.on("ready", (m) => {
        setReadySeats(m.seats);
        setReady(m.seats.includes(reveal.crew.findIndex((c) => c.role === reveal.role) as Seat));
      }),
    [socket, reveal.crew, reveal.role],
  );

  // The reveal is full-bleed like the game: no site header or footer around the room behind it.
  useEffect(() => {
    document.body.classList.add("playing");
    return () => document.body.classList.remove("playing");
  }, []);

  // The room behind the card: the view sent with the reveal, drawn flat, until the first tick.
  useDraw(rt.current, backdrop, stage, reveal.role, reveal.crew);
  const watchers = watching.map((nickname, n) => ({ ref: -4 - n, nickname }));
  const gone = useGone(socket);
  const hostNote = useHostNote(hostName, host);
  const held = usePause(socket);
  const myName = reveal.crew.find((c) => c.role === reveal.role)?.nickname;

  if (!playing) {
    const me = (rt.current.view?.you.seat ??
      reveal.crew.findIndex((c) => c.role === reveal.role)) as Seat;
    return (
      <div class="reveal-frame" ref={stage}>
        <div class="reveal-canvas" aria-hidden="true">
          <canvas ref={backdrop} />
        </div>
        <div class="reveal-scrim" />
        {(gone || hostNote) && (
          <p class="hud-alert reveal-gone" role="status">
            {[gone, hostNote].filter(Boolean).join(" ")}
          </p>
        )}
        <RoleReveal
          {...reveal}
          me={me}
          ready={ready}
          readySeats={readySeats}
          host={host}
          watching={watching}
          audio={audio}
          onSwap={(a, b) => {
            // a person is their index in the lobby; a bot, who has no index, is named by its seat
            const ref = (name: string): number | null => {
              const at = people.indexOf(name);
              if (at >= 0) return at;
              const bot = reveal.crew.find((c) => c.bot && c.nickname === name);
              if (bot) return botRef(bot.seat);
              const watcher = watching.indexOf(name); // -4 - n: the nth spectator
              return watcher >= 0 ? -4 - watcher : null;
            };
            const first = ref(a);
            const second = ref(b);
            if (first !== null && second !== null) {
              socket.send({ t: "crew.swap", a: first, b: second });
            }
          }}
          onReady={(on) => {
            void audio.current?.resume(); // a tap is the browser's cue to let sound play
            setReady(on);
            socket.send(on ? { t: "ready" } : { t: "ready", on: false });
          }}
        />
        {held.pause?.forReady && held.pause.waitingFor === myName && (
          <p class="hud-alert reveal-gone" role="status">
            The game is waiting for you. Press I'm ready.
          </p>
        )}
        {held.pause && !held.pause.forReady && (
          <Disconnect
            waitingFor={held.pause.waitingFor}
            secondsLeft={held.secondsLeft}
            choosing={held.pause.choosing}
            host={host}
            sitting={sitting}
            watching={watchers}
            gone={held.pause.gone}
            forReady={held.pause.forReady}
            hostName={hostName}
            onChoice={(choice, person) =>
              socket.send({ t: "host.choice", choice, ...(person === undefined ? {} : { person }) })
            }
          />
        )}
      </div>
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
      sitting={sitting}
      watchers={watchers}
      audio={audio}
      onLeave={onLeave}
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
  sitting,
  watchers,
  audio,
  onLeave,
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
  sitting: { index: number; nickname: string }[];
  watchers: { ref: number; nickname: string }[]; // spectators the host may pull into an empty seat
  audio: { current: GameAudio | null };
  onLeave: () => void;
}) {
  const { role, real } = reveal;
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [clock, setClock] = useState("0:00");
  const [loot, setLoot] = useState(0);
  const [watchOpen, setWatchOpen] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [summary, setSummary] = useState<{ ms: number; loot: number; lootTotal: number } | null>(
    null,
  );
  const [heist, setHeist] = useState<{
    ms: number;
    loot: number;
    lootTotal: number;
    rank: number;
  } | null>(null);
  const { pause, secondsLeft, back } = usePause(socket);
  const [vote, setVote] = useState<OpenVote | null>(null); // a restart is being voted on
  const [voteLeft, setVoteLeft] = useState(0);
  const [voteNote, setVoteNote] = useState<string | null>(null); // how the last vote ended
  const [replaced, setReplaced] = useState<string | null>(null); // someone left and a bot took their seat
  const crewSeen = useRef(reveal.crew);
  const [caught, setCaught] = useState<string | null>(null); // why the team was just sent back
  const [touch, setTouch] = useState(false);
  const lastSent = useRef<string | null>(null);
  const [settings, setSettings] = useState<SettingsState>(() => loadSettings(role));
  const [lines, setLines] = useState<CaptionLine[]>([]);
  const [cues, setCues] = useState<CueCaption[]>([]);
  const [typing, setTyping] = useState(false);
  const [writing, setWriting] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const comms = useRef<CommsApi | null>(null);
  const voice = useVoice(socket, role, real.voice, root, settings.voiceMode);
  const goneNote = useGone(socket);
  // A hearing role without headphones gets captions instead of game sound, so the game's own
  // audio never leaks out to everyone sitting around them.
  const forceCaptions = real.soundOff;
  const live = useRef({ settings, lineId: 0, forceCaptions });
  live.current.settings = settings;
  live.current.forceCaptions = forceCaptions;
  rt.soundOn = settings.sound && !forceCaptions;

  // The tile centre under a client point, for placing a mark; `open` is false
  // for a wall (the server decides what is in sight).
  function toTile(clientX: number, clientY: number): { at: Vec; open: boolean } | null {
    const box = canvas.current?.getBoundingClientRect();
    const cam = rt.cam;
    const tiles = rt.tiles;
    if (!box || !cam || !tiles) return null;
    const floor = fromScreen(cam, clientX - box.left, clientY - box.top);
    const tx = Math.floor(floor.x);
    const ty = Math.floor(floor.y);
    const row = tiles[ty];
    if (row === undefined || tx < 0 || tx >= row.length) return null;
    return { at: { x: tx + 0.5, y: ty + 0.5 }, open: row[tx] !== "#" && row[tx] !== "%" };
  }

  function change(next: SettingsState) {
    setSettings(next);
    saveSettings(next);
  }

  useEffect(() => {
    setContrast(settings.highContrast);
    document.documentElement.dataset.contrast = settings.highContrast ? "high" : "";
    return () => {
      document.documentElement.removeAttribute("data-contrast");
      setContrast(false);
    };
  }, [settings.highContrast]);

  // The deaf seat's own masking noise: on when their setup says they have headphones, unless they
  // turned it off, at the volume they chose.
  const maskNoiseOn = real.maskNoise && settings.maskNoiseOn;
  useEffect(() => {
    audio.current?.setMaskNoise(maskNoiseOn, settings.volume);
  }, [audio, maskNoiseOn, settings.volume]);

  // Everything a channel message does on arrival: speak it, play it, show it.
  useEffect(() => {
    const speech = browserSpeech(role, () => live.current.settings.speech);
    if (role !== "blind") preloadFaces();
    return socket.on("msg", (m) => {
      const now = performance.now();
      const { settings: s, forceCaptions } = live.current;
      if (m.method === "callout" || m.method === "text") {
        speech.say(m.method === "callout" ? CALLOUT_WORD[m.callout] : m.text);
      } else if (m.method === "clip" && s.sound && !forceCaptions) {
        audio.current?.playClip(m.clip);
      } else if (m.method === "face") {
        rt.pops.push({ seat: m.from.seat, id: m.id, at: now });
      }
      // text to Can't speak is always shown, since reading it is their only way
      const caption = captionFor(m);
      const wanted = s.captions || forceCaptions || (m.method === "text" && role !== "blind");
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

  useEffect(
    () =>
      socket.on("heist", (m) =>
        setHeist({ ms: m.ms, loot: m.loot, lootTotal: m.lootTotal, rank: m.rank }),
      ),
    [socket],
  );

  // A restart vote: opened and updated by the server, ended with one line saying how. A passed one
  // has put everyone back at spawn, so what this page remembered of the room goes.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const offs = [
      socket.on("vote", (m) =>
        setVote((old) => ({
          kind: m.kind,
          by: m.by,
          until: performance.now() + m.left,
          // the first message of a vote carries all its time: later ones only what is left
          total: old && old.kind === m.kind && old.by === m.by ? old.total : m.left,
          yes: m.yes,
          no: m.no,
          voters: m.voters,
        })),
      ),
      socket.on("vote.end", (m) => {
        setVote(null);
        if (m.result === "passed") restarted();
        setVoteNote(outcomeText(m.kind, m.result, m.by));
        clearTimeout(timer);
        timer = setTimeout(() => setVoteNote(null), 3000);
      }),
    ];
    return () => {
      for (const off of offs) off();
      clearTimeout(timer);
    };
  }, [socket]);

  useEffect(() => {
    if (!vote) return;
    const tick = () => setVoteLeft((vote.until - performance.now()) / 1000);
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [vote]);

  const hostNote = useHostNote(hostName, host);
  const watching = [...sitting.map((p) => p.nickname), ...watchers.map((w) => w.nickname)];

  useEffect(() => {
    if (!watchOpen) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setWatchOpen(false);
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [watchOpen]);

  // A seat changed hands: a person left and a bot took it, or they came back. The crew changes
  // under us, so say so.
  useEffect(() => {
    const before = crewSeen.current;
    crewSeen.current = reveal.crew;
    const text = crewChangeText(before, reveal.crew);
    if (!text) return;
    setReplaced(text);
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

  // Asks for a restart: the others vote, and if everyone says yes the room (or the heist) starts
  // again. The buttons that call it (ConfirmButton) have already asked twice.
  function ask(kind: "room" | "heist") {
    socket.send({ t: "vote.propose", kind });
  }

  // A restart that passed puts everyone back at spawn: drop what this page remembered of the room.
  function restarted() {
    lastSent.current = null;
    setSummary(null);
  }

  useEffect(() => {
    document.body.classList.add("playing");
    setTouch(matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0);
    const tick = setInterval(() => {
      const view = rt.view;
      if (!view) return;
      setClock(formatTime(view.elapsedMs));
      setLoot(view.loot);
      setCleared(view.status === "cleared");
      const now = performance.now();
      rt.pops = rt.pops.filter((p) => now - p.at < FACE_POP_MS);
      setLines((old) => (old.some((l) => l.until <= now) ? old.filter((l) => l.until > now) : old));
      // Can't hear is never given a sound caption: nothing is played to them to caption
      const heard =
        role !== "deaf" && (live.current.settings.captions || live.current.forceCaptions)
          ? heardCues(rt.cueHold, now)
          : [];
      setCues((old) => (cueKey(old) === cueKey(heard) ? old : heard));
    }, 100);
    return () => {
      document.body.classList.remove("playing");
      clearInterval(tick);
    };
  }, [rt]);

  useDraw(rt, canvas, frame, role, reveal.crew);

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
      if (moving) rt.facing = input.move;
      else rt.walking = { moving: false, blocked: false };
      const sig = `${input.move.x},${input.move.y},${input.act}`;
      if (!moving && sig === lastSent.current) return;
      lastSent.current = sig;
      socket.send({ t: "input", ...input });
      if (moving && rt.predictor) {
        const from = rt.self;
        rt.self = rt.predictor.apply(input, 1000 / NET.inputHz);
        const moved = from ? Math.hypot(rt.self.x - from.x, rt.self.y - from.y) : STEP_TILES;
        rt.walking = { moving: true, blocked: moved < STEP_TILES * BLOCKED_SHARE };
      } else if (moving) rt.walking = { moving: true, blocked: false };
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
  // each role appears once in a crew, so the seat that has this page's role is this page's seat
  const me = reveal.crew.find((c) => c.role === role)?.seat ?? 0;
  const label = ROLE_LABEL[role];
  return (
    <div class="game" ref={root} style={{ "--frame": `var(--role-${role})` }}>
      <h1 class="sr-only">
        {reveal.name}: {label}
      </h1>
      <header class="hud-top">
        <ul class="hud-crew" aria-label="Your team">
          {reveal.crew.map((c) => (
            <li key={c.seat} class={c.seat === rt.view?.you.seat ? "you" : undefined}>
              <RoleShape role={c.role} size={16} />
              <span class="hud-who">
                {c.nickname}
                {presence[c.seat] ? ` (${presence[c.seat]})` : ""}
              </span>
              {c.seat === rt.view?.you.seat && <span class="hud-tag">you</span>}
              {c.bot && <span class="hud-tag">bot</span>}
              {voice.speaking.has(c.seat) && <span class="talking hud-tag">talking</span>}
              <span class="sr-only">, {ROLE_LABEL[c.role]}</span>
            </li>
          ))}
        </ul>
        <span class="hud-clock" role="timer" aria-label="Time">
          {clock}
        </span>
        <span class="hud-loot" role="img" aria-label={`Loot ${loot}`}>
          <span aria-hidden="true">◆ {loot}</span>
        </span>
        <Connection state={state} rttMs={rttMs} />
        <span class="hud-watching">
          <button
            type="button"
            class="hud-btn"
            aria-expanded={watchOpen}
            aria-controls="hud-watching"
            disabled={watching.length === 0}
            hidden={watching.length === 0}
            onClick={() => setWatchOpen(!watchOpen)}
          >
            {watching.length} watching
          </button>
          {watchOpen && watching.length > 0 && (
            <ul class="hud-watching-list" id="hud-watching" aria-label="Watching">
              {watching.map((name, n) => (
                <li key={`${n}:${name}`}>{name}</li>
              ))}
            </ul>
          )}
        </span>
        <HudMenu
          onAsk={ask}
          onLeave={onLeave}
          settings={
            <Settings
              role={role}
              settings={settings}
              onChange={change}
              maskNoiseAvailable={real.maskNoise}
              othersSoundOff={real.soundOff}
              voiceOn={real.voice}
            />
          }
        />
      </header>

      {role === "blind" && <p class="hud-hint">No map. Listen.</p>}

      {voice.lagging && (
        <p class="hud-alert" role="status">
          Voice lagging
        </p>
      )}

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

      {goneNote && (
        <p class="hud-alert" role="status">
          {goneNote}
        </p>
      )}

      {back && (
        <p class="hud-alert" role="status">
          {back} is back.
        </p>
      )}

      {voteNote && (
        <p class="hud-alert" role="status">
          {voteNote}
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
        <CommsWheel
          role={role}
          me={me}
          crew={reveal.crew}
          socket={socket}
          quick={settings.quick}
          voice={voice}
          api={comms}
          typing={typing}
          toTile={toTile}
          onPin={(id) => change({ ...settings, quick: id })}
          onText={() => {
            if (role === "mute") return;
            setWriting(true);
            setTimeout(() => field.current?.focus(), 0);
          }}
          onClose={() => setWriting(false)}
          onOwnFace={(id) => {
            // Can't see has no map, so there is no character to put it over
            if (role !== "blind") rt.pops.push({ seat: me, id, at: performance.now() });
          }}
        />
        {typing && (
          <span class="typing-badge" role="status">
            Typing
          </span>
        )}
        {heist ? (
          <HeistComplete
            ms={heist.ms}
            loot={heist.loot}
            lootTotal={heist.lootTotal}
            rank={heist.rank}
          />
        ) : (
          cleared && (
            <RoomCleared
              ms={summary?.ms ?? rt.view?.elapsedMs ?? 0}
              loot={summary?.loot ?? 0}
              lootTotal={summary?.lootTotal ?? 0}
              last={reveal.index >= reveal.rooms - 1}
              host={host}
              onNext={() => socket.send({ t: "next" })}
              onRestart={() => ask("room")}
              onRestartHeist={() => ask("heist")}
            />
          )
        )}
        {caught && (
          <p class="caught-banner" role="alert">
            {caught}
          </p>
        )}
        {vote && (
          <VotePrompt
            vote={vote}
            seat={me as Seat}
            crew={reveal.crew}
            secondsLeft={voteLeft}
            onCast={(yes) => socket.send({ t: "vote.cast", yes })}
          />
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
        {!online && (
          <div class="overlay" role="alert">
            <h2>Lost connection</h2>
            <p>Retrying…</p>
          </div>
        )}
      </div>

      <TalkBar
        role={role}
        voice={voice}
        writing={writing}
        field={field}
        onWrite={() => {
          setWriting(true);
          setTimeout(() => field.current?.focus(), 0);
        }}
        onText={(text) => {
          if (text.trim() === "") return;
          socket.send({ t: "send", msg: { method: "text", text } });
          setWriting(false);
        }}
        onFocus={setTyping}
        onComms={touch ? undefined : () => comms.current?.toggle()}
        commsDisabled={cleared}
      />

      {touch ? (
        <TouchControls
          disabled={cleared}
          comms={comms}
          quickLabel={quickSlot(role, settings.quick).name}
        />
      ) : (
        <p class={cleared ? "keys is-off" : "keys"}>WASD or arrows move · Space acts</p>
      )}
    </div>
  );
}
